/**
 * Helpers puros de UI operacional da equipe (Onda D — acabamento residual).
 *
 * Este módulo é intencionalmente independente de React/TanStack para poder
 * ser testado como funções puras. Ele centraliza:
 *
 * - Rótulos exatos dos CTAs contextuais na fila.
 * - Formatação legível pt-BR de durações operacionais.
 * - Permissão visual do formulário de nota interna (não depende de
 *   `assigned_to` — o backend continua sendo a autoridade final).
 * - Filtro de destinatários elegíveis para reatribuição (exclui o
 *   responsável atual).
 * - Helper de reset do diálogo de revelação de contato (target null ou
 *   troca de target dispara reset).
 */

import type { ConnectionStatus } from "@/lib/types";

// ---------------------------------------------------------------- CTA
/**
 * Rótulo do CTA de avanço para cada status atual (spec Onda D).
 * Estados terminais (`concluido`, `cancelado`) retornam `null`.
 */
export const OPERATIONAL_CTA_LABEL: Record<ConnectionStatus, string | null> = {
  aguardando: "Assumir atendimento",
  em_atendimento: "Marcar como apresentados",
  apresentados: "Registrar troca de contato",
  contato_trocado: "Concluir conexão",
  concluido: null,
  cancelado: null,
};

/** Rótulo do CTA operacional para o status atual (null em terminais). */
export function getOperationalCta(status: ConnectionStatus): string | null {
  return OPERATIONAL_CTA_LABEL[status];
}

// ---------------------------------------------------------------- Duração
/**
 * Formata uma duração em segundos como texto legível pt-BR com prefixo "há".
 * Cobre segundos, minutos, horas (até 48h) e dias. Retorna `"—"` para
 * valores nulos, indefinidos, negativos ou NaN.
 */
export function formatElapsedSeconds(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
    return "—";
  }
  const s = Math.floor(seconds);
  if (s < 60) {
    return s <= 1 ? "há 1 segundo" : `há ${s} segundos`;
  }
  const minutes = Math.floor(s / 60);
  if (minutes < 60) {
    return minutes === 1 ? "há 1 minuto" : `há ${minutes} minutos`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    return hours === 1 ? "há 1 hora" : `há ${hours} horas`;
  }
  const days = Math.floor(hours / 24);
  return days === 1 ? "há 1 dia" : `há ${days} dias`;
}

// ---------------------------------------------------------------- Notas internas
/**
 * Permissão VISUAL para o formulário de nota interna no drawer.
 * Qualquer usuário que já passou pela autorização staff/admin do evento
 * pode adicionar nota — independentemente de `assigned_to` ou do status
 * corrente. O backend (RPC `staff_add_connection_note`) continua sendo
 * a autoridade final via RLS.
 */
export function canAddInternalNote(): boolean {
  return true;
}

// ---------------------------------------------------------------- Reatribuição
export interface ReassignableMember {
  userId: string;
  email: string;
  role: "admin" | "staff";
}

/**
 * Retorna a lista de membros elegíveis para reatribuição, excluindo o
 * responsável atual (quando informado). Preserva a ordem original.
 */
export function eligibleReassignees<T extends { userId: string }>(
  members: readonly T[],
  currentAssignedTo: string | null | undefined,
): T[] {
  if (!currentAssignedTo) return [...members];
  return members.filter((m) => m.userId !== currentAssignedTo);
}

// ---------------------------------------------------------------- Reveal reset
/**
 * Contrato puro do efeito de reset do diálogo de revelação:
 * qualquer mudança de target — inclusive fechar (target → null) —
 * requer `reset()` da mutation. Igualdade referencial define "mesmo target".
 */
export function shouldResetReveal(
  prevTargetId: string | null | undefined,
  nextTargetId: string | null | undefined,
): boolean {
  return (prevTargetId ?? null) !== (nextTargetId ?? null);
}
