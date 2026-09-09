import { useEffect, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  participantDetailSchema,
  participantsPageSchema,
  type ParticipantDetail,
  type ParticipantsPage,
} from "@/features/admin/participantsSchemas";
import {
  PARTICIPANTS_MAX_LIMIT,
  PARTICIPANTS_PAGE_SIZE,
} from "@/features/admin/participantsUrlState";
import {
  participantSocialSchema,
  type ParticipantSocial,
} from "@/features/social/socialProfile";

/**
 * IMPL 9 — wrapper de API do admin. Toda a fala com o banco fica aqui;
 * a rota só consome hooks. Read-only por definição.
 */

export interface ParticipantsFilters {
  q: string;
  segments: string[];
  city: string;
  offset: number;
  limit?: number;
}

/** Chave estável: mudança de qualquer filtro gera cache próprio. */
export const participantsKey = (eventId: string, f: ParticipantsFilters) =>
  [
    "admin",
    "participants",
    eventId,
    f.q,
    [...f.segments].sort().join(","),
    f.city,
    f.offset,
    f.limit ?? PARTICIPANTS_PAGE_SIZE,
  ] as const;

export const participantDetailKey = (profileId: string) =>
  ["admin", "participant-detail", profileId] as const;

export async function fetchParticipants(
  eventId: string,
  f: ParticipantsFilters,
): Promise<ParticipantsPage> {
  const limit = Math.min(Math.max(f.limit ?? PARTICIPANTS_PAGE_SIZE, 1), PARTICIPANTS_MAX_LIMIT);
  const { data, error } = await supabase.rpc("admin_list_participants", {
    _event_id: eventId,
    _search: f.q ? f.q : undefined,
    _segment_ids: f.segments.length > 0 ? f.segments : undefined,
    _city: f.city ? f.city : undefined,
    _limit: limit,
    _offset: Math.max(0, f.offset),
  });
  if (error) throw error;
  return participantsPageSchema.parse(data);
}

export function useAdminParticipants(
  eventId: string,
  filters: ParticipantsFilters,
  enabled: boolean,
) {
  return useQuery({
    queryKey: participantsKey(eventId, filters),
    enabled,
    staleTime: 15_000,
    placeholderData: keepPreviousData,
    queryFn: () => fetchParticipants(eventId, filters),
  });
}

export async function fetchParticipantDetail(profileId: string): Promise<ParticipantDetail> {
  const { data, error } = await supabase.rpc("admin_get_participant_detail", {
    _profile_id: profileId,
  });
  if (error) throw error;
  return participantDetailSchema.parse(data);
}

export function useAdminParticipantDetail(profileId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: participantDetailKey(profileId ?? "none"),
    enabled: enabled && !!profileId,
    staleTime: 15_000,
    queryFn: () => fetchParticipantDetail(profileId!),
  });
}

/** Debounce simples para a busca — evita uma RPC por tecla. */
export const participantSocialKey = (profileId: string) =>
  ["admin", "participant-social", profileId] as const;

/** IMPL 16 — contexto social (Instagram) do participante, somente admin do evento. */
export async function fetchParticipantSocial(profileId: string): Promise<ParticipantSocial> {
  const { data, error } = await supabase.rpc("admin_get_participant_social", {
    _profile_id: profileId,
  });
  if (error) throw error;
  return participantSocialSchema.parse(data);
}

export function useAdminParticipantSocial(profileId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: participantSocialKey(profileId ?? "none"),
    enabled: enabled && !!profileId,
    staleTime: 30_000,
    queryFn: () => fetchParticipantSocial(profileId!),
  });
}

export function useDebouncedValue<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function useAdminDeleteParticipantMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (profileId: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await supabase.rpc("admin_delete_participant" as any, {
        _profile_id: profileId,
      });
      if (error) throw error;
      return data as { success: boolean; profile_id: string; name: string; phone: string | null };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "participants"] });
      void qc.invalidateQueries({ queryKey: ["admin", "events"] });
      void qc.invalidateQueries({ queryKey: ["admin", "matches"] });
      void qc.invalidateQueries({ queryKey: ["admin", "participant-detail"] });
    },
  });
}

export function useAdminClearSandboxMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await supabase.rpc("admin_clear_sandbox" as any);
      if (error) throw error;
      return data as { success: boolean; deleted_profiles_count: number };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "participants"] });
      void qc.invalidateQueries({ queryKey: ["admin", "events"] });
      void qc.invalidateQueries({ queryKey: ["admin", "matches"] });
    },
  });
}
