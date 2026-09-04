import { supabase } from "@/integrations/supabase/client";
import { ensureParticipantSession } from "@/features/participant/session";
import { normalizePhoneToE164 } from "@/lib/phone-auth";

/**
 * Acesso sem senha e sem código: o participante informa o WhatsApp, confirma
 * que é ele e entra. O número NUNCA é persistido no cliente (sem storage,
 * sem URL, sem log) e o backend só devolve nome abreviado + empresa antes da
 * confirmação.
 */
export type PhoneLoginErrorCode =
  | "invalid_phone"
  | "rate_limited"
  | "not_found"
  | "already_has_profile"
  | "event_not_active"
  | "network"
  | "unknown";

export class PhoneLoginError extends Error {
  readonly code: PhoneLoginErrorCode;
  constructor(code: PhoneLoginErrorCode) {
    super(code);
    this.code = code;
    this.name = "PhoneLoginError";
  }
}

export function mapPhoneLoginError(message: string | undefined): PhoneLoginErrorCode {
  const m = message ?? "";
  if (m.includes("rate_limited")) return "rate_limited";
  if (m.includes("invalid_phone")) return "invalid_phone";
  if (m.includes("current_user_already_has_profile")) return "already_has_profile";
  if (m.includes("event_not_active")) return "event_not_active";
  if (m.includes("claim_failed")) return "not_found";
  if (/network|fetch/i.test(m)) return "network";
  return "unknown";
}

export function translatePhoneLoginError(code: PhoneLoginErrorCode): string {
  switch (code) {
    case "invalid_phone":
      return "Número inválido. Digite com DDD, por exemplo (64) 99999-9999.";
    case "rate_limited":
      return "Muitas tentativas. Aguarde alguns minutos e tente de novo.";
    case "not_found":
      return "Não encontramos cadastro com esse WhatsApp.";
    case "already_has_profile":
      return "Este aparelho já está ligado a outro perfil. Fale com a equipe da ACIRV.";
    case "event_not_active":
      return "O evento não está ativo no momento.";
    case "network":
      return "Sem conexão. Verifique sua internet e tente novamente.";
    default:
      return "Não foi possível entrar agora. Tente novamente.";
  }
}

export interface PhoneLookupResult {
  found: boolean;
  displayName?: string;
  company?: string;
}

export async function lookupProfileByPhone(
  eventId: string,
  rawPhone: string,
): Promise<PhoneLookupResult> {
  const norm = normalizePhoneToE164(rawPhone);
  if (!norm.ok) throw new PhoneLoginError("invalid_phone");
  await ensureParticipantSession();
  const { data, error } = await supabase.rpc("lookup_profile_by_phone", {
    _event_id: eventId,
    _phone_e164: norm.e164,
  });
  if (error) throw new PhoneLoginError(mapPhoneLoginError(error.message));
  const row = (data ?? {}) as { found?: boolean; display_name?: string; company?: string };
  return {
    found: Boolean(row.found),
    displayName: row.display_name,
    company: row.company,
  };
}

export async function claimProfileByPhone(
  eventId: string,
  rawPhone: string,
): Promise<{ profileId: string; claimed: boolean }> {
  const norm = normalizePhoneToE164(rawPhone);
  if (!norm.ok) throw new PhoneLoginError("invalid_phone");
  await ensureParticipantSession();
  const { data, error } = await supabase.rpc("claim_profile_by_phone_simple", {
    _event_id: eventId,
    _phone_e164: norm.e164,
  });
  if (error) throw new PhoneLoginError(mapPhoneLoginError(error.message));
  const row = Array.isArray(data) ? data[0] : null;
  if (!row?.profile_id) throw new PhoneLoginError("not_found");
  return { profileId: row.profile_id, claimed: Boolean(row.claimed) };
}
