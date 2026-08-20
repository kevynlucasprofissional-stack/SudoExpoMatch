import type { AiSuggestionItem } from "@/lib/onboarding-ai-schema";
import type { NeedKind } from "@/lib/types";
import type { SuggestionItem, WizardItemSource } from "./types";

/**
 * Modelo de apresentação ÚNICO das sugestões das etapas 3 e 4.
 *
 * Heurística e IA alimentam a MESMA lista ("Sugeridos para você"). O selo
 * "Sugestão de IA" aparece só quando a IA realmente originou ou confirmou
 * aquele item.
 *
 * Identidade (para deduplicação):
 *  1. `taxonomyItemId` quando presente;
 *  2. fallback: label normalizado (case/acentos-insensitive).
 */
export interface FeedSuggestion {
  identity: string;
  label: string;
  taxonomyItemId: string | null;
  segmentId: string | null;
  kind: "offer" | "need";
  needKind?: NeedKind;
  /** Origem que produziu o item primeiro — vira `source` no draft. */
  source: Exclude<WizardItemSource, "user">;
  /** `true` quando a IA originou ou confirmou o item (selo). */
  fromAi: boolean;
  /** `true` quando a heurística/catálogo também produziu o item. */
  fromHeuristic: boolean;
}

export const AI_SUGGESTION_BADGE = "Sugestão de IA";

export function normalizeLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

export function suggestionIdentity(item: {
  taxonomyItemId: string | null;
  label: string;
}): string {
  return item.taxonomyItemId ? `id:${item.taxonomyItemId}` : `label:${normalizeLabel(item.label)}`;
}

/**
 * Junta sugestões heurísticas e de IA numa lista única e sem duplicatas.
 * Heurísticas vêm primeiro (aparecem imediatamente); a IA incrementa a mesma
 * lista quando chega. Um item produzido pelas duas fontes aparece UMA vez,
 * marcado com o selo de IA.
 */
export function buildSuggestionFeed(args: {
  kind: "offer" | "need";
  heuristic: SuggestionItem[];
  ai: AiSuggestionItem[];
  /** Itens já no draft — removidos da lista de sugestões. */
  existing?: Array<{ label: string; taxonomyItemId?: string | null }>;
}): FeedSuggestion[] {
  const out: FeedSuggestion[] = [];
  const byIdentity = new Map<string, FeedSuggestion>();

  const push = (
    item: {
      taxonomyItemId: string | null;
      segmentId?: string | null;
      label: string;
      needKind?: NeedKind;
    },
    source: "heuristic" | "ai",
  ) => {
    const label = item.label.trim();
    if (!label) return;
    const identity = suggestionIdentity({ taxonomyItemId: item.taxonomyItemId, label });
    const found = byIdentity.get(identity);
    if (found) {
      if (source === "ai") {
        found.fromAi = true;
        // A IA carrega needKind autoritativo por item quando a heurística não tem.
        if (item.needKind && !found.needKind) found.needKind = item.needKind;
      } else {
        found.fromHeuristic = true;
      }
      return;
    }
    const entry: FeedSuggestion = {
      identity,
      label,
      taxonomyItemId: item.taxonomyItemId,
      segmentId: item.segmentId ?? null,
      kind: args.kind,
      ...(item.needKind ? { needKind: item.needKind } : {}),
      source,
      fromAi: source === "ai",
      fromHeuristic: source === "heuristic",
    };
    byIdentity.set(identity, entry);
    out.push(entry);
  };

  for (const h of args.heuristic) {
    if (h.kind !== args.kind) continue;
    push(
      {
        taxonomyItemId: h.taxonomyItemId,
        segmentId: h.segmentId ?? null,
        label: h.label,
        ...(h.needKind ? { needKind: h.needKind } : {}),
      },
      "heuristic",
    );
  }
  for (const a of args.ai) {
    if (a.kind !== args.kind) continue;
    push(
      {
        taxonomyItemId: a.taxonomyItemId,
        segmentId: a.segmentId,
        label: a.label,
        ...(a.needKind ? { needKind: a.needKind } : {}),
      },
      "ai",
    );
  }

  const existingIdentities = new Set(
    (args.existing ?? []).map((e) =>
      suggestionIdentity({ taxonomyItemId: e.taxonomyItemId ?? null, label: e.label }),
    ),
  );
  const existingLabels = new Set((args.existing ?? []).map((e) => normalizeLabel(e.label)));

  return out.filter(
    (s) => !existingIdentities.has(s.identity) && !existingLabels.has(normalizeLabel(s.label)),
  );
}
