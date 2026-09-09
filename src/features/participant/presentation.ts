import type { ErrorCode, OwnMatchDTO } from "./types";
import type { ConnectionStatus, NeedKind } from "@/lib/types";

// ---------------------------------------------------------------------------
// Textos visuais — únicas fontes de tradução para presentation na rota
// /participante. Nunca importe catálogos estáticos aqui: segmentos e taxonomia
// vêm sempre do banco.
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
  aguardando: "bg-warning/15 text-warning border-warning/40",
  em_atendimento: "bg-accent/15 text-accent-foreground border-accent/40",
  apresentados: "bg-primary/15 text-primary border-primary/30",
  contato_trocado: "bg-secondary/15 text-secondary border-secondary/40",
  concluido: "bg-success/15 text-success border-success/40",
  cancelado: "bg-muted text-muted-foreground border-muted",
};

/**
 * Humaniza um slug/id em uma etiqueta visual segura, sem inventar
 * catálogo autoritativo.
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
 * Rótulo humanizado para exibição — o painel NÃO consulta a taxonomia
 * autoritativa (isso é responsabilidade exclusiva do wizard). Recebemos
 * apenas o slug/id retornado pela RPC v2 e humanizamos.
 */
export function formatSegmentLabel(segmentId: string | null | undefined): string {
  if (!segmentId) return "";
  return humanizeSlug(segmentId);
}

// ---------------------------------------------------------------------------
// Mutualidade e filtros — sempre baseados em `my_decision`/`other_decision`.
// ---------------------------------------------------------------------------

export function isMatchMutual(match: OwnMatchDTO): boolean {
  return match.my_decision === "interesse" && match.other_decision === "interesse";
}

export function filterInterests(matches: OwnMatchDTO[]): OwnMatchDTO[] {
  return matches.filter((m) => m.my_decision === "interesse");
}

/**
 * Liberação administrativa: a equipe/admin liberou o WhatsApp das duas partes,
 * mesmo sem interesse mútuo registrado. Quando isso acontece, o match precisa
 * aparecer nas conexões do participante e o contato fica visível.
 */
export function isContactReleasedByStaff(match: OwnMatchDTO): boolean {
  return match.connection?.contact_released_at != null;
}

function isVisibleConnection(match: OwnMatchDTO): boolean {
  return isMatchMutual(match) || isContactReleasedByStaff(match);
}

export function filterActiveConnections(matches: OwnMatchDTO[]): OwnMatchDTO[] {
  return matches.filter(
    (m) => isVisibleConnection(m) && m.connection != null && m.connection.status !== "cancelado",
  );
}

export function filterCancelledConnections(matches: OwnMatchDTO[]): OwnMatchDTO[] {
  return matches.filter(
    (m) => isVisibleConnection(m) && m.connection != null && m.connection.status === "cancelado",
  );
}

export function filterPendingConnections(matches: OwnMatchDTO[]): OwnMatchDTO[] {
  return matches.filter((m) => isMatchMutual(m) && m.connection == null);
}

/**
 * Identifica se um match pertence ao grupo de Alta Sinergia Mútua:
 * - Score de ambos os lados >= 60
 * - Assimetria estritamente menor que 30 (|score_me - score_other| < 30)
 */
export function isHighSynergyMatch(match: OwnMatchDTO): boolean {
  const me = match.score_me ?? 0;
  const other = match.score_other ?? 0;
  const asymmetry = Math.abs(me - other);
  return me >= 60 && other >= 60 && asymmetry < 30;
}

/**
 * Ordena os matches do participante priorizando o topo com:
 * 1. Matches de Alta Sinergia Mútua (score de ambos >= 60 e assimetria < 30),
 *    ordenados pela menor assimetria (mais equilibrados primeiro) e maior score total.
 * 2. Matches com ambos >= 60, mas com assimetria >= 30.
 * 3. Demais matches ordenados pelo score da perspectiva do participante (score_me DESC).
 */
export function sortMatchesByMutualInterest(matches: OwnMatchDTO[]): OwnMatchDTO[] {
  return [...matches].sort((a, b) => {
    const meA = a.score_me ?? 0;
    const otherA = a.score_other ?? 0;
    const gapA = Math.abs(meA - otherA);
    const tierA = meA >= 60 && otherA >= 60 ? (gapA < 30 ? 1 : 2) : 3;

    const meB = b.score_me ?? 0;
    const otherB = b.score_other ?? 0;
    const gapB = Math.abs(meB - otherB);
    const tierB = meB >= 60 && otherB >= 60 ? (gapB < 30 ? 1 : 2) : 3;

    // Prioridade por Tier
    if (tierA !== tierB) {
      return tierA - tierB;
    }

    // Dentro do Tier 1 ou Tier 2: menor assimetria primeiro
    if (tierA === 1 || tierA === 2) {
      if (gapA !== gapB) {
        return gapA - gapB; // menor assimetria primeiro
      }
      // Desempate: maior score combinado
      const sumA = meA + otherA;
      const sumB = meB + otherB;
      if (sumA !== sumB) {
        return sumB - sumA;
      }
      return meB - meA;
    }

    // Tier 3: maior score_me primeiro, depois maior soma
    if (meA !== meB) {
      return meB - meA;
    }
    return otherB - otherA;
  });
}

export function canRevealForMatch(match: OwnMatchDTO): boolean {
  const c = match.connection;
  if (!c) return false;
  if (c.status === "cancelado") return false;
  if (isContactReleasedByStaff(match)) return true;
  if (!isMatchMutual(match)) return false;
  return c.status === "apresentados" || c.status === "contato_trocado" || c.status === "concluido";
}

/**
 * Texto auxiliar exibido quando o botão de revelar contato está desabilitado,
 * explicando quando o contato será liberado.
 */
export function revealDisabledHint(match: OwnMatchDTO): string {
  if (!isMatchMutual(match)) {
    return "Contato liberado após interesse mútuo.";
  }
  const c = match.connection;
  if (!c) return "Preparando conexão — aguarde a equipe.";
  switch (c.status) {
    case "aguardando":
      return "Contato liberado assim que a equipe apresentar vocês.";
    case "em_atendimento":
      return "A equipe já está organizando a apresentação.";
    case "cancelado":
      return "Contato indisponível: atendimento cancelado.";
    default:
      return "Contato liberado assim que a equipe apresentar vocês.";
  }
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
      return "Contato ainda não disponibilizado. Tente novamente em instantes.";
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

/**
 * ErrorCodes de reveal que podem ser reintentados diretamente pelo usuário.
 * Os demais são estados de negócio e exigem ação (esperar apresentação,
 * refazer login, etc).
 */
export function isRevealRetriable(code: ErrorCode): boolean {
  return code === "network" || code === "unknown" || code === "contact_unavailable";
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

/**
 * Tradutor específico para o CTA "Procurar novos matches" — semanticamente
 * distinto de decisão. Nunca reutilize `translateDecideErrorCode` aqui.
 */
export function translateRecomputeErrorCode(code: ErrorCode): string {
  switch (code) {
    case "not_authenticated":
    case "sign_in_failed":
      return "Sua sessão expirou. Recarregue a página para continuar.";
    case "profile_not_found":
      return "Você precisa completar o perfil antes de procurar matches.";
    case "event_not_active":
      return "O evento não está mais ativo para novos matches.";
    case "network":
      return "Sem conexão. Tente novamente em instantes.";
    default:
      return "Não foi possível recalcular seus matches agora.";
  }
}
