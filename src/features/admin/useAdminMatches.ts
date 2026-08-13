import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  matchDetailSchema,
  matchesPageSchema,
  type MatchDetail,
  type MatchesPage,
} from "@/features/admin/matchesSchemas";
import {
  MATCHES_MAX_LIMIT,
  MATCHES_PAGE_SIZE,
  type NormalizedMatchesSearch,
} from "@/features/admin/matchesUrlState";

/**
 * IMPL 10 — camada de API da auditoria de matches. Read-only: só existem
 * queries aqui, nenhuma mutation (não se edita score, kind nem decisão).
 */

export type MatchesFilters = Omit<NormalizedMatchesSearch, "page" | "selected"> & {
  offset: number;
  limit?: number;
};

/** Chave estável — qualquer filtro muda o cache. */
export const matchesKey = (eventId: string, f: MatchesFilters) =>
  [
    "admin",
    "matches",
    eventId,
    f.q,
    [...f.kinds].sort().join(","),
    [...f.labels].sort().join(","),
    f.side,
    f.min,
    f.max,
    [...f.segments].sort().join(","),
    [...f.decisions].sort().join(","),
    f.mutual,
    f.connection,
    [...f.connectionStatuses].sort().join(","),
    [...f.versions].sort().join(","),
    f.sort,
    f.offset,
    f.limit ?? MATCHES_PAGE_SIZE,
  ] as const;

export const matchDetailKey = (matchId: string) => ["admin", "match-detail", matchId] as const;

const arr = (v: string[]) => (v.length > 0 ? v : undefined);

export async function fetchAdminMatches(
  eventId: string,
  f: MatchesFilters,
): Promise<MatchesPage> {
  const limit = Math.min(Math.max(f.limit ?? MATCHES_PAGE_SIZE, 1), MATCHES_MAX_LIMIT);
  const { data, error } = await supabase.rpc("admin_list_matches", {
    _event_id: eventId,
    _search: f.q ? f.q : undefined,
    _kinds: arr(f.kinds),
    _labels: arr(f.labels),
    _score_side: f.side,
    _min_score: f.min ?? undefined,
    _max_score: f.max ?? undefined,
    _segment_ids: arr(f.segments),
    _decisions: arr(f.decisions),
    _mutual_only: f.mutual,
    _connection: f.connection,
    _connection_statuses: arr(f.connectionStatuses),
    _algorithm_versions: arr(f.versions),
    _sort: f.sort,
    _limit: limit,
    _offset: Math.max(0, f.offset),
  });
  if (error) throw error;
  return matchesPageSchema.parse(data);
}

export function useAdminMatches(eventId: string, filters: MatchesFilters, enabled: boolean) {
  return useQuery({
    queryKey: matchesKey(eventId, filters),
    enabled,
    staleTime: 15_000,
    placeholderData: keepPreviousData,
    queryFn: () => fetchAdminMatches(eventId, filters),
  });
}

export async function fetchAdminMatchDetail(matchId: string): Promise<MatchDetail> {
  const { data, error } = await supabase.rpc("admin_get_match_detail", { _match_id: matchId });
  if (error) throw error;
  return matchDetailSchema.parse(data);
}

export function useAdminMatchDetail(matchId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: matchDetailKey(matchId ?? "none"),
    enabled: enabled && !!matchId,
    staleTime: 15_000,
    queryFn: () => fetchAdminMatchDetail(matchId!),
  });
}
