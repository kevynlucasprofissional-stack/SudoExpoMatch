import { z } from "zod";
import { hasPrivateKey } from "@/features/admin/participantsSchemas";

/**
 * IMPL 29 — SudoExpo Intelligence.
 *
 * Contratos das RPCs admin-only de análise (`admin_intelligence_*`).
 *
 * Regras que o shape carrega explicitamente:
 * - toda taxa é entregue como NUMERADOR + DENOMINADOR, nunca como percentual
 *   pré-calculado: quem renderiza precisa poder mostrar o N;
 * - `sem_decisao` NUNCA entra em nenhum denominador (filtrado no SQL);
 * - o score de uma decisão é o score DA PERSPECTIVA de quem decidiu
 *   (`score_for_a` ou `score_for_b` conforme o `profile_id`), derivado no SQL;
 * - nenhum campo de contato trafega (validado por `hasPrivateKey` nos testes).
 *
 * Privacidade (revisão de segurança IMPL 30): as quatro RPCs são STABLE
 * SECURITY DEFINER, autorizadas por `_admin_require_event_admin(_event_id)` e
 * somente leitura. Elas NÃO retornam WhatsApp, telefone, e-mail, PIN/código de
 * acesso, hash de telefone nem qualquer credencial — não leem o schema
 * `private` nem `profile_contacts`. Nome e empresa aparecem apenas nas amostras
 * de investigação (residuais e ranking comportamental), informação já visível
 * ao administrador autorizado do evento em `/admin/participantes`.
 */

const int = z.coerce.number().int();
const nonNegInt = z.coerce.number().int().nonnegative();
const counter = z.record(z.string(), nonNegInt).default({});

export const SCORE_BUCKETS = ["0-19", "20-39", "40-59", "60-74", "75+"] as const;
export type ScoreBucket = (typeof SCORE_BUCKETS)[number];

export const PROPENSITY_BUCKETS = [
  "0-10%",
  "10-25%",
  "25-50%",
  "50-75%",
  "75-90%",
  "90-100%",
] as const;
export type PropensityBucket = (typeof PROPENSITY_BUCKETS)[number];

/** Limiares analíticos da V1 — fonte única para UI e testes. */
export const LOW_SCORE_MAX = 40;
export const HIGH_SCORE_MIN = 60;
export const PERMISSIVE_STRONG_MIN_DECISIONS = 5;
/** Abaixo disto, qualquer taxa é apresentada como amostra pequena. */
export const SMALL_SAMPLE_N = 30;

const pairSchema = z.object({ decisions: nonNegInt, interests: nonNegInt });

export const overviewBucketSchema = z.object({
  bucket: z.string(),
  decisions: nonNegInt,
  interests: nonNegInt,
  selective_decisions: nonNegInt,
  selective_interests: nonNegInt,
});
export type OverviewBucket = z.infer<typeof overviewBucketSchema>;

export const intelligenceOverviewSchema = z.object({
  event_id: z.string(),
  generated_at: z.string(),
  participants_active: nonNegInt,
  matches_active: nonNegInt,
  algorithm_versions: counter,
  decisions_total: nonNegInt,
  participants_with_decision: nonNegInt,
  interests: nonNegInt,
  declines: nonNegInt,
  mutual_matches: nonNegInt,
  selective_participants: nonNegInt,
  permissive_strong_participants: nonNegInt,
  selective_high: pairSchema,
  selective_low: pairSchema,
  low_score_interests: z.object({
    total: nonNegInt,
    permissive_strong: nonNegInt,
    selective: nonNegInt,
    other: nonNegInt,
  }),
  score_buckets: z.array(overviewBucketSchema).default([]),
  taxonomy: z.object({
    needs_total: nonNegInt,
    needs_canonical: nonNegInt,
    offers_total: nonNegInt,
    offers_canonical: nonNegInt,
  }),
  snapshot: z.object({ decisions: nonNegInt, drift: nonNegInt, unknown: nonNegInt }),
  connections: z.object({ total: nonNegInt, by_status: counter, offline: nonNegInt }),
  outcomes: z.object({
    by_kind: counter,
    total: nonNegInt,
    connections_with_outcome: nonNegInt,
  }),
});
export type IntelligenceOverview = z.infer<typeof intelligenceOverviewSchema>;

export const matrixCellSchema = z.object({
  bucket_a: z.string(),
  bucket_b: z.string(),
  matches: nonNegInt,
  mutual: nonNegInt,
  connections: nonNegInt,
});
export type MatrixCell = z.infer<typeof matrixCellSchema>;

