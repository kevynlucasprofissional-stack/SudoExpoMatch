import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

export const loginSchema = z.object({
  email: z.string().trim().email("E-mail inválido"),
  password: z.string().min(6, "Senha muito curta"),
});
export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Faz logout de qualquer sessão (inclusive anônima) e entra com e-mail/senha.
 * Rascunhos em localStorage (chaves iniciadas em `sudoexpo:draft`) são preservados.
 */
export async function signInWithPassword(input: LoginInput) {
  const parsed = loginSchema.parse(input);
  // Se havia sessão anônima ativa, encerra antes para trocar de identidade.
  const { data: current } = await supabase.auth.getSession();
  if (current.session?.user?.is_anonymous) {
    await supabase.auth.signOut();
  }
  const { data, error } = await supabase.auth.signInWithPassword(parsed);
  if (error) throw error;
  return data;
}

export async function signOut() {
  await supabase.auth.signOut();
}
