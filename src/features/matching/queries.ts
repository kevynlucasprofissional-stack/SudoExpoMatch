import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@/features/participant/queryKeys";
import type { Decision } from "@/lib/types";
import {
  listOwnMatches,
  recordMatchDecision,
  recomputeOwnMatches,
  revealContactForMatch,
} from "./api";

export function useOwnMatchesQuery(
  eventId: string,
  opts?: { enabled?: boolean; refetchIntervalMs?: number },
) {
  return useQuery({
    queryKey: qk.ownMatches(eventId),
    queryFn: () => listOwnMatches(eventId),
    enabled: opts?.enabled ?? true,
    staleTime: 5_000,
    refetchInterval: opts?.refetchIntervalMs,
    refetchIntervalInBackground: false,
  });
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

export function useRevealContactMutation() {
  return useMutation({
    mutationFn: (matchId: string) => revealContactForMatch(matchId),
  });
}
