import { z } from "zod";
import { needKindSchema } from "@/features/participant/schemas";

export const wizardOfferSchema = z.object({
  localId: z.string().min(1),
  label: z
    .string()
    .trim()
    .min(2, "Descreva com pelo menos 2 caracteres")
    .max(80),
  detail: z.string().trim().max(200).optional(),
  segmentId: z.string().min(1),
  taxonomyItemId: z.string().nullable(),
});

export const wizardNeedSchema = wizardOfferSchema.extend({
  needKind: needKindSchema,
  isPriority: z.boolean(),
});

export const businessSizeSchema = z.enum(["pequeno", "medio", "grande"]);
export const businessTypeSchema = z.enum(["comercio", "industria", "servico"]);

/** Segmento genérico — exige nicho descrevendo a atividade. */
export const OTHER_SEGMENT_ID = "outros";

export const wizardDraftSchema = z.object({
  step: z.number().int().min(0).max(4),
  name: z.string().max(120),
  company: z.string().max(120),
  city: z.string().max(80),
  neighborhood: z.string().max(80),
  businessSize: z.union([businessSizeSchema, z.literal("")]),
  businessType: z.union([businessTypeSchema, z.literal("")]),
  segmentId: z.string().max(60),
  niche: z.string().max(120),
  targetBusinessSize: z.union([businessSizeSchema, z.literal("any"), z.literal("")]),
  targetBusinessType: z.union([businessTypeSchema, z.literal("any"), z.literal("")]),
  targetSegmentId: z.string().max(60),
  summary: z.string().max(500),
  instagram: z.string().max(300),
  offers: z.array(wizardOfferSchema).max(5),
  needs: z.array(wizardNeedSchema).max(5),
  consent: z.boolean(),
});

/** Envelope persistido (aceita rascunhos v2 antigos; grava sempre v3). */
export const persistedDraftSchema = z.object({
  version: z.union([z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  savedAt: z.string(),
  draft: wizardDraftSchema.partial({
    businessSize: true,
    businessType: true,
    niche: true,
    instagram: true,
    targetBusinessSize: true,
    targetBusinessType: true,
    targetSegmentId: true,
  }),
});

// ---------- Validações de submit (novo x edição) ----------
const baseProfessional = wizardDraftSchema.extend({
  name: z.string().trim().min(2, "Informe seu nome"),
  company: z.string().trim().min(2, "Informe sua empresa"),
  city: z.string().trim().min(2, "Informe sua cidade"),
  businessSize: businessSizeSchema,
  businessType: businessTypeSchema,
  segmentId: z.string().trim().min(1, "Escolha um segmento"),
  summary: z.string().trim().min(1, "Informe um resumo").max(500),
  offers: z.array(wizardOfferSchema).min(1, "Adicione pelo menos 1 oferta").max(5),
  needs: z.array(wizardNeedSchema).min(1, "Adicione pelo menos 1 necessidade").max(5),
  consent: z.literal(true, {
    errorMap: () => ({ message: "É preciso aceitar o consentimento" }),
  }),
});

/** Modo criação — WhatsApp é obrigatório à parte via `phoneCreateSchema`. */
export const wizardCreateSchema = baseProfessional.superRefine((v, ctx) => {
  // Perfil desejado: precisa ser respondido na UI. "any" (Qualquer) é válido
  // e vira NULL na fronteira do backend.
  const targetFields = [
    ["targetBusinessSize", v.targetBusinessSize, "Escolha o porte que você procura"],
    ["targetBusinessType", v.targetBusinessType, "Escolha o tipo principal que você procura"],
    ["targetSegmentId", (v.targetSegmentId ?? "").trim(), "Escolha o segmento que você procura"],
  ] as const;
  for (const [path, value, message] of targetFields) {
    if (!value) ctx.addIssue({ code: "custom", path: [path], message });
  }
  const prios = v.needs.filter((n) => n.isPriority).length;
  if (prios !== 1) {
    ctx.addIssue({
      code: "custom",
      path: ["needs"],
      message: "Marque exatamente uma prioridade",
    });
  }
  if (v.segmentId.trim() === OTHER_SEGMENT_ID && v.niche.trim().length < 3) {
    ctx.addIssue({
      code: "custom",
      path: ["niche"],
      message: "Descreva sua atividade no campo nicho",
    });
  }
});

/** Modo edição — mesmas regras profissionais, WhatsApp opcional. */
export const wizardEditSchema = wizardCreateSchema;

/** Regras para o WhatsApp separado do rascunho. */
export const phoneCreateSchema = z
  .string()
  .trim()
  .refine((v) => v.replace(/\D/g, "").length >= 10, {
    message: "WhatsApp inválido",
  });

export const phoneEditSchema = z
  .string()
  .trim()
  .refine((v) => v === "" || v.replace(/\D/g, "").length >= 10, {
    message: "WhatsApp inválido",
  });

// ---------- Suggestion Provider ----------
export const suggestionItemSchema = z.object({
  taxonomyItemId: z.string().nullable(),
  label: z.string().trim().min(2).max(80),
  kind: z.enum(["offer", "need"]),
  /** IMPL 7 — segmento autoritativo do taxonomy item (null = texto livre). */
  segmentId: z.string().min(1).nullable().optional(),
  needKind: needKindSchema.optional(),
  confidence: z.number().min(0).max(1).optional(),
});
export const suggestionResultSchema = z.object({
  items: z.array(suggestionItemSchema).max(20),
});

export type WizardDraftParsed = z.infer<typeof wizardDraftSchema>;
