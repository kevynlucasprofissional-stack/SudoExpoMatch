import { useEffect } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  ConnectionStatus,
  Decision,
  MatchKind,
  MatchLabel,
  NeedKind,
} from "@/lib/types";
import { ensureAnonSession } from "./session";

export interface OwnMatchReason {
  code: string;
  label: string;
  weight: number;
}
export interface OwnMatchOffer {
  label: string;
  detail: string | null;
}
export interface OwnMatchNeed extends OwnMatchOffer {
  need_kind: NeedKind;
  is_priority: boolean;
}
export interface OwnMatchOther {
  name: string;
  company: string;
  city: string;
  neighborhood: string | null;
  segment_id: string;
  summary: string;
}
export interface OwnMatchConnection {
  id: string;
  status: ConnectionStatus;
  notes: string | null;
}
export interface OwnMatchDTO {
  match_id: string;
  my_profile_id: string;
  other_profile_id: string;
  kind: MatchKind;
  label: MatchLabel;
  score_me: number;
  score_other: number;
  created_at: string;
  updated_at: string;
  generated_at: string;
  other: OwnMatchOther;
  other_offers: OwnMatchOffer[];
  other_needs: OwnMatchNeed[];
  reasons: OwnMatchReason[];
  my_decision: Decision;
  other_decision: Decision;
  connection: OwnMatchConnection | null;
}

export const ownMatchesKey = (eventId: string) => ["own-matches", eventId] as const;

async function fetchOwnMatches(eventId: string): Promise<OwnMatchDTO[]> {
  await ensureAnonSession();
  const { data, error } = await supabase.rpc("list_own_matches_v2", { _event_id: eventId });
  if (error) throw error;
  return ((data as unknown) as OwnMatchDTO[]) ?? [];
}

/**
 * Lista matches do próprio participante com realtime nas tabelas relevantes.
 */
export function useOwnMatches(eventId: string, opts?: { enabled?: boolean }) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ownMatchesKey(eventId),
    queryFn: () => fetchOwnMatches(eventId),
    enabled: opts?.enabled ?? true,
    staleTime: 5_000,
  });

  useEffect(() => {
    if (opts?.enabled === false) return;
    const invalidate = () =>
      qc.invalidateQueries({ queryKey: ownMatchesKey(eventId) });
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

// ---------- Decide ----------
export interface DecideMatchResult {
  my_decision: Decision;
  other_decision: Decision;
  mutual: boolean;
  connection_id: string | null;
  connection_status: ConnectionStatus | null;
  connection_created: boolean;
}

export function translateDecideError(msg: string): string {
  if (msg.includes("not_authenticated")) return "Faça login novamente.";
  if (msg.includes("match_not_found")) return "Match não encontrado.";
  if (msg.includes("match_inactive")) return "Este match não está mais ativo.";
  if (msg.includes("not_a_participant")) return "Você não faz parte deste match.";
  if (msg.includes("decision_locked_by_connection"))
    return "A equipe já iniciou o atendimento — não é possível recusar agora.";
  return "Não foi possível registrar sua decisão.";
}

export function useDecideMatch(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { matchId: string; decision: Decision }): Promise<DecideMatchResult> => {
      const { data, error } = await supabase.rpc("record_match_decision_v2", {
        _match_id: input.matchId,
        _decision: input.decision,
      });
      if (error) throw new Error(translateDecideError(error.message));
      return (data as unknown) as DecideMatchResult;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ownMatchesKey(eventId) });
      qc.invalidateQueries({ queryKey: ["stats", eventId] });
    },
  });
}
