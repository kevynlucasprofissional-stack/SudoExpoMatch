import type {
  GraphEdge,
  GraphNode,
  InterestState,
  MatchGraph,
} from "@/features/admin/graphSchemas";

/**
 * Lógica pura do Mapa de conexões: cor/estado da aresta, tamanho do nó e
 * filtragem em memória. Nada de canvas aqui — este módulo é testável direto.
 */

/** Paleta definida no plano aprovado. */
export const INTEREST_COLOR: Record<InterestState, string> = {
  /** exatamente um lado marcou interesse */
  single: "#27e300",
  /** ninguém decidiu ainda */
  none: "#1b26ae",
  /** interesse mútuo */
  mutual: "#ff7c31",
  /** houve decisão, mas nenhum interesse (agora_nao) */
  declined: "#6b7280",
};

export const INTEREST_LABEL: Record<InterestState, string> = {
  mutual: "Interesse mútuo",
  single: "Um lado com interesse",
  none: "Ninguém decidiu",
  declined: "Sem interesse (agora não)",
};

export const INTEREST_OPACITY: Record<InterestState, string> = {
  mutual: "1",
  single: "0.9",
  none: "0.55",
  declined: "0.25",
};

/** Mesma escala do `INTEREST_OPACITY`, em número, para pintar no canvas. */
export const INTEREST_ALPHA: Record<InterestState, number> = {
  mutual: 1,
  single: 0.9,
  none: 0.55,
  declined: 0.25,
};

/** Fator aplicado a arestas que NÃO tocam o nó sob o cursor. */
export const HOVER_DIM_FACTOR = 0.12;

/**
 * Mesma derivação do SQL, replicada aqui para teste e para uso em dados
 * derivados no cliente. `agora_nao` e `sem_decisao` nunca contam como interesse.
 */
export function deriveInterestState(decisionA: string, decisionB: string): InterestState {
  const a = decisionA === "interesse";
  const b = decisionB === "interesse";
  if (a && b) return "mutual";
  if (a || b) return "single";
  if (decisionA === "agora_nao" || decisionB === "agora_nao") return "declined";
  return "none";
}

export function edgeColor(edge: Pick<GraphEdge, "interest_state">): string {
  return INTEREST_COLOR[edge.interest_state];
}

export function edgeWidth(edge: Pick<GraphEdge, "interest_state">): number {
  if (edge.interest_state === "mutual") return 2.4;
  if (edge.interest_state === "single") return 1.6;
  if (edge.interest_state === "declined") return 0.6;
  return 1;
}

/** Tamanho do nó cresce com o número de matches, com teto visual. */
export function nodeRadius(node: Pick<GraphNode, "degree">): number {
  return Math.min(3 + Math.sqrt(Math.max(node.degree, 0)) * 1.2, 12);
}

/** Cor determinística por segmento (mesma cor a cada carga). */
export function segmentColor(segmentId: string | null): string {
  if (!segmentId) return "#94a3b8";
  let hash = 0;
  for (let i = 0; i < segmentId.length; i += 1) {
    hash = (hash * 31 + segmentId.charCodeAt(i)) % 360;
  }
  return `hsl(${hash} 70% 62%)`;
}

export interface GraphFilters {
  /** estados de interesse visíveis */
  states: InterestState[];
  /** score mínimo considerando o maior lado */
  minScore: number | null;
  /** score máximo considerando o maior lado (investigação de falsos negativos) */
  maxScore: number | null;
  /** segmentos aceitos (qualquer lado) */
  segments: string[];
  /** busca por nome/empresa (qualquer lado) */
  q: string;
  /** somente duplas com conexão registrada */
  onlyConnected: boolean;
  /** somente duplas já revisadas pela administração */
  onlyReviewed: boolean;
  /** mostrar participantes que ficaram sem nenhuma aresta */
  showIsolated: boolean;
}

export const DEFAULT_GRAPH_FILTERS: GraphFilters = {
  states: ["mutual", "single", "none"],
  minScore: null,
  maxScore: null,
  segments: [],
  q: "",
  onlyConnected: false,
  onlyReviewed: false,
  showIsolated: false,
};

const norm = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

/**
 * Recorta o subgrafo visível. Arestas primeiro; nós ficam se participarem de
 * alguma aresta visível (ou se `showIsolated`).
 */
