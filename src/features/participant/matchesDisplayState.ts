import type { OwnMatchDTO } from "./types";

/**
 * Estado de renderização declarativo para a lista de matches.
 *
 * - `blocking_error`  → erro inicial sem cache; bloqueia com CTA de retry.
 * - `initial_loading` → primeira carga sem dados; skeletons.
 * - `empty`           → cache válido `[]`; card "sem matches ainda".
 * - `list`            → há cards a mostrar (com aviso opcional de refresh falho).
 *
 * Uma resposta válida `[]` seguida de erro de refresh é `empty` + `showRefreshError`.
 * NUNCA use `matches.length > 0` como proxy de cache — use `hasCachedResult`.
 */
export type MatchesDisplayState =
  | { kind: "blocking_error" }
  | { kind: "initial_loading" }
  | { kind: "empty"; showRefreshError: boolean }
  | { kind: "list"; matches: OwnMatchDTO[]; showRefreshError: boolean };

export function resolveMatchesDisplayState(args: {
  matches: OwnMatchDTO[];
  hasCachedResult: boolean;
  loading: boolean;
  hasError: boolean;
}): MatchesDisplayState {
  const { matches, hasCachedResult, loading, hasError } = args;
  if (hasError && !hasCachedResult) return { kind: "blocking_error" };
  if (loading && !hasCachedResult) return { kind: "initial_loading" };
  if (matches.length === 0) {
    return { kind: "empty", showRefreshError: hasError && hasCachedResult };
  }
  return {
    kind: "list",
    matches,
    showRefreshError: hasError && hasCachedResult,
  };
}
