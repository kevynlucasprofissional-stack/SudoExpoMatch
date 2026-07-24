import { supabase } from "@/integrations/supabase/client";

let ensuring: Promise<void> | null = null;

/**
 * Garante uma sessão anônima no Supabase antes de chamar RPCs v2 SECURITY DEFINER.
 * Dedupla chamadas concorrentes em uma única promise.
 */
export function ensureAnonSession(): Promise<void> {
  if (ensuring) return ensuring;
  ensuring = (async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) return;
    const { error } = await supabase.auth.signInAnonymously();
    if (error) {
      console.warn("[sudoexpo] signInAnonymously falhou:", error.message);
    }
  })().finally(() => {
    ensuring = null;
  });
  return ensuring;
}
