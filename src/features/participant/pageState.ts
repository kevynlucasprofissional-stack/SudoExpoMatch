import type { UseParticipantSession } from "./session";
import type { OwnProfileDTO } from "./types";

export type ParticipantPageStateKind =
  | "session_error"
  | "session_loading"
  | "profile_error"
  | "profile_loading"
  | "recovery"
  | "panel";

export interface ParticipantPageState {
  kind: ParticipantPageStateKind;
}

export interface ProfileQueryLike {
  isPending: boolean;
  isError: boolean;
  data: OwnProfileDTO | null | undefined;
}

/**
 * Ordem canônica de precedência (idêntica à testada):
 *   1. session_error
 *   2. session_loading
 *   3. profile_error
 *   4. profile_loading
 *   5. recovery (profile carregado = null)
 *   6. panel   (profile carregado != null)
 *
 * Nunca interpreta erro de perfil como "sem perfil"; usuário precisa
 * de retry explícito para não criar perfil fantasma.
 */
export function resolveParticipantPageState(args: {
  session: Pick<UseParticipantSession, "status">;
  profile: ProfileQueryLike;
}): ParticipantPageState {
  const { session, profile } = args;
  if (session.status === "error") return { kind: "session_error" };
  if (session.status === "loading") return { kind: "session_loading" };
  if (profile.isError) return { kind: "profile_error" };
  if (profile.isPending) return { kind: "profile_loading" };
  if (profile.data == null) return { kind: "recovery" };
  return { kind: "panel" };
}
