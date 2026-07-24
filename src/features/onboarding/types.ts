import type { NeedKind } from "@/lib/types";

export type { NeedKind };

export interface WizardOffer {
  localId: string;
  label: string;
  detail?: string;
  segmentId: string;
  taxonomyItemId: string | null;
}

export interface WizardNeed extends WizardOffer {
  needKind: NeedKind;
  isPriority: boolean;
}

export interface WizardDraft {
  step: number;
  name: string;
  company: string;
  city: string;
  neighborhood: string;
  segmentId: string;
  summary: string;
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
  confidence?: number;
}
