import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@/features/participant/queryKeys";
import type { Decision } from "@/lib/types";
import {
  listOwnMatches,
  recordMatchDecision,
  recomputeOwnMatches,
  revealContactForMatch,
} from "./api";

/**
 * Opções puras da query de matches — exportadas para permitir testes
 * de contrato (polling 20s, sem refetch em background).
 */
export function ownMatchesQueryOptions(
  eventId: string,
  opts?: { enabled?: boolean; refetchIntervalMs?: number },
) {
  return {
    queryKey: qk.ownMatches(eventId),
    queryFn: () => listOwnMatches(eventId),
    enabled: opts?.enabled ?? true,
    staleTime: 5_000,
    refetchInterval: opts?.refetchIntervalMs,
    refetchIntervalInBackground: false as const,
  };
}

export function useOwnMatchesQuery(
  eventId: string,
  opts?: { enabled?: boolean; refetchIntervalMs?: number },
) {
  return useQuery(ownMatchesQueryOptions(eventId, opts));
}

export function useDecideMatchMutation(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { matchId: string; decision: Decision }) =>
      recordMatchDecision(input.matchId, input.decision),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.ownMatches(eventId) });
      qc.invalidateQueries({ queryKey: qk.publicStats(eventId) });
    },
  });
}

export function useRecomputeMatchesMutation(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => recomputeOwnMatches(eventId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.ownMatches(eventId) });
      qc.invalidateQueries({ queryKey: qk.publicStats(eventId) });
    },
  });
}

/**
 * Reveal contact — sanitizado.
 * `gcTime: 0` garante que a resposta NÃO permaneça no mutation cache
 * após o componente descartá-la. Somem também: variables, error, data.
 * O componente ainda faz `mutation.reset()` explicitamente após consumir.
 */
export function useRevealContactMutation() {
  return useMutation({
    mutationFn: (matchId: string) => revealContactForMatch(matchId),
    gcTime: 0,
  });
}
