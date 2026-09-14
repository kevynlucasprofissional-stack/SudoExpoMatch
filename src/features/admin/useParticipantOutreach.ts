import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  participantOutreachContextSchema,
  type ParticipantOutreachContext,
} from "@/features/admin/participantOutreach";

/**
 * IMPL 31 — contexto de abordagem do participante.
 * Contato vem SOB DEMANDA, nunca na listagem/detalhe. Cache curto para não
 * manter telefone parado em memória mais tempo que o necessário.
 */
export const participantOutreachKey = (profileId: string) =>
  ["admin", "participant-outreach", profileId] as const;

export async function fetchParticipantOutreachContext(
  profileId: string,
): Promise<ParticipantOutreachContext> {
  const { data, error } = await supabase.rpc(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    "admin_get_participant_outreach_context" as any,
    { _profile_id: profileId },
  );
  if (error) throw error;
  return participantOutreachContextSchema.parse(data);
}

export function useParticipantOutreachContext(profileId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: participantOutreachKey(profileId ?? "none"),
    enabled: enabled && !!profileId,
    staleTime: 0,
    gcTime: 0,
    queryFn: () => fetchParticipantOutreachContext(profileId!),
  });
}

/** Log best-effort: nunca grava telefone e nunca bloqueia o WhatsApp. */
export async function logParticipantOutreach(vars: {
  profileId: string;
  channel?: "whatsapp" | "copy";
  messagePreview?: string;
}): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await supabase.rpc("admin_log_participant_outreach" as any, {
    _profile_id: vars.profileId,
    _channel: vars.channel ?? "whatsapp",
    _message_preview: (vars.messagePreview ?? "").slice(0, 300),
  });
  if (error) throw error;
}

export function useLogParticipantOutreach() {
  return useMutation({ mutationFn: logParticipantOutreach });
}
