import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

const operatorRow = z.object({
  user_id: z.string(),
  email: z.string().nullable(),
  total: z.number().int(),
  active: z.number().int(),
  completed: z.number().int(),
});

const statsSchema = z.object({
  active_profiles: z.number().int(),
  total_matches: z.number().int(),
  mutual_matches: z.number().int(),
  by_status: z.record(z.string(), z.number().int()).default({}),
  unassigned: z.number().int(),
  by_operator: z.array(operatorRow).default([]),
  avg_seconds_to_assume: z.number().int(),
  avg_seconds_to_present: z.number().int(),
  avg_seconds_to_complete: z.number().int(),
  rate_presented: z.number(),
  rate_contact_exchanged: z.number(),
  rate_completed: z.number(),
  cancellations: z.number().int(),
});

export type OperationalStats = z.infer<typeof statsSchema>;

export function useOperationalStats(eventId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["staff", "op-stats", eventId],
    enabled,
    staleTime: 5_000,
    refetchInterval: 20_000,
    queryFn: async (): Promise<OperationalStats> => {
      const { data, error } = await supabase.rpc("event_operational_stats", {
        _event_id: eventId,
      });
      if (error) throw error;
      return statsSchema.parse(data);
    },
  });
}

export function formatDurationSeconds(seconds: number): string {
  if (!seconds || seconds < 0) return "—";
  if (seconds < 60) return `${seconds}s`;
  const min = Math.round(seconds / 60);
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const rem = min % 60;
  return rem === 0 ? `${h}h` : `${h}h${rem}min`;
}
