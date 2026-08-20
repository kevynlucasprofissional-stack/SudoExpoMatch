import type { NeedKind } from "@/lib/types";

export type { NeedKind };

export type WizardItemSource = "user" | "ai" | "heuristic";

export interface WizardOffer {
  localId: string;
  label: string;
  detail?: string;
  segmentId: string;
  taxonomyItemId: string | null;
  /** Origem do item — usado para auditoria e recompute. Default: "user". */
  source?: WizardItemSource;
}

export interface WizardNeed extends WizardOffer {
  needKind: NeedKind;
  isPriority: boolean;
}

/** Porte da empresa (seleção única) — "" = ainda não escolhido. */
export type BusinessSize = "pequeno" | "medio" | "grande";
/** Tipo principal de atuação (seleção única) — "" = ainda não escolhido. */
export type BusinessType = "comercio" | "industria" | "servico";

export interface WizardDraft {
  step: number;
  name: string;
  company: string;
  city: string;
  neighborhood: string;
  businessSize: BusinessSize | "";
  businessType: BusinessType | "";
  segmentId: string;
  niche: string;
  summary: string;
  /** Handle/URL do Instagram informado (opcional; guardado normalizado). */
  instagram: string;

  offers: WizardOffer[];
  needs: WizardNeed[];
  consent: boolean;
}

export type WizardMode = "create" | "edit";

/** Estados discretos da máquina de submit. */
export type SubmitStage =
  | "idle"
  | "saving_profile"
  | "saving_contact"
  | "generating_code"
  | "awaiting_code_confirmation"
  | "recomputing_matches"
  | "completed"
  | "profile_failed"
  | "contact_failed"
  | "code_failed"
  | "matching_failed";

export interface SubmitState {
  stage: SubmitStage;
  mode: WizardMode;
  /** `true` se o WhatsApp foi informado no envio atual. */
  withContact: boolean;
  /** Código de recuperação em memória — nunca persistido. */
  recoveryCode: string | null;
}

export interface SuggestionItem {
  taxonomyItemId: string | null;
  label: string;
  kind: "offer" | "need";
  /** IMPL 7 — segmento do próprio taxonomy item; `null` para texto livre. */
  segmentId?: string | null;
  /** IMPL 6 — presente apenas em itens `need`. */
  needKind?: NeedKind;
  confidence?: number;
}
