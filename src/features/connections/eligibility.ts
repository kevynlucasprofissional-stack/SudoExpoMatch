import type { ConnectionStatus } from "@/lib/types";

/**
 * Regra de elegibilidade de revelação de contato para o próprio participante.
 * A RPC `reveal_contact_for_match` é a autoridade — este helper apenas
 * decide se o botão fica habilitado e qual mensagem exibir.
 */
export function canParticipantRevealContact(status: ConnectionStatus | undefined | null): boolean {
  return status === "apresentados" || status === "contato_trocado" || status === "concluido";
}

export const PARTICIPANT_STATUS_MESSAGE: Record<ConnectionStatus, string> = {
  aguardando: "A conexão entrou na fila da equipe.",
  em_atendimento: "A equipe está procurando vocês no estande.",
  apresentados: "Vocês foram apresentados. O contato está disponível.",
  contato_trocado: "O contato foi trocado.",
  concluido: "Conexão concluída.",
  cancelado: "O atendimento foi cancelado.",
};
