import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { qk } from "./queryKeys";
import {
  listOwnMatches,
  recordMatchDecision,
} from "@/features/matching/api";
import { ApiError } from "./api";
import type {
  OwnMatchDTO,
  DecideMatchResult,
  ErrorCode,
} from "./types";
import type { Decision } from "@/lib/types";

// Re-exports para compat com routes existentes.
export type {
  OwnMatchDTO,
  OwnMatchReason,
  OwnMatchOffer,
  OwnMatchNeed,
  OwnMatchOther,
  OwnMatchConnection,
  DecideMatchResult,
} from "./types";

export const ownMatchesKey = qk.ownMatches;

export function translateDecideError(codeOrMsg: string): string {
  const msg = codeOrMsg;
  if (msg.includes("not_authenticated") || msg.includes("sign_in_failed"))
    return "Faça login novamente.";
  if (msg.includes("match_not_found")) return "Match não encontrado.";
  if (msg.includes("match_inactive")) return "Este match não está mais ativo.";
  if (msg.includes("not_a_participant")) return "Você não faz parte deste match.";
  if (msg.includes("decision_locked_by_connection"))
    return "A equipe já iniciou o atendimento — não é possível recusar agora.";
  return "Não foi possível registrar sua decisão.";
}

function toCode(err: unknown): ErrorCode {
  return err instanceof ApiError ? err.code : "unknown";
}

/**
 * Lista matches próprios. Mantém a assinatura Realtime da versão anterior
 * enquanto a Onda C não substituir por polling filtrado.
 */
export function useOwnMatches(eventId: string, opts?: { enabled?: boolean }) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: qk.ownMatches(eventId),
    queryFn: (): Promise<OwnMatchDTO[]> => listOwnMatches(eventId),
    enabled: opts?.enabled ?? true,
    staleTime: 5_000,
  });

  useEffect(() => {
    if (opts?.enabled === false) return;
    const invalidate = () =>
      qc.invalidateQueries({ queryKey: qk.ownMatches(eventId) });
    const ch = supabase
      .channel(`own-matches-${eventId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "matches" },
        invalidate,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "match_decisions" },
        invalidate,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "connections" },
        invalidate,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [eventId, opts?.enabled, qc]);

  return query;
}

export function useDecideMatch(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      matchId: string;
      decision: Decision;
    }): Promise<DecideMatchResult> => {
      try {
        return await recordMatchDecision(input.matchId, input.decision);
      } catch (err) {
        throw new Error(translateDecideError(toCode(err)));
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.ownMatches(eventId) });
      qc.invalidateQueries({ queryKey: qk.publicStats(eventId) });
    },
  });
}
