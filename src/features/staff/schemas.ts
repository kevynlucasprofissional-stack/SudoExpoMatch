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

/**
 * Motivo administrativo exigido pelo backend quando um admin revela
 * contatos antes da etapa "apresentados". Espelha a validação da RPC
 * `staff_reveal_contact_for_match(_override_reason text)`.
 */
export const adminRevealOverrideSchema = z
  .string()
  .trim()
  .min(3, "Explique o motivo (mínimo 3 caracteres).")
  .max(500, "O motivo não pode passar de 500 caracteres.");

/**
 * Observação opcional para devolução/reatribuição — usada nos dialogs
 * de UX; o banco aceita nulo.
 */
export const optionalStaffNoteSchema = z
  .string()
  .trim()
  .max(500, "A observação não pode passar de 500 caracteres.")
  .optional()
  .transform((v) => (v && v.length > 0 ? v : undefined));

export function translateStaffRevealError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  if (msg.includes("not_authenticated")) return "Sessão expirada. Entre novamente.";
  if (msg.includes("forbidden"))
    return "Acesso negado. Apenas a equipe deste evento pode ver os contatos.";
  if (msg.includes("not_mutual")) return "Ainda não houve interesse mútuo entre as duas partes.";
  if (msg.includes("no_connection"))
    return "Ainda não existe uma conexão registrada para este match.";
  if (msg.includes("connection_cancelled"))
    return "Esta conexão foi cancelada. Os contatos não ficam disponíveis.";
  if (msg.includes("reveal_not_allowed"))
    return "Contatos só ficam liberados a partir de 'apresentados'. Peça a um administrador para justificar antes disso.";
  if (msg.includes("override_reason_required"))
    return "Justificativa obrigatória para liberar contatos antes de apresentados.";
  if (msg.includes("match_not_found")) return "Match não encontrado. Atualize a fila.";
  return "Não foi possível carregar os contatos.";
}

/**
 * Código do pin físico colocado no mapa da SudoExpo.
 * Espelha `staff_set_participant_pin` (máx. 24 caracteres, único por evento).
 */
export const pinCodeSchema = z
  .string()
  .trim()
  .min(1, "Informe a identificação do pin.")
  .max(24, "A identificação do pin pode ter no máximo 24 caracteres.");

export type PinCodeInput = z.infer<typeof pinCodeSchema>;
