import { z } from "zod";
import type { EventCatalog, CatalogTaxonomyItem } from "@/features/participant/types";

export const PROMPT_VERSION = "a1a2-v3-crossseg";

/**
 * ID EXATO do modelo no catálogo do Lovable AI Gateway (Cloud AI Models).
 * `google/gemini-2.5-flash-lite` é o mais barato/rápido da família Flash e
 * foi validado com chamada real via curl (200 + JSON estruturado).
 */
export const AI_MODEL = "google/gemini-2.5-flash-lite";

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
 * Normaliza a saída do modelo contra o catálogo ATIVO do evento.
 * - IDs inexistentes/inativos (fora do catálogo recebido) → `null`
 * - kind incompatível → `null`
 * - IMPL 5: o `segment_id` do item NÃO é mais comparado ao segmento da
 *   empresa. Sugestões cross-segment são legítimas (um restaurante pode
 *   precisar de marketing, tecnologia ou contabilidade); o segmento continua
 *   apenas como contexto do prompt.
 * - Limita a 5 ofertas e 5 necessidades
 * - Trunca labels/rationale
 * - Deduplica pelo label case-insensitive
 */
export function normalizeAgainstCatalog(
  raw: ModelOutput,
  ctx: { segmentId: string; catalog: EventCatalog },
): { understanding: AiUnderstanding; offers: AiSuggestionItem[]; needs: AiSuggestionItem[] } {
  void ctx.segmentId; // contexto do prompt, não filtro de validação (IMPL 5)
  const byId = new Map(ctx.catalog.taxonomy.map((t) => [t.id, t]));

  function pickTaxId(id: string | null, kind: "offer" | "need"): string | null {
    if (!id) return null;
    const item = byId.get(id);
    if (!item) return null;
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

async function sha256Hex(src: string): Promise<string> {
  const bytes = new TextEncoder().encode(src);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Hash SHA-256 (Web Crypto) para chave de cache/ai_runs.
 * Não é reversível — o summary bruto nunca sai daqui.
 */
export async function hashCacheKey(parts: string[]): Promise<string> {
  const hex = await sha256Hex(parts.join("|"));
  return `k${hex.slice(0, 32)}`;
}

/**
 * Hash estável do catálogo relevante: usa id + label + kind + segment_id
 * de todos os itens ativos, ordenados. Isso invalida cache automaticamente
 * quando o catálogo muda (novo item, renomeação, kind alterado, etc.),
 * sem depender só de `taxonomy.length`.
 */
export async function stableCatalogHash(items: CatalogTaxonomyItem[]): Promise<string> {
  const parts = items
    .map((t) => `${t.id}|${t.label}|${t.kind}|${t.segment_id}`)
    .sort()
    .join("\n");
  const hex = await sha256Hex(parts);
  return hex.slice(0, 16);
}

/**
 * Classifica erros da chamada ao Lovable AI Gateway.
 * - `terminal_4xx`  → não retentar; ir direto ao fallback (400, 401, 402, 403, 404, 422).
 * - `transient`     → 1 retry curto com backoff (429, 5xx, timeout, network).
 * - `unknown`       → tratar como terminal para não gastar créditos à toa.
 */
export function classifyGatewayError(err: unknown): "terminal_4xx" | "transient" | "unknown" {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  const lower = msg.toLowerCase();
  if (lower === "timeout" || /network|fetch|ecconn|econnreset|socket/i.test(lower)) return "transient";
  const m = msg.match(/\b(4\d{2}|5\d{2})\b/);
  if (m) {
    const code = Number(m[1]);
    if (code === 429 || code >= 500) return "transient";
    if (code >= 400 && code < 500) return "terminal_4xx";
  }
  if (/rate.?limit|too many/i.test(lower)) return "transient";
  return "unknown";
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
