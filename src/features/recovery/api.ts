import { supabase } from "@/integrations/supabase/client";
import { ensureParticipantSession } from "@/features/participant/session";
import { ApiError, extractErrorCode } from "@/features/participant/api";
import type {
  RecoverProfileInput,
  RecoverProfileResult,
  ErrorCode,
} from "@/features/participant/types";
import { recoverProfileResponseSchema } from "./schemas";

/**
 * Traduz códigos sanitizados de recuperação para mensagens em português.
 * Cobre TODOS os códigos possíveis do backend + fallback de rede.
 */
export function translateRecoverErrorCode(code: ErrorCode): string {
  switch (code) {
    case "not_found":
    case "invalid_code":
    case "no_recovery":
      return "Não encontramos um perfil com esses dados. Verifique o WhatsApp e o código.";
    case "locked":
      return "Muitas tentativas com código errado. Aguarde 15 minutos e tente novamente.";
    case "rate_limited":
      return "Muitas tentativas de recuperação. Aguarde alguns minutos e tente novamente.";
    case "demo_not_recoverable":
      return "Este perfil é uma demonstração e não pode ser recuperado.";
    case "current_user_already_has_profile":
      return "Sua sessão atual já tem outro perfil. Abra em um contexto novo ou saia primeiro.";
    case "recovery_not_configured":
      return "Este perfil não tem código de recuperação configurado.";
    case "not_authenticated":
    case "sign_in_failed":
      return "Não foi possível iniciar sessão. Recarregue a página.";
    case "event_not_active":
      return "O evento não está ativo.";
    case "invalid_input":
      return "WhatsApp ou código inválido.";
    case "network":
      return "Sem conexão com o servidor. Verifique sua internet e tente novamente.";
    default:
      return "Não foi possível recuperar. Tente novamente.";
  }
}

export async function recoverProfile(
  input: RecoverProfileInput,
): Promise<RecoverProfileResult> {
  await ensureParticipantSession();
  const { data, error } = await supabase.rpc("recover_profile_v2", {
    _event_id: input.eventId,
    _phone_e164: input.whatsapp,
    _code: input.code,
  });
  if (error) throw new ApiError(extractErrorCode(error.message));
  const parsed = recoverProfileResponseSchema.safeParse(data);
  if (!parsed.success) throw new ApiError("invalid_response");
  const row = parsed.data[0];
  return {
    profileId: row.profile_id,
    newRecoveryCode: row.new_recovery_code,
  };
}
