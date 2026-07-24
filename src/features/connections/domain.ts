import type { ConnectionStatus } from "@/lib/types";

/** Rótulos em português para cada status da conexão. */
export const CONNECTION_STATUS_LABEL: Record<ConnectionStatus, string> = {
  aguardando: "Aguardando",
  em_atendimento: "Em atendimento",
  apresentados: "Apresentados",
  contato_trocado: "Contato trocado",
  concluido: "Concluída",
  cancelado: "Cancelada",
};

/** Tons visuais alinhados com o design ACIRV. */
export const CONNECTION_STATUS_TONE: Record<ConnectionStatus, string> = {
  aguardando: "bg-warning/20 text-warning-foreground border-warning/40",
  em_atendimento: "bg-accent/20 text-accent-foreground border-accent/40",
  apresentados: "bg-primary/15 text-primary border-primary/30",
  contato_trocado:
    "bg-secondary/20 text-secondary-foreground border-secondary/40",
  concluido: "bg-success/20 text-success-foreground border-success/40",
  cancelado: "bg-muted text-muted-foreground border-muted",
};

/** Próximo estado na máquina linear (nulo em terminal). */
export const NEXT_CONNECTION_STATUS: Record<
  ConnectionStatus,
  ConnectionStatus | null
> = {
  aguardando: "em_atendimento",
  em_atendimento: "apresentados",
  apresentados: "contato_trocado",
  contato_trocado: "concluido",
  concluido: null,
  cancelado: null,
};

/** Um status terminal não pode avançar nem ser cancelado. */
export function isTerminalStatus(s: ConnectionStatus): boolean {
  return s === "concluido" || s === "cancelado";
}


/** Uma conexão pode ser assumida quando ainda está livre na fila. */
export function canAssume(status: ConnectionStatus, assignedTo: string | null): boolean {
  return status === "aguardando" && !assignedTo;
}

/** Contato pode ser revelado sem override a partir de "apresentados". */
export function canRevealContact(status: ConnectionStatus): boolean {
  return (
    status === "apresentados" ||
    status === "contato_trocado" ||
    status === "concluido"
  );
}

/** Um operador pode agir na conexão? */
export function canOperate(args: {
  status: ConnectionStatus;
  assignedTo: string | null;
  userId: string | null;
  isAdmin: boolean;
}): boolean {
  if (!args.userId) return false;
  if (isTerminalStatus(args.status)) return false;
  if (args.isAdmin) return true;
  return args.assignedTo === args.userId;
}

/** Traduz erros de RPC operacional para PT-BR sanitizado. */
export function translateOperationalError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  if (msg.includes("already_assigned"))
    return "Outra pessoa da equipe assumiu esta conexão antes. Atualize a fila.";
  if (msg.includes("not_assignee"))
    return "Apenas quem assumiu esta conexão (ou um administrador) pode agir aqui.";
  if (msg.includes("invalid_assignee"))
    return "A pessoa escolhida não faz parte da equipe deste evento.";
  if (msg.includes("invalid_reassignee"))
    return "A pessoa escolhida para receber as conexões não faz parte da equipe.";
  if (msg.includes("has_active_connections"))
    return "Este membro ainda tem conexões ativas. Escolha outra pessoa para recebê-las antes de remover.";
  if (msg.includes("self_removal_confirmation_required"))
    return "Confirme explicitamente para sair da equipe.";
  if (msg.includes("invalid_transition"))
    return "Transição inválida: siga a ordem aguardando → em atendimento → apresentados → contato trocado → concluído.";
  if (msg.includes("note_required"))
    return "Cancelar exige uma observação de 3 a 500 caracteres.";
  if (msg.includes("invalid_note"))
    return "A observação precisa ter entre 1 e 1000 caracteres.";
  if (msg.includes("override_reason_required"))
    return "Revelar antes de apresentar exige uma justificativa (mínimo 3 caracteres).";
  if (msg.includes("reveal_not_allowed"))
    return "Contato só pode ser revelado a partir da etapa 'Apresentados'.";
  if (msg.includes("connection_cancelled"))
    return "Esta conexão foi cancelada — contatos não ficam disponíveis.";
  if (msg.includes("no_connection"))
    return "Ainda não existe conexão para este match.";
  if (msg.includes("not_mutual"))
    return "Ainda não houve interesse mútuo entre as duas partes.";
  if (msg.includes("connection_not_found"))
    return "Conexão não encontrada. Atualize a fila.";
  if (msg.includes("match_not_found"))
    return "Match não encontrado. Atualize a fila.";
  if (msg.includes("forbidden"))
    return "Acesso negado.";
  if (msg.includes("not_authenticated"))
    return "Sessão expirada. Entre novamente.";
  return msg || "Falha inesperada.";
}
