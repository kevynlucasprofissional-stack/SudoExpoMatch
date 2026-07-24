import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ensureAnonSession } from "./session";

export interface RecoverProfileInput {
  eventId: string;
  whatsapp: string;
  code: string;
}
export interface RecoverProfileResult {
  profileId: string;
  newRecoveryCode: string;
}

export function translateRecoverError(msg: string): string {
  if (msg.includes("rate_limited"))
    return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
  if (msg.includes("invalid_code") || msg.includes("no_recovery"))
    return "Não encontramos um perfil com esses dados.";
  if (msg.includes("event_not_active")) return "O evento não está ativo.";
  if (msg.includes("not_authenticated")) return "Sessão expirada. Recarregue a página.";
  return "Não foi possível recuperar. Tente novamente.";
}

/**
 * Recupera o perfil transferindo a propriedade (owner_id) para a sessão atual
 * e rotacionando o código. O novo código deve ser mostrado apenas uma vez.
 */
export function useRecoverProfile() {
  return useMutation({
    mutationFn: async (input: RecoverProfileInput): Promise<RecoverProfileResult> => {
      await ensureAnonSession();
      const { data, error } = await supabase.rpc("recover_profile_v2", {
        _event_id: input.eventId,
        _phone_e164: input.whatsapp,
        _code: input.code,
      });
      if (error) throw new Error(translateRecoverError(error.message));
      const row = Array.isArray(data) ? data[0] : null;
      if (!row?.profile_id) {
        throw new Error(translateRecoverError("invalid_code"));
      }
      return {
        profileId: row.profile_id as string,
        newRecoveryCode: (row.new_recovery_code as string) ?? "",
      };
    },
  });
}
