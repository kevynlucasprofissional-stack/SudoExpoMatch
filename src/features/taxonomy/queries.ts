import { useQuery } from "@tanstack/react-query";
import { qk } from "@/features/participant/queryKeys";
import { fetchEventCatalog } from "./api";

export function useEventTaxonomy(eventId: string, opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: qk.taxonomy(eventId),
    queryFn: () => fetchEventCatalog(eventId),
    enabled: opts?.enabled ?? true,
    staleTime: 5 * 60_000,
  });
}
