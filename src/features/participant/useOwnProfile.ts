import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { NeedKind } from "@/lib/types";
import { ensureAnonSession } from "./session";

export interface OwnProfileOffer {
  id: string;
  label: string;
  detail: string | null;
  segment_id: string;
  taxonomy_item_id: string | null;
}
export interface OwnProfileNeed extends OwnProfileOffer {
  need_kind: NeedKind;
  is_priority: boolean;
}
export interface OwnProfileDTO {
  id: string;
  event_id: string;
  name: string;
  company: string;
  city: string;
  neighborhood: string | null;
  segment_id: string;
  summary: string;
  consent: boolean;
  created_at: string;
  updated_at: string;
  offers: OwnProfileOffer[];
  needs: OwnProfileNeed[];
}

export const ownProfileKey = (eventId: string) => ["own-profile", eventId] as const;

async function fetchOwnProfile(eventId: string): Promise<OwnProfileDTO | null> {
  await ensureAnonSession();
  const { data, error } = await supabase.rpc("get_own_profile_v2", { _event_id: eventId });
  if (error) throw error;
  return (data as unknown as OwnProfileDTO | null) ?? null;
}

export function useOwnProfile(eventId: string) {
  return useQuery({
    queryKey: ownProfileKey(eventId),
    queryFn: () => fetchOwnProfile(eventId),
    staleTime: 15_000,
  });
}

// ---------- Save ----------
export interface SaveOfferInput {
  label: string;
  detail?: string;
  segment_id?: string;
  taxonomy_item_id?: string;
}
export interface SaveNeedInput extends SaveOfferInput {
  need_kind: NeedKind;
  is_priority?: boolean;
}
export interface SaveOwnProfileInput {
  eventId: string;
  name: string;
  company: string;
  city: string;
  neighborhood?: string;
  segmentId: string;
  summary: string;
  consent: boolean;
  offers: SaveOfferInput[];
  needs: SaveNeedInput[];
  whatsapp?: string;
}

export interface SaveOwnProfileResult {
  profileId: string;
  recoveryCode: string | null;
}

export function translateSaveProfileError(msg: string): string {
  if (msg.includes("not_authenticated")) return "Sessão expirada. Recarregue a página.";
  if (msg.includes("consent_required")) return "É preciso aceitar o consentimento.";
  if (msg.includes("event_not_active")) return "O evento não está ativo.";
  if (msg.includes("missing_fields")) return "Preencha todos os campos obrigatórios.";
  if (msg.includes("field_too_long")) return "Algum campo passou do limite de caracteres.";
  if (msg.includes("invalid_segment")) return "Segmento inválido.";
  if (msg.includes("invalid_offers_count")) return "Você precisa ter entre 1 e 5 ofertas.";
  if (msg.includes("invalid_needs_count")) return "Você precisa ter entre 1 e 5 necessidades.";
  return "Não foi possível salvar seu perfil. Tente novamente.";
}

export function useSaveOwnProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveOwnProfileInput): Promise<SaveOwnProfileResult> => {
      await ensureAnonSession();
      const payload = {
        event_id: input.eventId,
        name: input.name,
        company: input.company,
        city: input.city,
        neighborhood: input.neighborhood ?? null,
        segment_id: input.segmentId,
        summary: input.summary,
        consent: input.consent,
        policy_version: "1",
        offers: input.offers.map((o) => ({
          label: o.label,
          detail: o.detail ?? null,
          segment_id: o.segment_id ?? input.segmentId,
          taxonomy_item_id: o.taxonomy_item_id ?? null,
        })),
        needs: input.needs.map((n) => ({
          label: n.label,
          detail: n.detail ?? null,
          segment_id: n.segment_id ?? input.segmentId,
          taxonomy_item_id: n.taxonomy_item_id ?? null,
          need_kind: n.need_kind,
          is_priority: n.is_priority ?? false,
        })),
      };
      const { data: savedId, error } = await supabase.rpc("save_own_profile_v2", {
        _payload: payload,
      });
      if (error) throw new Error(translateSaveProfileError(error.message));
      const profileId = savedId as string;

      if (input.whatsapp) {
        const { error: cErr } = await supabase.rpc("set_own_contact", {
          _phone_e164: input.whatsapp,
          _sharing: true,
        });
        if (cErr) console.warn("[sudoexpo] set_own_contact:", cErr.message);
      }

      // Gera código de recuperação (mostrado apenas uma vez, em memória).
      let recoveryCode: string | null = null;
      const { data: code, error: rErr } = await supabase.rpc("rotate_own_recovery_code");
      if (!rErr && code) recoveryCode = code as string;

      // Backend calcula matches; erros de recompute não bloqueiam o fluxo.
      const { error: mErr } = await supabase.rpc("recompute_own_matches", {
        _event_id: input.eventId,
      });
      if (mErr) console.warn("[sudoexpo] recompute_own_matches:", mErr.message);

      return { profileId, recoveryCode };
    },
    onSuccess: (_r, input) => {
      qc.invalidateQueries({ queryKey: ownProfileKey(input.eventId) });
      qc.invalidateQueries({ queryKey: ["own-matches", input.eventId] });
      qc.invalidateQueries({ queryKey: ["stats", input.eventId] });
    },
  });
}
