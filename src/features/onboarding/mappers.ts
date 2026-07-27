import type { SaveOwnProfileInput } from "@/features/participant/types";
import type { OwnProfileDTO } from "@/features/participant/types";
import { createEmptyDraft, cryptoUid } from "./draft";
import type { WizardDraft, WizardNeed, WizardOffer } from "./types";

export class WizardMappingError extends Error {
  readonly code: string;
  constructor(code: string, msg?: string) {
    super(msg ?? code);
    this.code = code;
    this.name = "WizardMappingError";
  }
}

/**
 * Converte um `WizardDraft` (camelCase, UI) para o payload esperado pela
 * RPC `save_own_profile_v2` (snake_case, `Save*Input`).
 * NÃO inclui WhatsApp — o contato é chamado separadamente.
 * Falha se as regras profissionais não estiverem satisfeitas.
 */
export function mapWizardToSaveProfileInput(
  draft: WizardDraft,
  eventId: string,
): SaveOwnProfileInput {
  if (!eventId) throw new WizardMappingError("missing_event");
  const segmentId = draft.segmentId.trim();
  if (!segmentId) throw new WizardMappingError("invalid_segment");
  const offers = draft.offers.map((o) => normalizeOffer(o, segmentId));
  if (offers.length < 1 || offers.length > 5) {
    throw new WizardMappingError("invalid_offers_count");
  }
  const needs = draft.needs.map((n) => normalizeNeed(n, segmentId));
  if (needs.length < 1 || needs.length > 5) {
    throw new WizardMappingError("invalid_needs_count");
  }
  const priorityCount = needs.filter((n) => n.is_priority).length;
  if (priorityCount !== 1) {
    throw new WizardMappingError("single_priority_required");
  }

  return {
    eventId,
    name: draft.name.trim(),
    company: draft.company.trim(),
    city: draft.city.trim(),
    neighborhood: draft.neighborhood.trim() || null,
    segmentId,
    summary: draft.summary.trim(),
    consent: draft.consent === true,
    offers,
    needs,
  };
}

function normalizeOffer(o: WizardOffer, fallbackSegment: string) {
  const label = o.label.trim();
  if (!label) throw new WizardMappingError("offer_label_required");
  return {
    label: label.slice(0, 80),
    detail: o.detail?.trim() ? o.detail.trim().slice(0, 200) : null,
    segment_id: o.segmentId?.trim() || fallbackSegment,
    taxonomy_item_id: o.taxonomyItemId ?? null,
    source: o.source ?? "user",
  };
}

function normalizeNeed(n: WizardNeed, fallbackSegment: string) {
  const base = normalizeOffer(n, fallbackSegment);
  return {
    ...base,
    need_kind: n.needKind,
    is_priority: n.isPriority === true,
  };
}

/** Preenche o rascunho a partir do perfil normalizado do banco. */
export function mapProfileToWizardDraft(profile: OwnProfileDTO): WizardDraft {
  const empty = createEmptyDraft();
  return {
    ...empty,
    step: 0,
    name: profile.name ?? "",
    company: profile.company ?? "",
    city: profile.city ?? "",
    neighborhood: profile.neighborhood ?? "",
    segmentId: profile.segment_id,
    summary: profile.summary ?? "",
    consent: profile.consent === true,
    offers: profile.offers.map((o) => ({
      localId: cryptoUid(),
      label: o.label,
      detail: o.detail ?? undefined,
      segmentId: o.segment_id,
      taxonomyItemId: o.taxonomy_item_id,
    })),
    needs: profile.needs.map((n) => ({
      localId: cryptoUid(),
      label: n.label,
      detail: n.detail ?? undefined,
      segmentId: n.segment_id,
      taxonomyItemId: n.taxonomy_item_id,
      needKind: n.need_kind,
      isPriority: n.is_priority === true,
    })),
  };
}

/** Normaliza um número BR em E.164 leve. */
export function normalizePhoneE164(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 10) return null;
  if (hasPlus) return "+" + digits;
  if (digits.length === 10 || digits.length === 11) return "+55" + digits;
  return "+" + digits;
}
