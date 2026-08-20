export type SessionStatus = "loading" | "error" | "ready";
export type ProfileStatus = "pending" | "error" | "success";

export type WizardPageState =
  | "session_error"
  | "session_loading"
  | "profile_error"
  | "profile_loading"
  | "hydrating"
  | "ready";

export interface ResolveWizardPageStateInput {
  session: SessionStatus;
  profile: ProfileStatus;
  hydrated: boolean;
}

/**
 * Precedência canônica das guardas do wizard:
 * 1) session error > 2) session loading > 3) profile error >
 * 4) profile loading > 5) hidratação > 6) ready.
 */
export function resolveWizardPageState(input: ResolveWizardPageStateInput): WizardPageState {
  if (input.session === "error") return "session_error";
  if (input.session === "loading") return "session_loading";
  if (input.profile === "error") return "profile_error";
  if (input.profile === "pending") return "profile_loading";
  if (!input.hydrated) return "hydrating";
  return "ready";
}
