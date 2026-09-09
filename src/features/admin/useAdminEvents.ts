import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { EVENT_ID } from "@/config/event";

export interface EventItem {
  id: string;
  name: string;
  city: string;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
  created_at: string;
  participants_count?: number;
  matches_count?: number;
}

export const adminEventsKey = () => ["admin", "events"] as const;

export async function fetchAdminEvents(): Promise<EventItem[]> {
  const { data, error } = await supabase
    .from("events")
    .select("id, name, city, starts_at, ends_at, is_active, created_at")
    .order("is_active", { ascending: false })
    .order("starts_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as EventItem[];
}

export function useAdminEvents() {
  return useQuery({
    queryKey: adminEventsKey(),
    queryFn: fetchAdminEvents,
    staleTime: 60_000,
  });
}

export function useStaffCheckinMutation(targetEventId: string = EVENT_ID) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sourceProfileId: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await supabase.rpc("staff_checkin_participant" as any, {
        _target_event_id: targetEventId,
        _source_profile_id: sourceProfileId,
      });
      if (error) throw error;
      return data as { profile_id: string; checked_in?: boolean; already_registered?: boolean };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin", "participants"] });
      void qc.invalidateQueries({ queryKey: ["admin", "events"] });
      void qc.invalidateQueries({ queryKey: ["admin", "participant-detail"] });
    },
  });
}
