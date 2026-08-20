import { describe, expect, it } from "vitest";

import {
  channelLabel,
  derivePhoneAuthCapability,
  fallbackChannel,
  mapClaimError,
  mapOtpError,
  maskPhone,
  normalizeOtpCode,
  normalizePhoneToE164,
  otherChannel,
  requestSentMessage,
  resolveChannel,
  shouldOfferChannelSwitch,
  translatePhoneAuthError,
  type AuthSettingsSnapshot,
  type PhoneAuthCapability,
} from "@/lib/phone-auth";

const ON: AuthSettingsSnapshot = { external: { phone: true }, sms_provider: "twilio" };

describe("capability multicanal (server-side)", () => {
  it("provedor desligado não anuncia nenhum canal", () => {
    const cap = derivePhoneAuthCapability({ external: { phone: false }, sms_provider: "twilio" }, {
      PHONE_OTP_WHATSAPP_ENABLED: "true",
    });
    expect(cap).toMatchObject({ otpEnabled: false, channels: [], reason: "provider_disabled" });
  });

  it("settings ausentes => desabilitado por motivo desconhecido", () => {
    expect(derivePhoneAuthCapability(null)).toMatchObject({ otpEnabled: false, reason: "unknown" });
  });

  it("sem flag de WhatsApp anuncia apenas SMS", () => {
    const cap = derivePhoneAuthCapability(ON, {});
    expect(cap.channels).toEqual(["sms"]);
    expect(cap.preferredChannel).toBe("sms");
  });

  it("WhatsApp habilitado vira canal recomendado e vem primeiro", () => {
    const cap = derivePhoneAuthCapability(ON, { PHONE_OTP_WHATSAPP_ENABLED: "true" });
    expect(cap.channels).toEqual(["whatsapp", "sms"]);
    expect(cap.preferredChannel).toBe("whatsapp");
  });

  it("remetente configurado habilita WhatsApp sem flag explícita", () => {
    const cap = derivePhoneAuthCapability(ON, { TWILIO_WHATSAPP_FROM: "+5511999999999" });
    expect(cap.channels).toContain("whatsapp");
  });

  it("provedor sem suporte a WhatsApp nunca anuncia WhatsApp", () => {
    const cap = derivePhoneAuthCapability(
      { external: { phone: true }, sms_provider: "vonage" },
      { PHONE_OTP_WHATSAPP_ENABLED: "true" },
    );
    expect(cap.channels).toEqual(["sms"]);
  });

  it("SMS pode ser desligado deixando só WhatsApp", () => {
    const cap = derivePhoneAuthCapability(ON, {
      PHONE_OTP_WHATSAPP_ENABLED: "true",
      PHONE_OTP_SMS_ENABLED: "false",
    });
    expect(cap.channels).toEqual(["whatsapp"]);
    expect(fallbackChannel(cap, "whatsapp")).toBeNull();
  });

  it("ambos indisponíveis => desabilitado com no_channel_configured", () => {
    const cap = derivePhoneAuthCapability(ON, {
      PHONE_OTP_SMS_ENABLED: "false",
      PHONE_OTP_CHANNELS: "whatsapp",
    });
    expect(cap.otpEnabled).toBe(false);
    expect(cap.reason).toBe("no_channel_configured");
    expect(cap.recoveryCodeFallback).toBe(true);
  });

  it("PHONE_OTP_CHANNELS só restringe, nunca amplia", () => {
    const cap = derivePhoneAuthCapability(ON, { PHONE_OTP_CHANNELS: "whatsapp,sms" });
    expect(cap.channels).toEqual(["sms"]);
  });

  it("envio simultâneo é desligado por padrão e configurável", () => {
    expect(derivePhoneAuthCapability(ON, {}).allowSimultaneous).toBe(false);
    expect(
      derivePhoneAuthCapability(ON, { PHONE_OTP_ALLOW_SIMULTANEOUS: "true" }).allowSimultaneous,
    ).toBe(true);
  });

  it("criação de identidade permanece ligada por padrão", () => {
    expect(derivePhoneAuthCapability(ON, {}).createUserOnRequest).toBe(true);
    expect(
      derivePhoneAuthCapability(ON, { PHONE_OTP_SHOULD_CREATE_USER: "0" }).createUserOnRequest,
    ).toBe(false);
  });
});

