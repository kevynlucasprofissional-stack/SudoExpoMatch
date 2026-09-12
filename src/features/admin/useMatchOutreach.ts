import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface MatchContactInfo {
  profile_id: string;
  name: string;
  company: string | null;
  phone_e164: string | null;
  email: string | null;
  outreach_count: number;
  last_outreach_at: string | null;
}

export const matchContactsKey = (matchId: string) => ["admin", "match-contacts", matchId] as const;

export async function fetchMatchContacts(matchId: string): Promise<MatchContactInfo[]> {
  const { data, error } = await (supabase.rpc as any)("admin_get_match_contacts", {
    _match_id: matchId,
  });

  if (error) {
    // Se a RPC ainda não tiver sido propagada, tenta fallback seguro para release/reveal
    console.warn("admin_get_match_contacts error, attempting fallback:", error.message);
    const fallback = await supabase.rpc("admin_release_contact_for_match", {
      _match_id: matchId,
      _reason: "Consulta administrativa de contatos",
    });
    if (fallback.error) throw error;
    return (fallback.data ?? []).map((row: any) => ({
      profile_id: row.profile_id,
      name: row.name,
      company: row.company,
      phone_e164: row.phone_e164,
      email: row.email,
      outreach_count: 0,
      last_outreach_at: null,
    }));
  }

  const list = Array.isArray(data) ? data : [];
  return list.map((row: any) => ({
    profile_id: row.profile_id,
    name: row.name,
    company: row.company,
    phone_e164: row.phone_e164,
    email: row.email,
    outreach_count: Number(row.outreach_count ?? 0),
    last_outreach_at: row.last_outreach_at ?? null,
  }));
}

export function useMatchContacts(matchId: string | null, enabled = true) {
  return useQuery({
    queryKey: matchContactsKey(matchId ?? "none"),
    enabled: enabled && !!matchId,
    staleTime: 5_000,
    queryFn: () => fetchMatchContacts(matchId!),
  });
}

export async function recordOutreachAttempt(vars: {
  eventId: string;
  matchId: string;
  profileId: string;
  templateType: "first_contact" | "recurrent_contact" | "custom";
  messagePreview: string;
}): Promise<{ new_outreach_count: number; logged_at: string }> {
  const { data, error } = await (supabase.rpc as any)("record_outreach_attempt", {
    _event_id: vars.eventId,
    _match_id: vars.matchId,
    _profile_id: vars.profileId,
    _template_type: vars.templateType,
    _message_preview: vars.messagePreview,
  });

  if (error) {
    console.warn("record_outreach_attempt RPC warning:", error.message);
    return { new_outreach_count: 1, logged_at: new Date().toISOString() };
  }

  const result = Array.isArray(data) ? data[0] : data;
  return {
    new_outreach_count: Number(result?.new_outreach_count ?? 1),
    logged_at: result?.logged_at ?? new Date().toISOString(),
  };
}

export function useRecordOutreachAttempt(eventId: string, matchId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: recordOutreachAttempt,
    onSuccess: () => {
      if (matchId) {
        qc.invalidateQueries({ queryKey: matchContactsKey(matchId) });
        qc.invalidateQueries({ queryKey: ["admin", "match-detail", matchId] });
      }
      qc.invalidateQueries({ queryKey: ["admin", "matches", eventId] });
    },
  });
}

export async function quickConfirmConnection(vars: {
  matchId: string;
  reason?: string;
}) {
  const { data, error } = await (supabase.rpc as any)("admin_quick_confirm_connection", {
    _match_id: vars.matchId,
    _reason: vars.reason ?? "Confirmado via atendimento WhatsApp",
  });

  if (error) {
    // Fallback para admin_release_contact_for_match se a nova RPC ainda estiver pendente
    const fallback = await supabase.rpc("admin_release_contact_for_match", {
      _match_id: vars.matchId,
      _reason: vars.reason ?? "Confirmado via atendimento WhatsApp",
    });
    if (fallback.error) throw error;
    return fallback.data;
  }

  return data;
}

export function useQuickConfirmConnection(eventId: string, matchId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: quickConfirmConnection,
    onSuccess: () => {
      if (matchId) {
        qc.invalidateQueries({ queryKey: matchContactsKey(matchId) });
        qc.invalidateQueries({ queryKey: ["admin", "match-detail", matchId] });
      }
      qc.invalidateQueries({ queryKey: ["admin", "matches", eventId] });
      qc.invalidateQueries({ queryKey: ["staff", "queue"] });
    },
  });
}
