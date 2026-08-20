import { z } from "zod";
import { hasPrivateKey } from "@/features/admin/participantsSchemas";

/**
 * IMPL 10 — contratos das RPCs admin-only de auditoria de matches.
 *
 * Regras que o shape carrega explicitamente:
 * - `label_a`/`label_b` são POR PERSPECTIVA (derivadas de match_label_for_score).
 *   Não existe aqui a label global de `matches` — ela não é auditável por lado.
 * - `decision_a`/`decision_b` vêm de `match_decisions` (autoritativa).
 * - Nenhum campo de contato trafega (validado por `hasPrivateKey` nos testes).
 */

const int = z.coerce.number().int();
const nonNegInt = z.coerce.number().int().nonnegative();
const nullableText = z
  .string()
  .nullish()
  .transform((v) => v ?? "");

export const matchRowSchema = z.object({
  id: z.string().uuid(),
  event_id: z.string(),
  kind: z.string(),
  algorithm_version: z.string(),
  a_profile_id: z.string().uuid(),
  a_name: z.string(),
  a_company: nullableText,
  a_segment_id: z.string().nullable(),
  a_segment_label: z.string().nullable(),
  b_profile_id: z.string().uuid(),
  b_name: z.string(),
  b_company: nullableText,
  b_segment_id: z.string().nullable(),
  b_segment_label: z.string().nullable(),
  score_for_a: int,
  label_a: z.string(),
  score_for_b: int,
  label_b: z.string(),
  score_gap: int,
  decision_a: z.string(),
  decision_b: z.string(),
  mutual: z.boolean(),
  connection_id: z.string().uuid().nullable(),
  connection_status: z.string().nullable(),
  /** Governança humana (IMPL 15): revisão administrativa, alheia ao matcher. */
  reviewed: z.boolean().default(false),
  reviewed_at: z.string().nullish(),
  reviewed_by: z.string().uuid().nullish(),
  generated_at: z.string(),
  updated_at: z.string(),
});
export type MatchRow = z.infer<typeof matchRowSchema>;

export const matchesPageSchema = z.object({
  items: z.array(matchRowSchema),
  total: nonNegInt,
  limit: z.coerce.number().int().positive(),
  offset: nonNegInt,
  score_side: z.string().nullish(),
  sort: z.string().nullish(),
  reviewed_filter: z.boolean().nullish(),
});
export type MatchesPage = z.infer<typeof matchesPageSchema>;

export const matchProfileSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  company: nullableText,
  city: nullableText,
  segment_id: z.string().nullable(),
  segment_label: z.string().nullable(),
  summary: nullableText,
  is_demo: z.boolean(),
  updated_at: z.string(),
});

/** Estado ATUAL da relação de taxonomia (pode divergir do histórico do match). */
export const relationCurrentSchema = z.object({
  id: z.string().uuid(),
  relation_type: z.string(),
  weight: int,
  active: z.boolean(),
  rationale_current: z.string().nullable(),
  from_item_id: z.string().uuid().nullable(),
  from_item_label: z.string().nullable(),
  from_item_segment_id: z.string().nullable(),
  from_item_active: z.boolean().nullable(),
  to_item_id: z.string().uuid().nullable(),
  to_item_label: z.string().nullable(),
  to_item_segment_id: z.string().nullable(),
  to_item_active: z.boolean().nullable(),
  updated_at: z.string().nullable(),
});

export const matchReasonSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  label: z.string(),
  weight: int,
  is_complement: z.boolean(),
  profile_need_id: z.string().uuid().nullable(),
  profile_offer_id: z.string().uuid().nullable(),
  taxonomy_relation_id: z.string().uuid().nullable(),
  relation_weight: int.nullable(),
  /** Texto congelado quando o match foi gerado. */
  rationale_historic: z.string().nullable(),
  need: z
    .object({
      id: z.string().uuid(),
      label: z.string(),
      detail: z.string().nullable(),
      need_kind: z.string().nullable(),
      is_priority: z.boolean().nullable(),
      segment_id: z.string().nullable(),
      active: z.boolean().nullable(),
    })
    .nullable(),
  offer: z
    .object({
      id: z.string().uuid(),
      label: z.string(),
      detail: z.string().nullable(),
      segment_id: z.string().nullable(),
      active: z.boolean().nullable(),
    })
    .nullable(),
  relation_current: relationCurrentSchema.nullable(),
  created_at: z.string(),
});
export type MatchReason = z.infer<typeof matchReasonSchema>;

export const matchDetailSchema = z.object({
  match: z.object({
    id: z.string().uuid(),
    event_id: z.string(),
    kind: z.string(),
    algorithm_version: z.string(),
    is_active: z.boolean(),
    score_for_a: int,
    label_a: z.string(),
    score_for_b: int,
    label_b: z.string(),
    score_gap: int,
    decision_a: z.string(),
    decision_b: z.string(),
    mutual: z.boolean(),
    generated_at: z.string(),
    updated_at: z.string(),
  }),
  profile_a: matchProfileSchema,
  profile_b: matchProfileSchema,
  connection: z
    .object({
      id: z.string().uuid(),
      status: z.string(),
      assigned_to: z.string().nullable(),
      created_at: z.string(),
      updated_at: z.string(),
      presented_at: z.string().nullable(),
      contact_exchanged_at: z.string().nullable(),
      completed_at: z.string().nullable(),
      cancelled_at: z.string().nullable(),
    })
    .nullable(),
  reasons_a: z.array(matchReasonSchema),
  reasons_b: z.array(matchReasonSchema),
});
export type MatchDetail = z.infer<typeof matchDetailSchema>;

export { hasPrivateKey };

export function translateAdminMatchesError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  if (msg.includes("not_authenticated")) return "Sessão expirada. Entre novamente.";
  if (msg.includes("forbidden")) return "Acesso negado. Apenas administradores deste evento.";
  if (msg.includes("not_found")) return "Match não encontrado.";
  return "Não foi possível carregar os matches.";
}
