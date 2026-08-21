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

/**
 * Preferência de contraparte no rascunho de UI:
 * `""` = ainda não respondeu, `"any"` = Qualquer, valor = preferência específica.
 * `"any"` é normalizado para NULL na fronteira do backend.
 */
export const ANY_PREFERENCE = "any" as const;
export type TargetBusinessSize = BusinessSize | "any" | "";
export type TargetBusinessType = BusinessType | "any" | "";
export type TargetSegmentId = string;

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
  /** Perfil desejado — ver `ANY_PREFERENCE`. */
  targetBusinessSize: TargetBusinessSize;
  targetBusinessType: TargetBusinessType;
  /** `""` = não respondeu, `"any"` = Qualquer, id de segmento = específico. */
  targetSegmentId: TargetSegmentId;
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
  | "recomputing_matches"
  | "completed"
  | "profile_failed"
  | "contact_failed"
  | "matching_failed";

export interface SubmitState {
  stage: SubmitStage;
  mode: WizardMode;
  /** `true` se o WhatsApp foi informado no envio atual. */
  withContact: boolean;
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
