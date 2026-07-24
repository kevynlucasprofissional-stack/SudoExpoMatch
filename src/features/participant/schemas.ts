import { z } from "zod";

// ---------- Enums espelhados ao banco ----------
export const needKindSchema = z.enum([
  "servico",
  "fornecedor",
  "parceiro",
  "compradores",
  "distribuidores",
  "profissionais",
  "produtos",
  "outro",
]);

export const decisionSchema = z.enum(["interesse", "agora_nao", "sem_decisao"]);

export const matchKindSchema = z.enum([
  "direto",
  "inverso",
  "bidirecional",
  "complementar",
  "hibrido",
]);

export const matchLabelSchema = z.enum([
  "alta_compatibilidade",
  "boa_oportunidade",
  "conexao_possivel",
]);

export const connectionStatusSchema = z.enum([
  "aguardando",
  "em_atendimento",
  "apresentados",
  "contato_trocado",
  "concluido",
  "cancelado",
]);

// ---------- Perfil próprio ----------
export const ownProfileOfferSchema = z.object({
  id: z.string(),
  label: z.string(),
  detail: z.string().nullable(),
  segment_id: z.string(),
  taxonomy_item_id: z.string().nullable(),
});

export const ownProfileNeedSchema = ownProfileOfferSchema.extend({
  need_kind: needKindSchema,
  is_priority: z.boolean(),
});

export const ownProfileSchema = z.object({
  id: z.string(),
  event_id: z.string(),
  name: z.string(),
  company: z.string(),
  city: z.string(),
  neighborhood: z.string().nullable(),
  segment_id: z.string(),
  summary: z.string(),
  consent: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
  offers: z.array(ownProfileOfferSchema),
  needs: z.array(ownProfileNeedSchema),
});

export const ownProfileOrNullSchema = ownProfileSchema.nullable();

// ---------- Matches ----------
export const matchReasonSchema = z.object({
  code: z.string(),
  label: z.string(),
  weight: z.number().int(),
});

export const matchOtherOfferSchema = z.object({
  label: z.string(),
  detail: z.string().nullable(),
});

export const matchOtherNeedSchema = matchOtherOfferSchema.extend({
  need_kind: needKindSchema,
  is_priority: z.boolean(),
});

export const matchOtherSchema = z.object({
  name: z.string(),
  company: z.string(),
  city: z.string(),
  neighborhood: z.string().nullable(),
  segment_id: z.string(),
  summary: z.string(),
});

export const matchConnectionSchema = z
  .object({
    id: z.string(),
    status: connectionStatusSchema,
    notes: z.string().nullable(),
  })
  .nullable();

export const ownMatchSchema = z.object({
  match_id: z.string(),
  my_profile_id: z.string(),
  other_profile_id: z.string(),
  kind: matchKindSchema,
  label: matchLabelSchema,
  score_me: z.number().int(),
  score_other: z.number().int(),
  created_at: z.string(),
  updated_at: z.string(),
  generated_at: z.string(),
  other: matchOtherSchema,
  other_offers: z.array(matchOtherOfferSchema),
  other_needs: z.array(matchOtherNeedSchema),
  reasons: z.array(matchReasonSchema),
  my_decision: decisionSchema,
  other_decision: decisionSchema,
  connection: matchConnectionSchema,
});

export const ownMatchesSchema = z.array(ownMatchSchema);

export const decideMatchResultSchema = z.object({
  my_decision: decisionSchema,
  other_decision: decisionSchema,
  mutual: z.boolean(),
  connection_id: z.string().nullable(),
  connection_status: connectionStatusSchema.nullable(),
  connection_created: z.boolean(),
});

// ---------- Recompute ----------
export const recomputeResultSchema = z.number().int().nonnegative();

// ---------- Contato revelado ----------
export const revealedContactSchema = z.object({
  phone_e164: z.string(),
  email: z.string().nullable(),
  name: z.string(),
  company: z.string(),
});
export const revealedContactListSchema = z.array(revealedContactSchema);

// ---------- Payload de gravação ----------
const saveOfferPayloadSchema = z.object({
  label: z.string().min(1),
  detail: z.string().nullable().optional(),
  segment_id: z.string().min(1),
  taxonomy_item_id: z.string().nullable(),
});
const saveNeedPayloadSchema = saveOfferPayloadSchema.extend({
  need_kind: needKindSchema,
  is_priority: z.boolean().optional(),
});

export const saveOwnProfilePayloadSchema = z.object({
  event_id: z.string().min(1),
  name: z.string().min(1),
  company: z.string().min(1),
  city: z.string().min(1),
  neighborhood: z.string().nullable(),
  segment_id: z.string().min(1),
  summary: z.string().min(1),
  consent: z.literal(true),
  policy_version: z.string(),
  offers: z.array(saveOfferPayloadSchema).min(1).max(5),
  needs: z.array(saveNeedPayloadSchema).min(1).max(5),
});
