import { z } from "zod";
import { fallback } from "@tanstack/zod-adapter";

/**
 * IMPL 11 — contratos e estado de URL da área administrativa da taxonomia.
 *
 * Regras que o shape carrega explicitamente:
 * - Toda mutação passa por RPC admin-only auditada (não há escrita direta na tabela).
 * - O `slug` é autoridade do servidor: nunca é enviado pelo formulário.
 * - Itens não são apagados: apenas ativados/desativados (histórico preservado).
 */

export const TAXONOMY_PAGE_SIZE = 20;
export const TAXONOMY_MAX_LIMIT = 100;

export const TAXONOMY_KINDS = ["offer", "need", "both"] as const;
export type TaxonomyKind = (typeof TAXONOMY_KINDS)[number];

export const TAXONOMY_KIND_TEXT: Record<TaxonomyKind, string> = {
  offer: "Oferta",
  need: "Necessidade",
  both: "Oferta e necessidade",
};

export const TAXONOMY_STATUS = ["any", "active", "inactive"] as const;
export type TaxonomyStatus = (typeof TAXONOMY_STATUS)[number];
export const TAXONOMY_STATUS_TEXT: Record<TaxonomyStatus, string> = {
  any: "Todos os status",
  active: "Somente ativos",
  inactive: "Somente inativos",
};

export const MAX_SYNONYMS = 20;
export const MAX_SYNONYM_LENGTH = 80;

const int = z.coerce.number().int();
const nonNegInt = z.coerce.number().int().nonnegative();

export const taxonomyItemRowSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  label: z.string(),
  kind: z.string(),
  segment_id: z.string().nullable(),
  segment_label: z.string().nullable(),
  description: z.string().nullable(),
  synonyms: z.array(z.string()).default([]),
  active: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
  usage_offers_active: nonNegInt,
  usage_offers_total: nonNegInt,
  usage_needs_active: nonNegInt,
  usage_needs_total: nonNegInt,
  outgoing_relations_active: nonNegInt,
  outgoing_relations_total: nonNegInt,
  incoming_relations_active: nonNegInt,
  incoming_relations_total: nonNegInt,
});
export type TaxonomyItemRow = z.infer<typeof taxonomyItemRowSchema>;

export const taxonomyPageSchema = z.object({
  items: z.array(taxonomyItemRowSchema),
  total: nonNegInt,
  limit: z.coerce.number().int().positive(),
  offset: nonNegInt,
});
export type TaxonomyPage = z.infer<typeof taxonomyPageSchema>;

export const taxonomyRelationSchema = z.object({
  id: z.string().uuid(),
  direction: z.enum(["outgoing", "incoming"]),
  relation_type: z.string(),
  weight: int,
  rationale: z.string().nullable(),
  active: z.boolean(),
  other_id: z.string().uuid(),
  other_label: z.string(),
  other_segment_id: z.string().nullable(),
  other_segment_label: z.string().nullable(),
  other_active: z.boolean(),
});
export type TaxonomyRelation = z.infer<typeof taxonomyRelationSchema>;

export const taxonomyDetailSchema = z.object({
  item: taxonomyItemRowSchema
    .omit({
      usage_offers_active: true,
      usage_offers_total: true,
      usage_needs_active: true,
      usage_needs_total: true,
      outgoing_relations_active: true,
      outgoing_relations_total: true,
      incoming_relations_active: true,
      incoming_relations_total: true,
      segment_label: true,
    })
    .extend({
      segment_label: z.string().nullable(),
      usage_offers_active: nonNegInt,
      usage_offers_total: nonNegInt,
      usage_needs_active: nonNegInt,
      usage_needs_total: nonNegInt,
      usage_match_reasons: nonNegInt,
    }),
  relations: z.array(taxonomyRelationSchema),
});
export type TaxonomyDetail = z.infer<typeof taxonomyDetailSchema>;

/** Formulário de criação/edição — mesma validação que a RPC aplica no servidor. */
export const taxonomyFormSchema = z.object({
  label: z
    .string()
    .trim()
    .min(2, "Informe ao menos 2 caracteres.")
    .max(120, "Máximo de 120 caracteres."),
  segmentId: z.string().min(1, "Escolha um segmento."),
  kind: z.enum(TAXONOMY_KINDS),
  description: z.string().trim().max(800, "Máximo de 800 caracteres.").optional().default(""),
  synonyms: z.array(z.string()),
});
export type TaxonomyFormValues = z.infer<typeof taxonomyFormSchema>;

