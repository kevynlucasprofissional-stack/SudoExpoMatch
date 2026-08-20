/**
 * Métricas agregadas do funil (server-side, uma única RPC — sem N+1).
 */
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { OUTCOME_KINDS } from "@/features/staff/outcomes";

const int = z.coerce.number().int().nonnegative();

export const experienceAnalyticsSchema = z.object({
  event_id: z.string(),
  profiles_total: int,
  onboarding_completed: int,
  profiles_with_match: int,
  matches_total: int,
  interests: int,
  mutual_interests: int,
  connections_total: int,
  connections_presented: int,
  connections_completed: int,
  connections_mapped: int,
  outcomes: z.record(z.string(), int).default({}),
  outcomes_total: int,
  connections_with_outcome: int,
  product_events: z.record(z.string(), int).default({}),
});

export type ExperienceAnalytics = z.infer<typeof experienceAnalyticsSchema>;

export function outcomeCount(data: ExperienceAnalytics | undefined, kind: string): number {
  return data?.outcomes?.[kind] ?? 0;
}

export function conversionRate(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export function outcomeRows(data: ExperienceAnalytics | undefined) {
  return OUTCOME_KINDS.map((kind) => ({ kind, total: outcomeCount(data, kind) }));
}

export function useExperienceAnalytics(eventId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["admin", "experience-analytics", eventId] as const,
    enabled,
    staleTime: 15_000,
    refetchInterval: enabled ? 60_000 : false,
    queryFn: async (): Promise<ExperienceAnalytics> => {
      const { data, error } = await supabase.rpc("admin_experience_analytics", {
        _event_id: eventId,
      });
      if (error) throw error;
      return experienceAnalyticsSchema.parse(data);
    },
  });
}
