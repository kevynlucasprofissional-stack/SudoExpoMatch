import { useMutation } from "@tanstack/react-query";
import { recoverProfile, translateRecoverErrorCode } from "@/features/recovery/api";
import { ApiError } from "./api";
import type { RecoverProfileInput, RecoverProfileResult, ErrorCode } from "./types";

export type { RecoverProfileInput, RecoverProfileResult } from "./types";

/** Compat: aceita string livre e delega ao tradutor por código sanitizado. */
export function translateRecoverError(codeOrMsg: string): string {
  const codes: ErrorCode[] = [
    "not_found",
    "invalid_code",
    "no_recovery",
    "locked",
    "rate_limited",
    "demo_not_recoverable",
    "current_user_already_has_profile",
    "recovery_not_configured",
    "not_authenticated",
    "sign_in_failed",
    "event_not_active",
    "invalid_input",
    "network",
  ];
  for (const c of codes) {
    if (codeOrMsg.includes(c)) return translateRecoverErrorCode(c);
  }
  return translateRecoverErrorCode("unknown");
}

export function useRecoverProfile() {
  return useMutation({
    mutationFn: async (input: RecoverProfileInput): Promise<RecoverProfileResult> => {
      try {
        return await recoverProfile(input);
      } catch (err) {
        const code = err instanceof ApiError ? err.code : "unknown";
        throw new Error(translateRecoverErrorCode(code));
      }
    },
  });
}
