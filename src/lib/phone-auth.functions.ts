import { createServerFn } from "@tanstack/react-start";

import { CAPABILITY_DISABLED, type PhoneAuthCapability } from "./phone-auth";

/**
 * Detecção de capacidade do ambiente: o acesso por OTP só é oferecido quando a
 * camada de autenticação realmente tem provedor de telefone habilitado.
 * Nunca introduz provedor pago nem credencial externa — apenas lê a
 * configuração pública de auth do próprio backend.
 */
let cached: { at: number; value: PhoneAuthCapability } | null = null;
const CAPABILITY_TTL_MS = 60_000;

export const getPhoneAuthCapability = createServerFn({ method: "GET" }).handler(
  async (): Promise<PhoneAuthCapability> => {
    const now = Date.now();
    if (cached && now - cached.at < CAPABILITY_TTL_MS) return cached.value;

    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!url || !key) return CAPABILITY_DISABLED;

    let value: PhoneAuthCapability = CAPABILITY_DISABLED;
    try {
      const res = await fetch(`${url}/auth/v1/settings`, {
        headers: { apikey: key },
        signal: AbortSignal.timeout(5_000),
      });
      if (res.ok) {
        const json = (await res.json()) as { external?: { phone?: boolean } };
        value = json.external?.phone
          ? { otpEnabled: true, channels: ["sms"], recoveryCodeFallback: true }
          : CAPABILITY_DISABLED;
      } else {
        value = { ...CAPABILITY_DISABLED, reason: "unknown" };
      }
    } catch {
      value = { ...CAPABILITY_DISABLED, reason: "unknown" };
    }

    cached = { at: now, value };
    return value;
  },
);
