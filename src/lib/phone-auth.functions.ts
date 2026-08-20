import { createServerFn } from "@tanstack/react-start";

import {
  CAPABILITY_DISABLED,
  derivePhoneAuthCapability,
  type AuthSettingsSnapshot,
  type PhoneAuthCapability,
} from "./phone-auth";

/**
 * Capability do acesso passwordless — decidida SEMPRE no servidor.
 *
 * Duas fontes combinadas:
 *  1. configuração pública de auth do backend (provedor de telefone ligado?
 *     qual provedor de SMS?);
 *  2. flags de ambiente do servidor (WhatsApp habilitado, remetente
 *     configurado, canal preferido, envio simultâneo).
 *
 * Nenhuma credencial trafega para o cliente: devolvemos apenas quais canais
 * estão realmente utilizáveis. Se nada estiver configurado, o fallback por
 * código de recuperação continua sendo a via de acesso.
 */
let cached: { at: number; value: PhoneAuthCapability } | null = null;
const CAPABILITY_TTL_MS = 60_000;

/** Exposto para testes: limpa o cache em memória do worker. */
export function __resetPhoneAuthCapabilityCache() {
  cached = null;
}

export const getPhoneAuthCapability = createServerFn({ method: "GET" }).handler(
  async (): Promise<PhoneAuthCapability> => {
    const now = Date.now();
    if (cached && now - cached.at < CAPABILITY_TTL_MS) return cached.value;

    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!url || !key) return CAPABILITY_DISABLED;

    let value: PhoneAuthCapability;
    try {
      const res = await fetch(`${url}/auth/v1/settings`, {
        headers: { apikey: key },
        signal: AbortSignal.timeout(5_000),
      });
      if (res.ok) {
        const json = (await res.json()) as AuthSettingsSnapshot;
        value = derivePhoneAuthCapability(json, process.env as Record<string, string | undefined>);
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
