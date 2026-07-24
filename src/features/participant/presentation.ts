import type {
  NeedKind,
  ConnectionStatus,
  Decision,
} from "@/lib/types";
import type { CatalogSegment, ErrorCode, OwnMatchDTO } from "./types";

// ---------------------------------------------------------------------------
// Textos visuais — únicas fontes de tradução para presentation na rota
// /participante. Nunca importe SEGMENTS/NEED_KIND_LABELS de mock-data aqui.
// ---------------------------------------------------------------------------

export const NEED_KIND_TEXT: Record<NeedKind, string> = {
  servico: "Um serviço",
  fornecedor: "Um fornecedor",
  parceiro: "Um parceiro",
  compradores: "Compradores",
  distribuidores: "Distribuidores",
  profissionais: "Profissionais",
  produtos: "Produtos",
  outro: "Outro",
};

export const CONNECTION_STATUS_TEXT: Record<ConnectionStatus, string> = {
  aguardando: "Aguardando equipe",
  em_atendimento: "Equipe organizando",
  apresentados: "Apresentados",
  contato_trocado: "Contato trocado",
  concluido: "Concluída",
  cancelado: "Cancelada",
};

export const CONNECTION_STATUS_TONE: Record<ConnectionStatus, string> = {
  aguardando: "bg-warning/15 text-warning-foreground border-warning/40",
  em_atendimento: "bg-accent/15 text-accent-foreground border-accent/40",
  apresentados: "bg-primary/15 text-primary border-primary/30",
  contato_trocado:
    "bg-secondary/15 text-secondary-foreground border-secondary/40",
  concluido: "bg-success/15 text-success-foreground border-success/40",
  cancelado: "bg-muted text-muted-foreground border-muted",
};

/**
 * Humaniza um slug/id em uma etiqueta visual segura, sem inventar
 * catálogo autoritativo. Não pretende resolver mapeamento canônico —
 * apenas dá uma versão legível.
 */
export function humanizeSlug(slug: string): string {
  if (!slug) return "";
  return slug
    .replace(/[_-]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Retorna o label do segmento a partir do catálogo carregado quando
 * disponível; do contrário, humaniza o slug puramente para exibição.
 */
export function formatSegmentLabel(
  segmentId: string | null | undefined,
  segments?: readonly CatalogSegment[] | null,
): string {
  if (!segmentId) return "";
  const match = segments?.find((s) => s.id === segmentId);
  if (match) return match.label;
  return humanizeSlug(segmentId);
}

// ---------------------------------------------------------------------------
// Mutualidade e filtros — sempre baseados em `my_decision`/`other_decision`.
// `connection` reflete apenas o estado operacional pós-mutualidade.
// ---------------------------------------------------------------------------

export function isMatchMutual(match: OwnMatchDTO): boolean {
  return (
    match.my_decision === "interesse" && match.other_decision === "interesse"
  );
}

export function filterInterests(matches: OwnMatchDTO[]): OwnMatchDTO[] {
  return matches.filter((m) => m.my_decision === "interesse");
}

/**
 * Conexões ativas: interesse mútuo + conexão presente e não cancelada.
 */
export function filterActiveConnections(
  matches: OwnMatchDTO[],
): OwnMatchDTO[] {
  return matches.filter(
    (m) =>
      isMatchMutual(m) &&
      m.connection != null &&
      m.connection.status !== "cancelado",
  );
}

/**
 * Conexões canceladas (interesse mútuo com conexão cancelada) — exibidas
 * em seção própria, sem opção de revelar contato.
 */
export function filterCancelledConnections(
  matches: OwnMatchDTO[],
): OwnMatchDTO[] {
  return matches.filter(
    (m) =>
      isMatchMutual(m) &&
      m.connection != null &&
      m.connection.status === "cancelado",
  );
}

/**
 * Mutualidade sem conexão ainda materializada — mostrar "preparando".
 */
export function filterPendingConnections(
  matches: OwnMatchDTO[],
): OwnMatchDTO[] {
  return matches.filter((m) => isMatchMutual(m) && m.connection == null);
}

/**
 * Verifica se um match está apto a revelar contato. Backend é a autoridade;
 * este helper apenas define UI (botão habilitado / mensagem prévia).
 */
export function canRevealForMatch(match: OwnMatchDTO): boolean {
  if (!isMatchMutual(match)) return false;
  const c = match.connection;
  if (!c) return false;
  return (
    c.status === "apresentados" ||
    c.status === "contato_trocado" ||
    c.status === "concluido"
  );
}

// ---------------------------------------------------------------------------
// Tradutores de erro sanitizados — trabalham com ErrorCode, não com string.
// ---------------------------------------------------------------------------

export function translateRevealErrorCode(code: ErrorCode): string {
  switch (code) {
    case "not_mutual":
      return "Ainda não houve interesse mútuo.";
    case "not_yet_introduced":
      return "A equipe da ACIRV ainda vai apresentar vocês. Aguarde no estande.";
    case "contact_sharing_disabled":
      return "Esta pessoa desativou o compartilhamento de contato.";
    case "contact_unavailable":
      return "Contato ainda não disponibilizado por esta pessoa.";
    case "not_a_participant":
      return "Você não faz parte deste match.";
    case "not_authenticated":
    case "sign_in_failed":
      return "Faça login novamente para ver o contato.";
    case "network":
      return "Sem conexão. Tente novamente.";
    case "reveal_forbidden":
      return "Este contato ainda não está disponível.";
    default:
      return "Não foi possível carregar o contato. Tente novamente.";
  }
}

export function translateDecideErrorCode(code: ErrorCode): string {
  switch (code) {
    case "not_authenticated":
    case "sign_in_failed":
      return "Faça login novamente.";
    case "match_not_found":
      return "Match não encontrado.";
    case "match_inactive":
      return "Este match não está mais ativo.";
    case "not_a_participant":
      return "Você não faz parte deste match.";
    case "decision_locked_by_connection":
      return "A equipe já iniciou o atendimento — não é possível recusar agora.";
    case "network":
      return "Sem conexão. Tente novamente.";
    default:
      return "Não foi possível registrar sua decisão.";
  }
}