export function filterGraph(graph: MatchGraph, filters: GraphFilters) {
  const byId = new Map(graph.nodes.map((n) => [n.profile_id, n]));
  const needle = norm(filters.q);
  const segs = new Set(filters.segments);
  const states = new Set(filters.states);

  const edges = graph.edges.filter((e) => {
    if (!states.has(e.interest_state)) return false;
    const best = Math.max(e.score_for_a, e.score_for_b);
    if (filters.minScore != null && best < filters.minScore) return false;
    if (filters.maxScore != null && best > filters.maxScore) return false;
    if (filters.onlyConnected && !e.connection_status) return false;
    if (filters.onlyReviewed && !e.reviewed) return false;

    const a = byId.get(e.a_profile_id);
    const b = byId.get(e.b_profile_id);
    if (segs.size > 0) {
      const okSeg =
        (a?.segment_id != null && segs.has(a.segment_id)) ||
        (b?.segment_id != null && segs.has(b.segment_id));
      if (!okSeg) return false;
    }
    if (needle) {
      const hay = [a?.name, a?.company, b?.name, b?.company]
        .filter(Boolean)
        .map((v) => norm(v as string));
      if (!hay.some((h) => h.includes(needle))) return false;
    }
    return true;
  });

  const connected = new Set<string>();
  for (const e of edges) {
    connected.add(e.a_profile_id);
    connected.add(e.b_profile_id);
  }

  const nodes = graph.nodes.filter((n) =>
    filters.showIsolated ? true : connected.has(n.profile_id),
  );

  const degrees = new Map<string, number>();
  for (const e of edges) {
    degrees.set(e.a_profile_id, (degrees.get(e.a_profile_id) ?? 0) + 1);
    degrees.set(e.b_profile_id, (degrees.get(e.b_profile_id) ?? 0) + 1);
  }

  return {
    nodes: nodes.map((n) => ({ ...n, degree: degrees.get(n.profile_id) ?? 0 })),
    edges,
    counts: countStates(edges),
  };
}

export function countStates(edges: Pick<GraphEdge, "interest_state">[]) {
  const out: Record<InterestState, number> = { mutual: 0, single: 0, none: 0, declined: 0 };
  for (const e of edges) out[e.interest_state] += 1;
  return out;
}

/**
 * Realce estilo Obsidian: só a aresta que TOCA o nó sob o cursor é incidente.
 * Uma aresta entre dois vizinhos do nó não é incidente e deve esmaecer.
 */
export function isIncidentEdge(
  edge: Pick<GraphEdge, "a_profile_id" | "b_profile_id">,
  hoveredProfileId: string | null,
): boolean {
  if (!hoveredProfileId) return false;
  return edge.a_profile_id === hoveredProfileId || edge.b_profile_id === hoveredProfileId;
}

/** Opacidade final da aresta: base por estado, reduzida fora do hover. */
export function edgeAlpha(
  edge: Pick<GraphEdge, "interest_state" | "a_profile_id" | "b_profile_id">,
  hoveredProfileId: string | null = null,
): number {
  const base = INTEREST_ALPHA[edge.interest_state];
  if (!hoveredProfileId) return base;
  return isIncidentEdge(edge, hoveredProfileId) ? base : base * HOVER_DIM_FACTOR;
}

/** Cor base do estado + alpha, em `rgba()` aceito pelo canvas. */
export function edgeStroke(
  edge: Pick<GraphEdge, "interest_state" | "a_profile_id" | "b_profile_id">,
  hoveredProfileId: string | null = null,
): string {
  const hex = INTEREST_COLOR[edge.interest_state];
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const a = Math.round(edgeAlpha(edge, hoveredProfileId) * 1000) / 1000;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/** Vizinhança para o realce estilo Obsidian. */
export function neighborsOf(edges: GraphEdge[], profileId: string): Set<string> {
  const set = new Set<string>([profileId]);
  for (const e of edges) {
    if (e.a_profile_id === profileId) set.add(e.b_profile_id);
    if (e.b_profile_id === profileId) set.add(e.a_profile_id);
  }
  return set;
}

export interface NodeInterestSummary {
  /** duplas visíveis das quais a pessoa participa */
  visible: number;
  /** a própria pessoa marcou interesse */
  sent: number;
  /** o outro lado marcou interesse na pessoa */
  received: number;
  /** os dois lados marcaram interesse */
  mutual: number;
}

/**
 * Contexto barato para o painel lateral: enviados/recebidos/mútuos derivados
 * das arestas já carregadas, sem nenhuma requisição extra.
 */
export function nodeInterestSummary(edges: GraphEdge[], profileId: string): NodeInterestSummary {
  const out: NodeInterestSummary = { visible: 0, sent: 0, received: 0, mutual: 0 };
  for (const e of edges) {
    const isA = e.a_profile_id === profileId;
    const isB = e.b_profile_id === profileId;
    if (!isA && !isB) continue;
    out.visible += 1;
    const mine = isA ? e.decision_a : e.decision_b;
    const theirs = isA ? e.decision_b : e.decision_a;
    if (mine === "interesse") out.sent += 1;
    if (theirs === "interesse") out.received += 1;
    if (mine === "interesse" && theirs === "interesse") out.mutual += 1;
  }
  return out;
}