describe("seleção e troca de canal", () => {
  const both = derivePhoneAuthCapability(ON, { PHONE_OTP_WHATSAPP_ENABLED: "true" });
  const smsOnly = derivePhoneAuthCapability(ON, {});

  it("resolve o canal pedido quando disponível", () => {
    expect(resolveChannel(both, "sms")).toBe("sms");
    expect(resolveChannel(both, "whatsapp")).toBe("whatsapp");
  });

  it("cai no recomendado quando o pedido não existe", () => {
    expect(resolveChannel(smsOnly, "whatsapp")).toBe("sms");
  });

  it("capability desabilitada não resolve canal", () => {
    const off: PhoneAuthCapability = derivePhoneAuthCapability({ external: { phone: false } }, {});
    expect(resolveChannel(off, "sms")).toBeNull();
  });

  it("troca WhatsApp <-> SMS", () => {
    expect(otherChannel("whatsapp")).toBe("sms");
    expect(otherChannel("sms")).toBe("whatsapp");
    expect(fallbackChannel(both, "whatsapp")).toBe("sms");
    expect(fallbackChannel(both, "sms")).toBe("whatsapp");
    expect(fallbackChannel(smsOnly, "sms")).toBeNull();
  });

  it("rotula canais para a UI", () => {
    expect(channelLabel("whatsapp")).toBe("WhatsApp");
    expect(channelLabel("sms")).toBe("SMS");
  });
});

describe("mensagens e anti-enumeração", () => {
  it("informa canal e máscara sem revelar cadastro", () => {
    const wa = requestSentMessage("whatsapp", "+5564999991234");
    const sms = requestSentMessage("sms", "+5564999991234");
    expect(wa).toContain("pelo WhatsApp");
    expect(sms).toContain("por SMS");
    expect(wa).toContain("••••1234");
    expect(wa).toContain("Se este número");
    expect(wa).not.toMatch(/cadastr|perfil|encontrado/i);
    expect(wa).not.toContain("+5564999991234");
  });

  it("máscara nunca expõe o número completo", () => {
    expect(maskPhone("+5564999991234")).toBe("••••1234");
    expect(maskPhone("12")).toBe("••••");
  });

  it("erro de claim é genérico", () => {
    expect(mapClaimError("claim_failed: not_found")).toBe("claim_failed");
    expect(translatePhoneAuthError("claim_failed")).not.toMatch(/existe|cadastr/i);
  });
});

describe("erros do provedor", () => {
  it("provedor desabilitado", () => {
    expect(mapOtpError("phone_provider_disabled", "request")).toBe("otp_unavailable");
  });
  it("falha específica de canal oferece o outro canal", () => {
    const code = mapOtpError("Twilio error 63007: whatsapp sender not found", "request");
    expect(code).toBe("channel_unavailable");
    expect(shouldOfferChannelSwitch(code)).toBe(true);
  });
  it("rate limit e código expirado/incorreto", () => {
    expect(mapOtpError("429 too many requests", "request")).toBe("rate_limited");
    expect(mapOtpError("Token has expired", "verify")).toBe("expired_code");
    expect(mapOtpError("Invalid token", "verify")).toBe("invalid_code");
  });
  it("rate limit não sugere troca de canal", () => {
    expect(shouldOfferChannelSwitch("rate_limited")).toBe(false);
    expect(shouldOfferChannelSwitch("invalid_code")).toBe(false);
  });
});

describe("entrada normalizada", () => {
  it("E.164 brasileiro", () => {
    expect(normalizePhoneToE164("(64) 99999-1234")).toEqual({
      ok: true,
      e164: "+5564999991234",
      digits: "5564999991234",
    });
    expect(normalizePhoneToE164("abc").ok).toBe(false);
  });
  it("OTP de 6 dígitos", () => {
    expect(normalizeOtpCode("12 34 56")).toEqual({ ok: true, code: "123456" });
    expect(normalizeOtpCode("123").ok).toBe(false);
  });
});
