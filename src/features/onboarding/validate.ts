import {
  phoneCreateSchema,
  phoneEditSchema,
  wizardCreateSchema,
  wizardEditSchema,
} from "./schemas";
import type { WizardDraft, WizardMode } from "./types";

export type WizardValidationReason = "profile" | "phone" | "priority" | "target";

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