/** Limpeza local espelhando `_sanitize_synonyms` do banco. */
export function sanitizeSynonyms(raw: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const s = item.trim();
    if (!s || s.length > MAX_SYNONYM_LENGTH) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
    if (out.length >= MAX_SYNONYMS) break;
  }
  return out;
}

export function parseSynonymsInput(raw: string): string[] {
  return sanitizeSynonyms(raw.split(","));
}

export function translateTaxonomyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  if (msg.includes("not_authenticated")) return "Sessão expirada. Entre novamente.";
  if (msg.includes("forbidden")) return "Acesso negado. Apenas administradores deste evento.";
  if (msg.includes("not_found")) return "Item de taxonomia não encontrado.";
  if (msg.includes("invalid_label")) return "O nome deve ter entre 2 e 120 caracteres.";
  if (msg.includes("invalid_kind")) return "Tipo inválido.";
  if (msg.includes("invalid_segment")) return "Segmento inválido.";
  if (msg.includes("invalid_description")) return "A descrição excede 800 caracteres.";
  if (msg.includes("slug_collision")) return "Não foi possível gerar um identificador único.";
  return "Não foi possível concluir a operação na taxonomia.";
}

// ---------------------------------------------------------------------------
// Estado de URL
// ---------------------------------------------------------------------------

export const taxonomySearchSchema = z.object({
  q: fallback(z.string(), "").default(""),
  seg: fallback(z.string(), "").default(""),
  kind: fallback(z.string(), "").default(""),
  status: fallback(z.string(), "any").default("any"),
  page: fallback(z.coerce.number().int(), 1).default(1),
  i: fallback(z.string(), "").default(""),
});
export type TaxonomySearch = z.infer<typeof taxonomySearchSchema>;

export interface NormalizedTaxonomySearch {
  q: string;
  segments: string[];
  kinds: string[];
  status: TaxonomyStatus;
  page: number;
  selected: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function list(raw: unknown, allowed?: readonly string[], max = 25): string[] {
  return (raw ?? "")
    .toString()
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x.length > 0 && (!allowed || allowed.includes(x)))
    .slice(0, max);
}

export function normalizeTaxonomySearch(s: Partial<TaxonomySearch>): NormalizedTaxonomySearch {
  const status = TAXONOMY_STATUS.includes((s.status ?? "") as never)
    ? (s.status as TaxonomyStatus)
    : "any";
  const rawPage = Number(s.page);
  const page = Math.max(1, Math.min(9999, Number.isFinite(rawPage) ? Math.trunc(rawPage) : 1));
  const raw = (s.i ?? "").toString();
  return {
    q: (s.q ?? "").toString().trim().slice(0, 120),
    segments: list(s.seg),
    kinds: list(s.kind, TAXONOMY_KINDS),
    status,
    page,
    selected: UUID_RE.test(raw) ? raw : null,
  };
}

export function statusToActive(status: TaxonomyStatus): boolean | undefined {
  if (status === "active") return true;
  if (status === "inactive") return false;
  return undefined;
}

export function taxonomyPageToOffset(page: number, pageSize = TAXONOMY_PAGE_SIZE) {
  return Math.max(0, (page - 1) * pageSize);
}

export function taxonomyTotalPages(total: number, pageSize = TAXONOMY_PAGE_SIZE) {
  return Math.max(1, Math.ceil(total / pageSize));
}

export function hasActiveTaxonomyFilters(s: NormalizedTaxonomySearch): boolean {
  return s.q !== "" || s.segments.length > 0 || s.kinds.length > 0 || s.status !== "any";
}

export const EMPTY_TAXONOMY_SEARCH: TaxonomySearch = {
  q: "",
  seg: "",
  kind: "",
  status: "any",
  page: 1,
  i: "",
};

export function kindText(kind: string): string {
  return TAXONOMY_KIND_TEXT[kind as TaxonomyKind] ?? kind;
}

export function usageTotal(row: TaxonomyItemRow): number {
  return row.usage_offers_total + row.usage_needs_total;
}
