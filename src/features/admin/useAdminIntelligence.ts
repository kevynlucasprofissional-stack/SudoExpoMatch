import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  intelligenceBehaviorSchema,
  intelligenceMatcherSchema,
  intelligenceOverviewSchema,
  intelligenceTaxonomySchema,
  type IntelligenceBehavior,
  type IntelligenceMatcher,
  type IntelligenceOverview,
  type IntelligenceTaxonomy,
} from "@/features/admin/intelligenceSchemas";

/**
 * IMPL 29 — camada de API do SudoExpo Intelligence. Read-only: quatro RPCs
 * agregadas por domínio, uma requisição por aba, sempre com o evento
 * selecionado no admin (nunca `EVENT_ID` fixo).
 */

export const intelligenceKey = (domain: string, eventId: string) =>
  ["admin", "intelligence", domain, eventId] as const;

const STALE = 30_000;

async function rpc<T>(
  fn: "admin_intelligence_overview" | "admin_intelligence_matcher" | "admin_intelligence_behavior" | "admin_intelligence_taxonomy",
  eventId: string,
  parse: (raw: unknown) => T,
): Promise<T> {
  const { data, error } = await supabase.rpc(fn, { _event_id: eventId });
  if (error) throw error;
  return parse(data);
}

export function fetchIntelligenceOverview(eventId: string): Promise<IntelligenceOverview> {
  return rpc("admin_intelligence_overview", eventId, (raw) =>
    intelligenceOverviewSchema.parse(raw),
  );
}

export function fetchIntelligenceMatcher(eventId: string): Promise<IntelligenceMatcher> {
  return rpc("admin_intelligence_matcher", eventId, (raw) => intelligenceMatcherSchema.parse(raw));
}

export function fetchIntelligenceBehavior(eventId: string): Promise<IntelligenceBehavior> {
  return rpc("admin_intelligence_behavior", eventId, (raw) =>
    intelligenceBehaviorSchema.parse(raw),
  );
}

export function fetchIntelligenceTaxonomy(eventId: string): Promise<IntelligenceTaxonomy> {
  return rpc("admin_intelligence_taxonomy", eventId, (raw) =>
    intelligenceTaxonomySchema.parse(raw),
  );
}

export function useIntelligenceOverview(eventId: string, enabled: boolean) {
  return useQuery({
    queryKey: intelligenceKey("overview", eventId),
    enabled,
    staleTime: STALE,
    queryFn: () => fetchIntelligenceOverview(eventId),
  });
}

export function useIntelligenceMatcher(eventId: string, enabled: boolean) {
  return useQuery({
    queryKey: intelligenceKey("matcher", eventId),
    enabled,
    staleTime: STALE,
    queryFn: () => fetchIntelligenceMatcher(eventId),
  });
}

export function useIntelligenceBehavior(eventId: string, enabled: boolean) {
  return useQuery({
    queryKey: intelligenceKey("behavior", eventId),
    enabled,
    staleTime: STALE,
    queryFn: () => fetchIntelligenceBehavior(eventId),
  });
}

export function useIntelligenceTaxonomy(eventId: string, enabled: boolean) {
  return useQuery({
    queryKey: intelligenceKey("taxonomy", eventId),
    enabled,
    staleTime: STALE,
    queryFn: () => fetchIntelligenceTaxonomy(eventId),
  });
}
