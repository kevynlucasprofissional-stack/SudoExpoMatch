import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface EventStats {
  totalProfiles: number;
  totalMatches: number;
  mutualMatches: number;
  totalConnections: number;
  completedConnections: number;
  totalSegments: number;
}

async function fetchStats(eventId: string): Promise<EventStats> {
  const { data, error } = await supabase.rpc("event_stats", { _event_id: eventId });
  if (error) throw error;
  const row = data?.[0];
  return {
    totalProfiles: row?.total_profiles ?? 0,
    totalMatches: row?.total_matches ?? 0,
    mutualMatches: row?.mutual_matches ?? 0,
    totalConnections: row?.total_connections ?? 0,
    completedConnections: row?.completed_connections ?? 0,
    totalSegments: row?.total_segments ?? 0,
  };
}

/** Estatísticas agregadas via RPC (não depende do store local). */
export function useEventStats(eventId: string, opts?: { refetchMs?: number }) {
  return useQuery({
    queryKey: ["stats", eventId],
    queryFn: () => fetchStats(eventId),
    refetchInterval: opts?.refetchMs ?? 15_000,
    staleTime: 5_000,
  });
}
