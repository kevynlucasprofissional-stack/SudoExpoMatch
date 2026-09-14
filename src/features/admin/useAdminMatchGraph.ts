import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { matchGraphSchema, type MatchGraph } from "@/features/admin/graphSchemas";

/**
 * Camada de API do Mapa de conexões. Read-only: uma única RPC magra por
 * evento, cache curto no TanStack Query. Filtros finos são aplicados em
 * memória (`filterGraph`) para não refazer requisição a cada ajuste.
 */

export interface MatchGraphParams {
  /** pré-filtro no servidor para reduzir payload em eventos grandes */
  minScore?: number | null;
  segments?: string[];
}

export const matchGraphKey = (eventId: string, p: MatchGraphParams = {}) =>
  ["admin", "match-graph", eventId, p.minScore ?? null, [...(p.segments ?? [])].sort().join(",")] as const;

export async function fetchMatchGraph(
  eventId: string,
  p: MatchGraphParams = {},
): Promise<MatchGraph> {
  const { data, error } = await supabase.rpc("admin_match_graph", {
    _event_id: eventId,
    _min_score: p.minScore ?? undefined,
    _segment_ids: p.segments && p.segments.length > 0 ? p.segments : undefined,
  });
  if (error) throw error;
  return matchGraphSchema.parse(data);
}

export function useAdminMatchGraph(
  eventId: string,
  enabled: boolean,
  params: MatchGraphParams = {},
) {
  return useQuery({
    queryKey: matchGraphKey(eventId, params),
    enabled,
    staleTime: 30_000,
    queryFn: () => fetchMatchGraph(eventId, params),
  });
}
