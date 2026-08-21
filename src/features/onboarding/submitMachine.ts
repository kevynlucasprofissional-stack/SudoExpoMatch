import type { SubmitStage, SubmitState, WizardMode } from "./types";

export type SubmitAction =
  | { type: "START"; mode: WizardMode; withContact: boolean }
  | { type: "PROFILE_OK" }
  | { type: "PROFILE_FAIL" }
  | { type: "CONTACT_OK" }
  | { type: "CONTACT_FAIL" }
  | { type: "PHONE_VERIFIED" }
  | { type: "MATCH_OK" }
  | { type: "MATCH_FAIL" }
  | { type: "RETRY_CONTACT" }
  | { type: "RETRY_MATCH" }
  | { type: "RESET" };

export function initialSubmitState(): SubmitState {
  return {
    stage: "idle",
    mode: "create",
    withContact: false,
  };
}

/** Reducer puro — sem side-effects, seguro para testes. */
export function submitReducer(state: SubmitState, action: SubmitAction): SubmitState {
  switch (action.type) {
    case "START":
      return {
        stage: "saving_profile",
        mode: action.mode,
        withContact: action.withContact,
      };
    case "RESET":
      return initialSubmitState();

    case "PROFILE_OK": {
      if (state.stage !== "saving_profile") return state;
      // Novo perfil sempre precisa de contato (obrigatório) + verificação do
      // WhatsApp. Edição só chama contato se o usuário informou WhatsApp e
      // nunca exige nova verificação.
      if (state.mode === "create") return { ...state, stage: "saving_contact" };
      if (state.withContact) return { ...state, stage: "saving_contact" };
      return { ...state, stage: "recomputing_matches" };
    }
    case "PROFILE_FAIL":
      return { ...state, stage: "profile_failed" };

    case "CONTACT_OK": {
      if (state.mode === "create") return { ...state, stage: "awaiting_phone_verification" };
      return { ...state, stage: "recomputing_matches" };
    }
    case "CONTACT_FAIL":
      return { ...state, stage: "contact_failed" };
    case "RETRY_CONTACT":
      if (state.stage !== "contact_failed") return state;
      return { ...state, stage: "saving_contact" };

    case "PHONE_VERIFIED":
      if (state.stage !== "awaiting_phone_verification") return state;
      return { ...state, stage: "recomputing_matches" };

    case "MATCH_OK":
      return { ...state, stage: "completed" };
    case "MATCH_FAIL":
      return { ...state, stage: "matching_failed" };
    case "RETRY_MATCH":
      if (state.stage !== "matching_failed") return state;
      return { ...state, stage: "recomputing_matches" };
  }
}

/** Retorna `true` se a UI deve bloquear inputs enquanto uma etapa executa. */
export function isSubmitting(state: SubmitState): boolean {
  const running: SubmitStage[] = ["saving_profile", "saving_contact", "recomputing_matches"];
  return running.includes(state.stage);
}

export function isCompleted(state: SubmitState): boolean {
  return state.stage === "completed";
}

/** Estágios em que a UI deve devolver o botão de Review para clicável. */
export function reviewIsActionable(state: SubmitState): boolean {
  const idleLike: SubmitStage[] = ["idle", "profile_failed"];
  return idleLike.includes(state.stage);
}
