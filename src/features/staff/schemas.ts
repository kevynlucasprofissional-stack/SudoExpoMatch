import { z } from "zod";

/**
 * Observação exigida ao cancelar uma conexão na fila da equipe.
 * Reflete a regra do RPC `staff_advance_connection` no banco.
 */
export const cancelNoteSchema = z
  .string()
  .trim()
  .min(3, "A observação precisa ter pelo menos 3 caracteres.")
  .max(500, "A observação não pode passar de 500 caracteres.");

export type CancelNoteInput = z.infer<typeof cancelNoteSchema>;

export function translateStaffRevealError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  if (msg.includes("not_authenticated")) return "Sessão expirada. Entre novamente.";
  if (msg.includes("forbidden"))
    return "Acesso negado. Apenas a equipe deste evento pode ver os contatos.";
  if (msg.includes("not_mutual"))
    return "Ainda não houve interesse mútuo entre as duas partes.";
  if (msg.includes("no_connection"))
    return "Ainda não existe uma conexão registrada para este match.";
  if (msg.includes("connection_cancelled"))
    return "Esta conexão foi cancelada. Os contatos não ficam disponíveis.";
  if (msg.includes("match_not_found"))
    return "Match não encontrado. Atualize a fila.";
  return "Não foi possível carregar os contatos.";
}