export const reasonLiftSchema = z.object({
  code: z.string(),
  n_with: nonNegInt,
  interests_with: nonNegInt,
  n_without: nonNegInt,
  interests_without: nonNegInt,
  selective_n_with: nonNegInt,
  selective_interests_with: nonNegInt,
  selective_n_without: nonNegInt,
  selective_interests_without: nonNegInt,
});
export type ReasonLiftRow = z.infer<typeof reasonLiftSchema>;

export const kindRowSchema = z.object({
  kind: z.string(),
  matches: nonNegInt,
  decisions: nonNegInt,
  interests: nonNegInt,
  selective_decisions: nonNegInt,
  selective_interests: nonNegInt,
});
export type KindRow = z.infer<typeof kindRowSchema>;

export const residualSampleSchema = z.object({
  match_id: z.string().uuid(),
  profile_id: z.string().uuid(),
  profile_name: z.string(),
  company: z
    .string()
    .nullish()
    .transform((v) => v ?? ""),
  score: int,
  kind: z.string(),
  mutual: z.boolean().default(false),
  connection_status: z.string().nullable(),
  strong_outcome: z.boolean().default(false),
});
export type ResidualSample = z.infer<typeof residualSampleSchema>;

export const intelligenceMatcherSchema = z.object({
  event_id: z.string(),
  generated_at: z.string(),
  matches_active: nonNegInt,
  score_matrix: z.array(matrixCellSchema).default([]),
  reason_lift: z.array(reasonLiftSchema).default([]),
  kinds: z.array(kindRowSchema).default([]),
  residuals: z.object({
    total: nonNegInt,
    mutual: nonNegInt,
    with_connection: nonNegInt,
    with_strong_outcome: nonNegInt,
    sample: z.array(residualSampleSchema).default([]),
  }),
});
export type IntelligenceMatcher = z.infer<typeof intelligenceMatcherSchema>;

export const behaviorParticipantSchema = z.object({
  profile_id: z.string().uuid(),
  name: z.string(),
  company: z
    .string()
    .nullish()
    .transform((v) => v ?? ""),
  segment_id: z.string().nullable(),
  decisions: nonNegInt,
  interests: nonNegInt,
  declines: nonNegInt,
  propensity_pct: z.coerce.number(),
  avg_accepted_score: z.coerce.number().nullable(),
  selective: z.boolean().default(false),
  permissive_strong: z.boolean().default(false),
  all_interest_small_sample: z.boolean().default(false),
});
export type BehaviorParticipant = z.infer<typeof behaviorParticipantSchema>;

export const intelligenceBehaviorSchema = z.object({
  event_id: z.string(),
  generated_at: z.string(),
  participants_with_decision: nonNegInt,
  selective: nonNegInt,
  permissive_strong: nonNegInt,
  all_interest_small_sample: nonNegInt,
  decisions_total: nonNegInt,
  propensity_histogram: z
    .array(
      z.object({ bucket: z.string(), participants: nonNegInt, decisions: nonNegInt }),
    )
    .default([]),
  participants: z.array(behaviorParticipantSchema).default([]),
});
export type IntelligenceBehavior = z.infer<typeof intelligenceBehaviorSchema>;

const coverageRow = z.object({ side: z.string(), total: nonNegInt, canonical: nonNegInt });

export const intelligenceTaxonomySchema = z.object({
  event_id: z.string(),
  generated_at: z.string(),
  coverage: z.array(coverageRow).default([]),
  by_source: z
    .array(
      z.object({
        source: z.string(),
        side: z.string(),
        total: nonNegInt,
        canonical: nonNegInt,
      }),
    )
    .default([]),
  by_segment: z
    .array(
      z.object({
        segment_id: z.string(),
        segment_label: z.string().nullable(),
        total: nonNegInt,
        canonical: nonNegInt,
      }),
    )
    .default([]),
  free_text_top: z
    .array(
      z.object({
        norm: z.string(),
        label: z.string(),
        side: z.string(),
        frequency: nonNegInt,
        participants: nonNegInt,
        /** oportunidade OBSERVADA (frequência × participantes) — não é potencial de match. */
        observed_opportunity: nonNegInt,
      }),
    )
    .default([]),
  taxonomy_items_active: nonNegInt,
  taxonomy_relations_active: nonNegInt,
});
export type IntelligenceTaxonomy = z.infer<typeof intelligenceTaxonomySchema>;

export { hasPrivateKey };

export function translateIntelligenceError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  if (msg.includes("not_authenticated")) return "Sessão expirada. Entre novamente.";
  if (msg.includes("forbidden")) return "Acesso negado. Apenas administradores deste evento.";
  return "Não foi possível carregar a análise deste evento.";
}
