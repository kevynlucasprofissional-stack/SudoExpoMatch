import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "./queryKeys";
import {
  getOwnProfile,
  saveOwnProfile,
  setOwnContact,
  ApiError,
} from "./api";
import { recomputeOwnMatches } from "@/features/matching/api";
import type {
  OwnProfileDTO,
  SaveOwnProfileInput as ApiSaveOwnProfileInput,
  ErrorCode,
} from "./types";

// Re-exports para compat com routes existentes.
export type { OwnProfileDTO, OwnProfileOffer, OwnProfileNeed } from "./types";

export const ownProfileKey = qk.ownProfile;

export function translateSaveProfileError(codeOrMsg: string): string {
  const msg = codeOrMsg;
  if (msg.includes("not_authenticated") || msg.includes("sign_in_failed"))
    return "Sessão expirada. Recarregue a página.";
  if (msg.includes("consent_required")) return "É preciso aceitar o consentimento.";
  if (msg.includes("event_not_active")) return "O evento não está ativo.";
  if (msg.includes("missing_fields")) return "Preencha todos os campos obrigatórios.";
  if (msg.includes("field_too_long")) return "Algum campo passou do limite de caracteres.";
  if (msg.includes("invalid_segment")) return "Segmento inválido.";
  if (msg.includes("invalid_offers_count")) return "Você precisa ter entre 1 e 5 ofertas.";
  if (msg.includes("invalid_needs_count")) return "Você precisa ter entre 1 e 5 necessidades.";
  if (msg.includes("invalid_offer_label"))
    return "Revise o que você oferece: cada item precisa de 2 a 120 caracteres.";
  if (msg.includes("invalid_need_label"))
    return "Revise o que você procura: cada item precisa de 2 a 120 caracteres.";
  if (msg.includes("duplicate_offer_label")) return "Há itens repetidos no que você oferece.";
  if (msg.includes("duplicate_need_label")) return "Há itens repetidos no que você procura.";
  if (msg.includes("invalid_offer_taxonomy") || msg.includes("invalid_need_taxonomy"))
    return "Algum item selecionado não pertence ao segmento escolhido.";
  return "Não foi possível salvar seu perfil. Tente novamente.";
}

export function useOwnProfile(eventId: string, opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: qk.ownProfile(eventId),
    queryFn: () => getOwnProfile(eventId),
    enabled: opts?.enabled ?? true,
    staleTime: 15_000,
  });
}

// ---------- Save (fluxo legado, mantido para compat da Onda A) ----------
// A Onda B substituirá este entry-point por mutações separadas orquestradas
// pela máquina de submit (perfil / contato / código / matching).
export interface SaveOfferInput {
  label: string;
  detail?: string;
  segment_id?: string;
  taxonomy_item_id?: string | null;
}
export interface SaveNeedInput extends SaveOfferInput {
  need_kind: import("@/lib/types").NeedKind;
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
}

function toCode(err: unknown): ErrorCode {
  return err instanceof ApiError ? err.code : "unknown";
}

export function useSaveOwnProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SaveOwnProfileInput): Promise<SaveOwnProfileResult> => {
      const apiInput: ApiSaveOwnProfileInput = {
        eventId: input.eventId,
        name: input.name,
        company: input.company,
        city: input.city,
        neighborhood: input.neighborhood ?? null,
        segmentId: input.segmentId,
        summary: input.summary,
        consent: input.consent,
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
      let profileId: string;
      try {
        profileId = await saveOwnProfile(apiInput);
      } catch (err) {
        throw new Error(translateSaveProfileError(toCode(err)));
      }

      if (input.whatsapp) {
        // Falhas de contato NÃO são silenciadas: sobem para o chamador.
        // Onda B irá tratá-las com máquina de submit + retry parcial.
        try {
          await setOwnContact({ phone_e164: input.whatsapp, sharing: true });
        } catch (err) {
          throw new Error(
            toCode(err) === "invalid_input"
              ? "WhatsApp inválido. Confira o número e tente novamente."
              : "Perfil salvo, mas o contato não foi registrado. Tente novamente.",
          );
        }
      }

      try {
        await recomputeOwnMatches(input.eventId);
      } catch {
        // Falhas de recompute não bloqueiam o fluxo legado; Onda B
        // exibirá painel de retry dedicado.
      }

      return { profileId };
    },
    onSuccess: (_r, input) => {
      qc.invalidateQueries({ queryKey: qk.ownProfile(input.eventId) });
      qc.invalidateQueries({ queryKey: qk.ownMatches(input.eventId) });
      qc.invalidateQueries({ queryKey: qk.publicStats(input.eventId) });
    },
  });
}
