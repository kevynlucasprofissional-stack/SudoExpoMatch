import { z } from "zod";
import type { EventCatalog } from "@/features/participant/types";

export const PROMPT_VERSION = "a1a2-v1";
export const AI_MODEL = "google/gemini-3.6-flash";

/** Payload que o cliente envia ao server fn. Sem PII. */
export const suggestOnboardingInputSchema = z.object({
  eventId: z.string().min(1).max(120),
  segmentId: z.string().min(1).max(60),
  summary: z.string().trim().min(1).max(800),
  existingLabels: z.array(z.string().max(80)).max(10).optional(),
});
export type SuggestOnboardingInput = z.infer<typeof suggestOnboardingInputSchema>;

export const aiSuggestionItemSchema = z.object({
  taxonomyItemId: z.string().nullable(),
  label: z.string().trim().min(1).max(80),
  kind: z.enum(["offer", "need"]),
  confidence: z.number().min(0).max(1),
  rationale: z.string().max(200).optional(),
});
export type AiSuggestionItem = z.infer<typeof aiSuggestionItemSchema>;

export const aiUnderstandingSchema = z.object({
  summary: z.string().max(400),
  mainActivity: z.string().max(120),
  keywords: z.array(z.string().max(60)).max(8),
  clarifyingQuestion: z.string().max(240).nullable().optional(),
});
export type AiUnderstanding = z.infer<typeof aiUnderstandingSchema>;

export const aiSuggestionResultSchema = z.object({
  understanding: aiUnderstandingSchema,
  offers: z.array(aiSuggestionItemSchema).max(5),
  needs: z.array(aiSuggestionItemSchema).max(5),
  source: z.enum(["ai", "heuristic"]),
  promptVersion: z.string().max(40),
});
export type AiSuggestionResult = z.infer<typeof aiSuggestionResultSchema>;

/**
 * Schema plano (sem constraints) que enviamos ao modelo, para maximizar
 * a probabilidade de saída válida. Validação/normalização acontece depois.
 */
export const modelOutputSchema = z.object({
  understanding: z.object({
    summary: z.string(),
    mainActivity: z.string(),
    keywords: z.array(z.string()),
    clarifyingQuestion: z.string().nullable(),
  }),
  offers: z.array(
    z.object({
      taxonomyItemId: z.string().nullable(),
      label: z.string(),
      confidence: z.number(),
      rationale: z.string(),
    }),
  ),
  needs: z.array(
    z.object({
      taxonomyItemId: z.string().nullable(),
      label: z.string(),
      confidence: z.number(),
      rationale: z.string(),
    }),
  ),
});
export type ModelOutput = z.infer<typeof modelOutputSchema>;

/**
 * Normaliza a saída do modelo contra o catálogo do evento.
 * - IDs inexistentes/inativos/segmento errado/kind incompatível → `null`
 * - Limita a 5 ofertas e 5 necessidades
 * - Trunca labels/rationale
 * - Deduplica pelo label case-insensitive
 */
export function normalizeAgainstCatalog(
  raw: ModelOutput,
  ctx: { segmentId: string; catalog: EventCatalog },
): { understanding: AiUnderstanding; offers: AiSuggestionItem[]; needs: AiSuggestionItem[] } {
  const byId = new Map(ctx.catalog.taxonomy.map((t) => [t.id, t]));

  function pickTaxId(id: string | null, kind: "offer" | "need"): string | null {
    if (!id) return null;
    const item = byId.get(id);
    if (!item) return null;
    if (item.segment_id !== ctx.segmentId) return null;
    if (item.kind !== kind && item.kind !== "both") return null;
    return item.id;
  }

  function clamp(str: string, max: number) {
    const s = str.trim();
    return s.length > max ? s.slice(0, max) : s;
  }

  function normList(
    list: ModelOutput["offers"],
    kind: "offer" | "need",
  ): AiSuggestionItem[] {
    const out: AiSuggestionItem[] = [];
    const seen = new Set<string>();
    for (const r of list) {
      const label = clamp(r.label ?? "", 80);
      if (!label) continue;
      const key = label.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        taxonomyItemId: pickTaxId(r.taxonomyItemId, kind),
        label,
        kind,
        confidence: Math.max(0, Math.min(1, Number(r.confidence) || 0.5)),
        rationale: r.rationale ? clamp(r.rationale, 200) : undefined,
      });
      if (out.length >= 5) break;
    }
    return out;
  }

  return {
    understanding: {
      summary: clamp(raw.understanding.summary ?? "", 400),
      mainActivity: clamp(raw.understanding.mainActivity ?? "", 120),
      keywords: (raw.understanding.keywords ?? [])
        .map((k) => clamp(k ?? "", 60))
        .filter(Boolean)
        .slice(0, 8),
      clarifyingQuestion: raw.understanding.clarifyingQuestion
        ? clamp(raw.understanding.clarifyingQuestion, 240)
        : null,
    },
    offers: normList(raw.offers ?? [], "offer"),
    needs: normList(raw.needs ?? [], "need"),
  };
}

/** Hash simples para chave de cache. */
export function hashCacheKey(parts: string[]): string {
  let h = 5381;
  const src = parts.join("|");
  for (let i = 0; i < src.length; i++) h = ((h << 5) + h + src.charCodeAt(i)) | 0;
  return `k${(h >>> 0).toString(36)}`;
}

/** Payload de log seguro em `ai_runs` — sem PII e sem summary bruto. */
export function buildAiRunInput(input: SuggestOnboardingInput, cacheKey: string) {
  return {
    hash: cacheKey,
    eventId: input.eventId,
    segmentId: input.segmentId,
    summaryLen: input.summary.length,
    existingCount: input.existingLabels?.length ?? 0,
    promptVersion: PROMPT_VERSION,
  };
}
