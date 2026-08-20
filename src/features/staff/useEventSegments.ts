import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Segment } from "@/lib/types";

/**
 * Lista de segmentos disponíveis no catálogo do evento.
 * Reaproveita a RPC pública já usada pelo wizard do participante.
 */
export function useEventSegments(eventId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: ["staff", "event-segments", eventId],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Segment[]> => {
      const { data, error } = await supabase.rpc("list_event_segments_and_taxonomy", {
        _event_id: eventId,
      });
      if (error) throw error;
      const raw =
        (data as { segments?: Array<{ id: string; label: string; emoji: string | null }> } | null)
          ?.segments ?? [];
      return raw
        .map((s) => ({
          id: s.id,
          label: s.label,
          emoji: s.emoji ?? "•",
        }))
        .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
    },
  });
}
