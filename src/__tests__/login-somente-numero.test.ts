import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  mapPhoneLoginError,
  translatePhoneLoginError,
} from "@/features/access/phoneLogin";
import { normalizePhoneToE164 } from "@/lib/phone-auth";
import {
  PHONE_LOGIN_MAX,
  PHONE_LOGIN_WINDOW_MS,
} from "@/features/access/PhoneLoginCard";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("entrada só com o número", () => {
  it("normaliza número nacional para E.164", () => {
    const r = normalizePhoneToE164("(64) 98163-0978");
    expect(r.ok && r.e164).toBe("+5564981630978");
  });

  it("traduz erros do backend para mensagens de usuário", () => {
    expect(mapPhoneLoginError("claim_failed")).toBe("not_found");
    expect(mapPhoneLoginError("rate_limited")).toBe("rate_limited");
    expect(mapPhoneLoginError("current_user_already_has_profile")).toBe("already_has_profile");
    expect(translatePhoneLoginError("not_found")).toMatch(/não encontramos/i);
  });

  it("limite local espelha o do banco (5 / 15 min)", () => {
    expect(PHONE_LOGIN_MAX).toBe(5);
    expect(PHONE_LOGIN_WINDOW_MS).toBe(15 * 60 * 1000);
  });

  it("cartão tem as duas fases e não persiste o número", () => {
    const src = read("src/features/access/PhoneLoginCard.tsx");
    expect(src).toMatch(/lookupProfileByPhone/);
    expect(src).toMatch(/claimProfileByPhone/);
    expect(src).toMatch(/Sim, sou eu/);
    expect(src).not.toMatch(/localStorage|sessionStorage|document\.cookie/);
    expect(src).not.toMatch(/console\.(log|info|warn|error)/);
  });
});
