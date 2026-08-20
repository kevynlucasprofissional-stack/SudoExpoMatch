import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  createAttemptLimiter,
  limiterKey,
  mapClaimError,
  mapOtpError,
  maskPhone,
  normalizeOtpCode,
  normalizePhoneToE164,
  translatePhoneAuthError,
  GENERIC_REQUEST_MESSAGE,
  CAPABILITY_DISABLED,
} from "@/lib/phone-auth";

const read = (p: string) => readFileSync(p, "utf8");

describe("normalização de telefone", () => {
  it("aceita formatos nacionais e converte para E.164", () => {
    for (const raw of ["(64) 99999-9999", "64999999999", "+55 64 99999-9999", "55 64 99999 9999"]) {
      const r = normalizePhoneToE164(raw);
      expect(r.ok, raw).toBe(true);
      if (r.ok) expect(r.e164).toBe("+5564999999999");
    }
  });

  it("aceita fixo de 10 dígitos", () => {
    const r = normalizePhoneToE164("(64) 3333-4444");
    expect(r.ok && r.e164).toBe("+556433334444");
  });

  it("rejeita vazio, curto, longo e lixo", () => {
    expect(normalizePhoneToE164("")).toEqual({ ok: false, reason: "empty" });
    expect(normalizePhoneToE164("123")).toMatchObject({ ok: false });
    expect(normalizePhoneToE164("1".repeat(20))).toEqual({ ok: false, reason: "too_long" });
    expect(normalizePhoneToE164("drop table")).toEqual({ ok: false, reason: "invalid" });
    expect(normalizePhoneToE164(null)).toEqual({ ok: false, reason: "invalid" });
  });

  it("mascara telefone preservando só 4 dígitos", () => {
    expect(maskPhone("+5564999998888")).toBe("••••8888");
    expect(maskPhone("12")).toBe("••••");
  });

  it("chave de rate limit nunca contém o telefone", () => {
    const key = limiterKey("+5564999998888");
    expect(key).not.toContain("5564999998888");
    expect(key).not.toContain("9888");
    expect(limiterKey("+5564999998888")).toBe(key);
    expect(limiterKey("+5564999997777")).not.toBe(key);
  });
});

describe("OTP", () => {
  it("aceita apenas 6 dígitos", () => {
    expect(normalizeOtpCode("123 456")).toEqual({ ok: true, code: "123456" });
    expect(normalizeOtpCode("12345")).toEqual({ ok: false });
    expect(normalizeOtpCode("1234567")).toEqual({ ok: false });
    expect(normalizeOtpCode(undefined)).toEqual({ ok: false });
  });

  it("mapeia erros do provedor sem vazar detalhes", () => {
    expect(mapOtpError("Unsupported phone provider", "request")).toBe("otp_unavailable");
    expect(mapOtpError("Token has expired", "verify")).toBe("expired_code");
    expect(mapOtpError("Invalid token", "verify")).toBe("invalid_code");
    expect(mapOtpError("429 too many requests", "request")).toBe("rate_limited");
    expect(translatePhoneAuthError("otp_unavailable")).toContain("código pessoal");
  });
});

describe("anti-enumeração", () => {
  it("mensagem de solicitação é genérica", () => {
    expect(GENERIC_REQUEST_MESSAGE).not.toMatch(/cadastr|encontrad|existe/i);
  });

  it("erros de claim não revelam existência de cadastro", () => {
    expect(mapClaimError("claim_failed")).toBe("claim_failed");
    expect(mapClaimError("profile not_found")).toBe("claim_failed");
    expect(translatePhoneAuthError("claim_failed")).not.toMatch(/não existe|não encontrado|não cadastrado/i);
  });

  it("distingue conflito de titularidade e rate limit", () => {
    expect(mapClaimError("current_user_already_has_profile")).toBe("current_user_already_has_profile");
    expect(mapClaimError("rate_limited")).toBe("rate_limited");
    expect(mapClaimError("phone_not_verified")).toBe("phone_not_verified");
  });
});

describe("rate limit / brute force", () => {
  it("bloqueia após o máximo e libera após a janela", () => {
    let now = 0;
    const limiter = createAttemptLimiter(3, 1000, () => now);
    const k = "k";
    for (let i = 0; i < 3; i += 1) {
      expect(limiter.check(k).allowed).toBe(true);
      limiter.record(k);
    }
    expect(limiter.check(k).allowed).toBe(false);
    now = 1500;
    expect(limiter.check(k).allowed).toBe(true);
  });

  it("reset limpa o histórico após sucesso", () => {
    const limiter = createAttemptLimiter(1, 10_000);
    limiter.record("a");
    expect(limiter.check("a").allowed).toBe(false);
    limiter.reset("a");
    expect(limiter.check("a").allowed).toBe(true);
  });
});

describe("capability e fallback", () => {
  it("padrão desabilitado mantém código de recuperação", () => {
    expect(CAPABILITY_DISABLED.otpEnabled).toBe(false);
    expect(CAPABILITY_DISABLED.recoveryCodeFallback).toBe(true);
  });

  it("capability é resolvida no servidor lendo a config de auth", () => {
    const src = read("src/lib/phone-auth.functions.ts");
    expect(src).toContain("createServerFn");
    expect(src).toContain("/auth/v1/settings");
    expect(src).toContain("CAPABILITY_DISABLED");
  });

  it("UI só mostra OTP quando habilitado", () => {
    const card = read("src/features/access/WhatsappAccessCard.tsx");
    expect(card).toContain("if (!capability.otpEnabled) return null;");
    const view = read("src/features/participant/components/RecoveryView.tsx");
    expect(view).toContain("capability.otpEnabled");
    // fallback antigo preservado
    expect(view).toContain("Código pessoal");
    expect(view).toContain("useRecoverProfile");
  });
});

describe("anti-spoofing e PII", () => {
  it("claim não envia telefone ao backend", () => {
    const api = read("src/features/access/api.ts");
    const claim = api.slice(api.indexOf("claimProfileByVerifiedPhone"));
    expect(claim).toContain("_event_id: eventId");
    expect(claim).not.toContain("phone: ");
    expect(claim).not.toContain("_phone:");
  });

  it("nenhum telefone ou OTP é persistido em storage", () => {
    for (const f of [
      "src/features/access/api.ts",
      "src/features/access/WhatsappAccessCard.tsx",
      "src/lib/phone-auth.ts",
    ]) {
      const src = read(f);
      expect(src).not.toContain("localStorage");
      expect(src).not.toContain("sessionStorage");
      expect(src).not.toContain("console.log");
    }
  });

  it("não cria sistema de notificações", () => {
    const api = read("src/features/access/api.ts");
    expect(api).not.toMatch(/supabase\.functions|sendMessage|notify\(/i);
    expect(api).toContain("signInWithOtp");
  });
});
