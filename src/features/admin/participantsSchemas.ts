import { z } from "zod";

/**
 * IMPL 9 — Contratos de resposta das RPCs admin-only de governança de
 * participantes. As RPCs devolvem jsonb; validamos aqui para que a UI nunca
 * receba shape inesperado e para documentar o que o backend PODE devolver.
 *
 * Regra de privacidade: nenhum campo de contato (whatsapp, e-mail, telefone,
 * código de recuperação) faz parte deste contrato. Se aparecer, `hasPrivateKey`
 * detecta e os testes falham.
 */

const nonNegInt = z.coerce.number().int().nonnegative();

/** Texto que o banco pode devolver nulo — a UI sempre recebe string. */
const nullableText = z
  .string()
  .nullish()
  .transform((v) => v ?? "");

export const participantRowSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  company: nullableText,
  city: nullableText,
  segment_id: z.string().nullable(),
  segment_label: z.string().nullable(),
  segment_emoji: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  offers_count: nonNegInt,
  needs_count: nonNegInt,
  matches_count: nonNegInt,
  connections_count: nonNegInt,
});
export type ParticipantRow = z.infer<typeof participantRowSchema>;

export const participantsPageSchema = z.object({
  items: z.array(participantRowSchema),
  total: nonNegInt,
  limit: z.coerce.number().int().positive(),
  offset: nonNegInt,
});
export type ParticipantsPage = z.infer<typeof participantsPageSchema>;

export const participantOfferSchema = z.object({
  id: z.string().uuid(),
  label: z.string(),
  detail: z.string().nullable(),
  segment_id: z.string().nullable(),
  taxonomy_item_id: z.string().nullable(),
  source: z.string(),
  user_confirmed: z.boolean(),
  active: z.boolean(),
  sort_order: z.coerce.number().int(),
});

export const participantNeedSchema = participantOfferSchema.extend({
  need_kind: z.string(),
  is_priority: z.boolean(),
});

export const participantMatchSchema = z.object({
  id: z.string().uuid(),
  other_profile_id: z.string().uuid(),
  other_name: z.string(),
  other_company: nullableText,
  other_segment_id: z.string().nullable(),
  kind: z.string(),
  /** Classificação global legada do match — nunca usar como label do participante. */
  label: z.string(),
  score_for_participant: z.coerce.number().int(),
  score_for_other: z.coerce.number().int(),
  /** Impl 1 — classificação por perspectiva; fallback recalculado se ausente. */
  label_for_participant: z.string().nullish(),
  label_for_other: z.string().nullish(),
  decision_participant: z.string(),
  decision_other: z.string(),
  algorithm_version: z.string(),
  generated_at: z.string(),
  updated_at: z.string(),
});

export const participantConnectionSchema = z.object({
  id: z.string().uuid(),
  match_id: z.string().uuid(),
  status: z.string(),
  other_profile_id: z.string().uuid(),
  other_name: z.string(),
  other_company: nullableText,
  assigned_to: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  completed_at: z.string().nullable(),
  cancelled_at: z.string().nullable(),
});

export const participantHistorySchema = z.object({
  kind: z.string(),
  action: z.string().nullable(),
  previous_status: z.string().nullable(),
  new_status: z.string().nullable(),
  created_at: z.string(),
});

export const participantDetailSchema = z.object({
  profile: z.object({
    id: z.string().uuid(),
    event_id: z.string(),
    name: z.string(),
    company: nullableText,
    city: nullableText,
    neighborhood: z.string().nullable(),
    segment_id: z.string().nullable(),
    segment_label: z.string().nullable(),
    summary: nullableText,
    business_size: z.string().nullable().default(null),
    business_type: z.string().nullable().default(null),
    niche: z.string().nullable().default(null),
    is_demo: z.boolean(),
    created_at: z.string(),
    updated_at: z.string(),
  }),
  offers: z.array(participantOfferSchema),
  needs: z.array(participantNeedSchema),
  matches: z.array(participantMatchSchema),
  connections: z.array(participantConnectionSchema),
  history: z.array(participantHistorySchema),
});
export type ParticipantDetail = z.infer<typeof participantDetailSchema>;

/** Chaves de contato que jamais devem trafegar nesta área administrativa. */
export const FORBIDDEN_PRIVATE_KEYS = [
  "whatsapp",
  "email",
  "e_mail",
  "phone",
  "phone_e164",
  "recovery_code",
  "owner_id",
] as const;

/** Varre recursivamente um payload procurando chave de contato/PII. */
export function hasPrivateKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasPrivateKey);
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const key = k.toLowerCase();
      if (FORBIDDEN_PRIVATE_KEYS.some((f) => key.includes(f))) return true;
      if (hasPrivateKey(v)) return true;
    }
  }
  return false;
}

export function translateAdminParticipantsError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  if (msg.includes("not_authenticated")) return "Sessão expirada. Entre novamente.";
  if (msg.includes("forbidden")) return "Acesso negado. Apenas administradores deste evento.";
  if (msg.includes("not_found")) return "Participante não encontrado.";
  return "Não foi possível carregar os participantes.";
}
