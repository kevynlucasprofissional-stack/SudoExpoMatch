import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { participantSocialSchema, type ParticipantSocial } from "@/features/social/socialProfile";

export const staffParticipantSocialKey = (profileId: string) =>
  ["staff", "participant-social", profileId] as const;

/**
 * Contexto profissional + social de um participante para a equipe do evento.
 * Autorização e isolamento por evento ficam na RPC (SECURITY DEFINER).
 */
export async function fetchStaffParticipantSocial(profileId: string): Promise<ParticipantSocial> {
  const { data, error } = await supabase.rpc("staff_get_participant_social", {
    _profile_id: profileId,
  });
  if (error) throw error;
  return participantSocialSchema.parse(data);
}

export function useStaffParticipantSocial(profileId: string | null | undefined) {
  return useQuery({
    queryKey: staffParticipantSocialKey(profileId ?? "none"),
    enabled: !!profileId,
    staleTime: 60_000,
    retry: false,
    queryFn: () => fetchStaffParticipantSocial(profileId!),
  });
}
