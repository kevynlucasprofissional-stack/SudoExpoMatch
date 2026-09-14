import type { GraphEdge, GraphNode } from "@/features/admin/graphSchemas";
import { edgeWidth, nodeRadius } from "@/features/admin/graphPresentation";

/**
 * Preferências VISUAIS do Mapa de conexões (estilo "Graph view" do Obsidian).
 *
 * Regras que este módulo carrega:
 * - são preferências pessoais: ficam em localStorage, nunca na URL (a URL é
 *   reservada aos filtros analíticos, que são compartilháveis);
 * - nada aqui altera matcher, pesos, reasons ou a semântica das cores: o
 *   estado da relação continua definindo a cor da aresta e o segmento a cor do
 *   nó. Estes controles mexem apenas em tamanho, espessura, texto e física.
 */

export const GRAPH_SETTINGS_STORAGE_KEY = "sudoexpo-admin-graph-settings-v1";

export interface GraphSettings {
  /** desenhar setas de direção do interesse humano */
  showArrows: boolean;
  /** a partir de qual zoom os nomes aparecem */
  textThreshold: number;
  /** multiplicador do raio calculado pelo grau visível */
  nodeSize: number;
  /** multiplicador da espessura das arestas */
  linkThickness: number;
  /** força que puxa o grafo para o centro */
  centerForce: number;
  /** repulsão entre nós (valor amigável positivo) */
  repulsion: number;
  /** rigidez da força dos links */
  linkForce: number;
  /** distância alvo dos links */
  linkDistance: number;
}

export const GRAPH_SETTINGS_RANGES = {
  textThreshold: { min: 0.4, max: 4, step: 0.1, default: 1.6 },
  nodeSize: { min: 0.5, max: 3, step: 0.1, default: 1 },
  linkThickness: { min: 0.25, max: 4, step: 0.05, default: 1 },
  centerForce: { min: 0, max: 1, step: 0.02, default: 0.06 },
  repulsion: { min: 0, max: 600, step: 10, default: 120 },
  linkForce: { min: 0, max: 2, step: 0.05, default: 0.6 },
  linkDistance: { min: 10, max: 300, step: 5, default: 45 },
} as const;

export const DEFAULT_GRAPH_SETTINGS: GraphSettings = {
  showArrows: false,
  textThreshold: GRAPH_SETTINGS_RANGES.textThreshold.default,
  nodeSize: GRAPH_SETTINGS_RANGES.nodeSize.default,
  linkThickness: GRAPH_SETTINGS_RANGES.linkThickness.default,
  centerForce: GRAPH_SETTINGS_RANGES.centerForce.default,
  repulsion: GRAPH_SETTINGS_RANGES.repulsion.default,
  linkForce: GRAPH_SETTINGS_RANGES.linkForce.default,
  linkDistance: GRAPH_SETTINGS_RANGES.linkDistance.default,
};

function clampNumber(value: unknown, key: keyof typeof GRAPH_SETTINGS_RANGES): number {
  const range = GRAPH_SETTINGS_RANGES[key];
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return range.default;
  return Math.min(Math.max(n, range.min), range.max);
}

/** Aceita qualquer lixo e devolve um objeto válido (fallback seguro). */
export function normalizeGraphSettings(raw: unknown): GraphSettings {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    showArrows: src["showArrows"] === true,
    textThreshold: clampNumber(src["textThreshold"], "textThreshold"),
    nodeSize: clampNumber(src["nodeSize"], "nodeSize"),
    linkThickness: clampNumber(src["linkThickness"], "linkThickness"),
    centerForce: clampNumber(src["centerForce"], "centerForce"),
    repulsion: clampNumber(src["repulsion"], "repulsion"),
    linkForce: clampNumber(src["linkForce"], "linkForce"),
    linkDistance: clampNumber(src["linkDistance"], "linkDistance"),
  };
}

/** Somente cliente: em SSR devolve os defaults sem tocar em storage. */
export function loadGraphSettings(): GraphSettings {
  if (typeof window === "undefined" || !window.localStorage) return DEFAULT_GRAPH_SETTINGS;
  try {
    const raw = window.localStorage.getItem(GRAPH_SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_GRAPH_SETTINGS;
    return normalizeGraphSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_GRAPH_SETTINGS;
  }
}

export function saveGraphSettings(settings: GraphSettings): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(GRAPH_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* storage cheio ou bloqueado: preferência visual não é crítica */
  }
}

/** d3-force exige repulsão negativa; o slider mostra valor positivo amigável. */
export function chargeStrength(repulsion: number): number {
  return -Math.abs(repulsion);
}

/** Parâmetros que vão para as forças do d3 (nada muta os dados do grafo). */
export interface GraphForceConfig {
  charge: number;
  center: number;
  linkStrength: number;
  linkDistance: number;
}

export function forcesFromSettings(settings: GraphSettings): GraphForceConfig {
  return {
    charge: chargeStrength(settings.repulsion),
    center: settings.centerForce,
    linkStrength: settings.linkForce,
    linkDistance: settings.linkDistance,
  };
}

/** Raio final: base por grau visível × multiplicador do painel. */
export function scaledNodeRadius(node: Pick<GraphNode, "degree">, nodeSize: number): number {
  return nodeRadius(node) * nodeSize;
}

/** Espessura final: base por estado × multiplicador × fator de hover. */
export function scaledLinkWidth(
  edge: Pick<GraphEdge, "interest_state">,
  linkThickness: number,
  hoverFactor = 1,
): number {
  return edgeWidth(edge) * linkThickness * hoverFactor;
}

/** Nome aparece a partir do zoom escolhido — ou sempre no nó sob o cursor. */
export function shouldRenderLabel(scale: number, threshold: number, isHovered = false): boolean {
  if (isHovered) return true;
  return scale >= threshold;
}

export type ArrowMode = "none" | "forward" | "backward" | "both";

/**
 * Direção da seta = direção do INTERESSE humano (nunca arbitrária).
 * `forward` = A → B, `backward` = B → A, `both` = interesse mútuo,
 * `none` = ninguém marcou interesse (inclui `agora_nao`/sem decisão).
 */
export function arrowMode(
  edge: Pick<GraphEdge, "decision_a" | "decision_b">,
  showArrows: boolean,
): ArrowMode {
  if (!showArrows) return "none";
  const a = edge.decision_a === "interesse";
  const b = edge.decision_b === "interesse";
  if (a && b) return "both";
  if (a) return "forward";
  if (b) return "backward";
  return "none";
}

/** Token monotônico usado para pedir um reaquecimento da simulação. */
export function nextReheatToken(token: number): number {
  return token + 1;
}
