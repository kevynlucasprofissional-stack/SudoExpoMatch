import { supabase } from "@/integrations/supabase/client";
import { ensureParticipantSession } from "@/features/participant/session";
import { ApiError, extractErrorCode } from "@/features/participant/api";
import type { EventCatalog } from "@/features/participant/types";
import { eventCatalogSchema } from "./schemas";

export async function fetchEventCatalog(eventId: string): Promise<EventCatalog> {
  await ensureParticipantSession();
  const { data, error } = await supabase.rpc("list_event_segments_and_taxonomy", {
    _event_id: eventId,
  });
  if (error) throw new ApiError(extractErrorCode(error.message));
  const parsed = eventCatalogSchema.safeParse(data);
  if (!parsed.success) throw new ApiError("invalid_response");
  return parsed.data;
}
