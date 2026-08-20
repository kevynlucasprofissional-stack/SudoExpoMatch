import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { ErrorCode } from "./types";

/**
 * Erro sanitizado da camada de sessão. Nunca carrega payload.
 */
export class SessionError extends Error {
  readonly code: Extract<ErrorCode, "sign_in_failed" | "network" | "unknown">;
  constructor(
    code: Extract<ErrorCode, "sign_in_failed" | "network" | "unknown">,
    causeMessage?: string,
  ) {
    super(code);
    this.code = code;
    this.name = "SessionError";
    // Não anexa objeto de erro do supabase para evitar vazamento de payload.
    if (causeMessage) (this as unknown as { cause: string }).cause = causeMessage;
  }
}

let inflight: Promise<User> | null = null;

/**
 * Garante uma sessão utilizável (anônima ou permanente) para chamar RPCs v2.
 * - Reutiliza sessão existente (inclusive staff/admin) sem substituir.
 * - Só faz signInAnonymously quando não há sessão.
 * - Deduplica chamadas concorrentes.
 * - Propaga falhas como SessionError sanitizado (nunca console.warn).
 */
export async function ensureParticipantSession(): Promise<User> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw new SessionError("sign_in_failed", error.message);
      if (data.session?.user) return data.session.user;
      const { data: signed, error: signErr } = await supabase.auth.signInAnonymously();
      if (signErr || !signed?.user) {
        throw new SessionError("sign_in_failed", signErr?.message);
      }
      return signed.user;
    } catch (err) {
      if (err instanceof SessionError) throw err;
      throw new SessionError("unknown", err instanceof Error ? err.message : undefined);
    }
  })();
  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

/**
 * Encerra a sessão anônima atual e abre uma nova, em branco.
 *
 * Usado pelo "Resetar formulário": impede que o perfil já salvo pela pessoa
 * anterior reapareça para quem for usar o mesmo dispositivo em seguida. O
 * perfil permanece no backend (recuperável por código/WhatsApp) — apenas o
 * vínculo local é descartado. Sessões permanentes (equipe/admin) NÃO são
 * encerradas.
 */
export async function resetParticipantSession(): Promise<void> {
  inflight = null;
  try {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
    const anonymous = (user as unknown as { is_anonymous?: boolean } | undefined)?.is_anonymous;
    if (user && anonymous === false) return; // staff/admin: preserva sessão
    if (user) await supabase.auth.signOut();
  } catch {
    /* sessão inconsistente nunca bloqueia o reset local */
  }
  try {
    await ensureParticipantSession();
  } catch {
    /* nova sessão é reestabelecida pelo hook no próximo render */
  }
}

export type ParticipantSessionStatus = "loading" | "ready" | "error";

export interface UseParticipantSession {
  status: ParticipantSessionStatus;
  user: User | null;
  error: SessionError | null;
  isReady: boolean;
  retry: () => Promise<void>;
}

/**
 * Hook consumível pelas rotas. Bloqueia execução de queries de perfil/catálogo/
 * matches/recuperação até `isReady === true`.
 */
export function useEnsureParticipantSession(): UseParticipantSession {
  const [status, setStatus] = useState<ParticipantSessionStatus>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<SessionError | null>(null);
  const versionRef = useRef(0);

  const run = useCallback(async () => {
    const v = ++versionRef.current;
    setStatus("loading");
    setError(null);
    try {
      const u = await ensureParticipantSession();
      if (v !== versionRef.current) return;
      setUser(u);
      setStatus("ready");
    } catch (err) {
      if (v !== versionRef.current) return;
      const se = err instanceof SessionError ? err : new SessionError("unknown");
      setError(se);
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void run();
  }, [run]);

  return {
    status,
    user,
    error,
    isReady: status === "ready",
    retry: run,
  };
}
