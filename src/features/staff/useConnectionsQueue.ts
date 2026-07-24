import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { ConnectionStatus } from "@/lib/types";

type ConnRow = Database["public"]["Tables"]["connections"]["Row"];
type MatchRow = Database["public"]["Tables"]["matches"]["Row"];
type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

export interface QueueItem {
  id: string;
  matchId: string;
  status: ConnectionStatus;
  createdAt: string;
  updatedAt: string;
  notes: string | null;
  a: { id: string; name: string; company: string; city: string; segmentId: string };
  b: { id: string; name: string; company: string; city: string; segmentId: string };
  reason: string | null;
}

const queueKey = (eventId: string) => ["staff", "queue", eventId] as const;

async function fetchQueue(eventId: string): Promise<QueueItem[]> {
  const [connsRes, matchesRes, profilesRes] = await Promise.all([
    supabase.from("connections").select("*").eq("event_id", eventId),
    supabase.from("matches").select("*").eq("event_id", eventId),
    supabase
      .from("profiles")
      .select("id,name,company,city,segment_id")
      .eq("event_id", eventId),
  ]);
  if (connsRes.error) throw connsRes.error;
  if (matchesRes.error) throw matchesRes.error;
  if (profilesRes.error) throw profilesRes.error;

  const profiles = new Map<string, Pick<ProfileRow, "id" | "name" | "company" | "city" | "segment_id">>();
  for (const p of profilesRes.data ?? []) profiles.set(p.id, p);
  const matches = new Map<string, MatchRow>();
  for (const m of matchesRes.data ?? []) matches.set(m.id, m);

  return (connsRes.data ?? [])
    .map((c: ConnRow): QueueItem | null => {
      const a = profiles.get(c.a_profile_id);
      const b = profiles.get(c.b_profile_id);
      const m = matches.get(c.match_id);
      if (!a || !b) return null;
      const reasons = (m?.reasons_for_a as Array<{ detail: string }> | null) ?? [];
      return {
        id: c.id,
        matchId: c.match_id,
        status: c.status as ConnectionStatus,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
        notes: c.notes,
        a: { id: a.id, name: a.name, company: a.company, city: a.city, segmentId: a.segment_id },
        b: { id: b.id, name: b.name, company: b.company, city: b.city, segmentId: b.segment_id },
        reason: reasons[0]?.detail ?? null,
      };
    })
    .filter((x): x is QueueItem => !!x)
    .sort((x, y) => {
      // Aguardando primeiro, depois por atualização recente
      const order: Record<ConnectionStatus, number> = {
        aguardando: 0,
        em_atendimento: 1,
        apresentados: 2,
        contato_trocado: 3,
        concluido: 4,
        cancelado: 5,
      };
      const d = order[x.status] - order[y.status];
      return d !== 0 ? d : new Date(y.updatedAt).getTime() - new Date(x.updatedAt).getTime();
    });
}

export function useConnectionsQueue(eventId: string, enabled: boolean) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: queueKey(eventId),
    queryFn: () => fetchQueue(eventId),
    enabled,
    staleTime: 5_000,
  });

  // Realtime: revalida a fila quando conexões mudam
  useEffect(() => {
    if (!enabled) return;
    const ch = supabase
      .channel(`staff-queue-${eventId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "connections" }, () => {
        qc.invalidateQueries({ queryKey: queueKey(eventId) });
        qc.invalidateQueries({ queryKey: ["stats", eventId] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [eventId, enabled, qc]);

  return query;
}

export function useAdvanceConnection(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      connectionId: string;
      newStatus: ConnectionStatus;
      note?: string | null;
    }) => {
      const { error } = await supabase.rpc("staff_advance_connection", {
        _connection_id: input.connectionId,
        _new_status: input.newStatus,
        _note: input.note ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queueKey(eventId) });
      qc.invalidateQueries({ queryKey: ["stats", eventId] });
    },
  });
}

export interface StaffContactPair {
  profileId: string;
  name: string;
  company: string;
  phone: string;
  email: string | null;
}

export function useStaffRevealContacts(matchId: string | null) {
  return useQuery({
    queryKey: ["staff", "reveal", matchId ?? "none"],
    enabled: !!matchId,
    staleTime: 0,
    gcTime: 0,
    queryFn: async (): Promise<StaffContactPair[]> => {
      const { data, error } = await supabase.rpc("staff_reveal_contact_for_match", {
        _match_id: matchId!,
      });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        profileId: r.profile_id,
        name: r.name,
        company: r.company,
        phone: r.phone_e164 ?? "",
        email: r.email,
      }));
    },
  });
}
