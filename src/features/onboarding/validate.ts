import {
  phoneCreateSchema,
  phoneEditSchema,
  wizardCreateSchema,
  wizardEditSchema,
} from "./schemas";
import type { WizardDraft, WizardMode } from "./types";
import { findDuplicatePair } from "./itemIdentity";

export type WizardValidationReason =
  | "profile"
  | "phone"
  | "priority"
  | "target"
  | "duplicate_offer"
  | "duplicate_need";

export type WizardValidation =
  | { ok: true }
  | { ok: false; reason: WizardValidationReason; message: string };

/**
 * Validação central usada antes de habilitar o botão de submit
 * e novamente dentro de `startSubmit` como defesa em profundidade.
 * - Regras profissionais via wizardCreateSchema/wizardEditSchema.
 * - Regras de WhatsApp: obrigatório em create; opcional em edit.
 * Nunca acessa storage / rede — 100% puro.
 */
export function validateWizardForSubmit(args: {
  draft: WizardDraft;
  mode: WizardMode;
  phone: string;
}): WizardValidation {
  // Incidente de cadastro de 09/09/2026: o banco compara itens com
  // `public.norm_label` (sem acentos, espaços colapsados). Detectamos a
  // colisão AQUI, antes de qualquer RPC, sem deduplicar o rascunho em
  // silêncio — a pessoa decide qual item remover.
  const dupOffer = findDuplicatePair(args.draft.offers);
  if (dupOffer) {
    return {
      ok: false,
      reason: "duplicate_offer",
      message: `Em "o que você oferece", "${dupOffer.first.label}" e "${dupOffer.second.label}" são o mesmo item. Remova um deles.`,
    };
  }
  const dupNeed = findDuplicatePair(args.draft.needs);
  if (dupNeed) {
    return {
      ok: false,
      reason: "duplicate_need",
      message: `Em "o que você procura", "${dupNeed.first.label}" e "${dupNeed.second.label}" são o mesmo item. Remova um deles.`,
    };
  }

  const schema = args.mode === "create" ? wizardCreateSchema : wizardEditSchema;
  const parsed = schema.safeParse(args.draft);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path0 = issue?.path?.[0];
    const reason: WizardValidationReason =
      path0 === "needs" && issue?.message === "Marque exatamente uma prioridade"
        ? "priority"
        : path0 === "targetBusinessSize" ||
            path0 === "targetBusinessType" ||
            path0 === "targetSegmentId"
          ? "target"
          : "profile";
    return {
      ok: false,
      reason,
      message: issue?.message ?? "Revise os campos do formulário.",
    };
  }
  const phoneSchema = args.mode === "create" ? phoneCreateSchema : phoneEditSchema;
  const phoneParsed = phoneSchema.safeParse(args.phone);
  if (!phoneParsed.success) {
    return {
      ok: false,
      reason: "phone",
      message: phoneParsed.error.issues[0]?.message ?? "Informe um WhatsApp válido.",
    };
  }
  return { ok: true };
}

/**
 * Etapa 4 — os três controles do perfil desejado precisam estar respondidos.
 * `""` = não respondeu; `"any"` (Qualquer) é resposta válida.
 */
export function targetProfileAnswered(draft: WizardDraft): boolean {
  return (
    draft.targetBusinessSize !== "" &&
    draft.targetBusinessType !== "" &&
    draft.targetSegmentId.trim() !== ""
  );
}

/** Retorna somente o localId realmente marcado como prioridade. */
export function currentPriorityId(draft: WizardDraft): string {
  return draft.needs.find((n) => n.isPriority)?.localId ?? "";
}

export function hasSelectedPriority(draft: WizardDraft): boolean {
  return currentPriorityId(draft) !== "";
}
