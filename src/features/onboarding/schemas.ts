import { z } from "zod";
import { needKindSchema } from "@/features/participant/schemas";

export const wizardOfferSchema = z.object({
  localId: z.string().min(1),
  label: z.string().trim().min(1).max(80),
  detail: z.string().trim().max(200).optional(),
  segmentId: z.string().min(1),
  taxonomyItemId: z.string().nullable(),
});

export const wizardNeedSchema = wizardOfferSchema.extend({
  needKind: needKindSchema,
  isPriority: z.boolean(),
});

export const wizardDraftSchema = z.object({
  step: z.number().int().min(0).max(5),
  name: z.string().max(120),
  company: z.string().max(120),
  city: z.string().max(80),
  neighborhood: z.string().max(80),
  segmentId: z.string().max(60),
  summary: z.string().max(500),
  offers: z.array(wizardOfferSchema).max(5),
  needs: z.array(wizardNeedSchema).max(5),
  consent: z.boolean(),
});

/** Envelope persistido. */
export const persistedDraftSchema = z.object({
  version: z.literal(2),
  savedAt: z.string(),
  draft: wizardDraftSchema,
});

// ---------- Validações de submit (novo x edição) ----------
const baseProfessional = wizardDraftSchema.extend({
  name: z.string().trim().min(2, "Informe seu nome"),
  company: z.string().trim().min(2, "Informe sua empresa"),
  city: z.string().trim().min(2, "Informe sua cidade"),
  segmentId: z.string().trim().min(1, "Escolha um segmento"),
  summary: z.string().trim().min(20, "Resumo curto demais"),
  offers: z.array(wizardOfferSchema).min(1, "Adicione pelo menos 1 oferta").max(5),
  needs: z.array(wizardNeedSchema).min(1, "Adicione pelo menos 1 necessidade").max(5),
  consent: z.literal(true, {
    errorMap: () => ({ message: "É preciso aceitar o consentimento" }),
  }),
});

/** Modo criação — WhatsApp é obrigatório à parte via `phoneCreateSchema`. */
export const wizardCreateSchema = baseProfessional.superRefine((v, ctx) => {
  const prios = v.needs.filter((n) => n.isPriority).length;
  if (prios !== 1) {
    ctx.addIssue({
      code: "custom",
      path: ["needs"],
      message: "Marque exatamente uma prioridade",
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
  label: z.string().trim().min(1).max(80),
  kind: z.enum(["offer", "need"]),
  confidence: z.number().min(0).max(1).optional(),
});
export const suggestionResultSchema = z.object({
  items: z.array(suggestionItemSchema).max(20),
});

export type WizardDraftParsed = z.infer<typeof wizardDraftSchema>;
