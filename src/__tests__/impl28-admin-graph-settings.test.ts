import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_GRAPH_SETTINGS,
  GRAPH_SETTINGS_RANGES,
  GRAPH_SETTINGS_STORAGE_KEY,
  arrowMode,
  chargeStrength,
  forcesFromSettings,
  loadGraphSettings,
  nextReheatToken,
  normalizeGraphSettings,
  saveGraphSettings,
  scaledLinkWidth,
  scaledNodeRadius,
  shouldRenderLabel,
} from "@/features/admin/graphSettings";
import { edgeWidth, nodeRadius } from "@/features/admin/graphPresentation";

/**
 * Personalização do Mapa de conexões (estilo Graph view do Obsidian).
 * Tudo determinístico: nenhuma dependência de canvas ou de rede.
 */

describe("normalização e defaults das configurações", () => {
  it("defaults dentro dos ranges declarados", () => {
    expect(DEFAULT_GRAPH_SETTINGS.showArrows).toBe(false);
    for (const key of Object.keys(GRAPH_SETTINGS_RANGES) as Array<
      keyof typeof GRAPH_SETTINGS_RANGES
    >) {
      const range = GRAPH_SETTINGS_RANGES[key];
      const value = DEFAULT_GRAPH_SETTINGS[key];
      expect(value).toBeGreaterThanOrEqual(range.min);
      expect(value).toBeLessThanOrEqual(range.max);
    }
    expect(DEFAULT_GRAPH_SETTINGS.nodeSize).toBe(1);
    expect(DEFAULT_GRAPH_SETTINGS.linkThickness).toBe(1);
  });

  it("lixo, NaN e tipos errados caem nos defaults", () => {
    expect(normalizeGraphSettings(null)).toEqual(DEFAULT_GRAPH_SETTINGS);
    expect(normalizeGraphSettings("nada")).toEqual(DEFAULT_GRAPH_SETTINGS);
    expect(normalizeGraphSettings({ nodeSize: "abc" }).nodeSize).toBe(
      GRAPH_SETTINGS_RANGES.nodeSize.default,
    );
    expect(normalizeGraphSettings({ repulsion: Number.NaN }).repulsion).toBe(
      GRAPH_SETTINGS_RANGES.repulsion.default,
    );
    expect(normalizeGraphSettings({ showArrows: "sim" }).showArrows).toBe(false);
  });

  it("valores fora da faixa são limitados, não descartados", () => {
    expect(normalizeGraphSettings({ nodeSize: 99 }).nodeSize).toBe(
      GRAPH_SETTINGS_RANGES.nodeSize.max,
    );
    expect(normalizeGraphSettings({ linkDistance: -50 }).linkDistance).toBe(
      GRAPH_SETTINGS_RANGES.linkDistance.min,
    );
  });
});

describe("persistência local", () => {
  /** ambiente de teste é node: localStorage em memória, determinístico */
  beforeEach(() => {
    const store = new Map<string, string>();
    (globalThis as Record<string, unknown>)["window"] = {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
        clear: () => store.clear(),
      },
    };
  });

  afterEach(() => {
    delete (globalThis as Record<string, unknown>)["window"];
  });

  it("salva e restaura pela chave versionada", () => {
    saveGraphSettings({ ...DEFAULT_GRAPH_SETTINGS, nodeSize: 2, showArrows: true });
    expect(window.localStorage.getItem(GRAPH_SETTINGS_STORAGE_KEY)).toBeTruthy();
    const loaded = loadGraphSettings();
    expect(loaded.nodeSize).toBe(2);
    expect(loaded.showArrows).toBe(true);
  });

  it("JSON corrompido faz fallback seguro para defaults", () => {
    window.localStorage.setItem(GRAPH_SETTINGS_STORAGE_KEY, "{isso não é json");
    expect(loadGraphSettings()).toEqual(DEFAULT_GRAPH_SETTINGS);
  });

  it("preferência antiga com campos inválidos é normalizada", () => {
    window.localStorage.setItem(
      GRAPH_SETTINGS_STORAGE_KEY,
      JSON.stringify({ nodeSize: 999, linkForce: "x", extra: true }),
    );
    const loaded = loadGraphSettings();
    expect(loaded.nodeSize).toBe(GRAPH_SETTINGS_RANGES.nodeSize.max);
    expect(loaded.linkForce).toBe(GRAPH_SETTINGS_RANGES.linkForce.default);
    expect(Object.keys(loaded).sort()).toEqual(Object.keys(DEFAULT_GRAPH_SETTINGS).sort());
  });
});

describe("multiplicadores de tela", () => {
  it("tamanho do nó continua proporcional ao grau, só multiplicado", () => {
    const node = { degree: 9 };
    expect(scaledNodeRadius(node, 1)).toBe(nodeRadius(node));
    expect(scaledNodeRadius(node, 2)).toBeCloseTo(nodeRadius(node) * 2);
    expect(scaledNodeRadius({ degree: 1 }, 2)).toBeLessThan(scaledNodeRadius({ degree: 9 }, 2));
  });

  it("espessura do link multiplica a base por estado e o fator de hover", () => {
    const edge = { interest_state: "mutual" as const };
    expect(scaledLinkWidth(edge, 1)).toBe(edgeWidth(edge));
    expect(scaledLinkWidth(edge, 2)).toBeCloseTo(edgeWidth(edge) * 2);
    expect(scaledLinkWidth(edge, 1, 0.4)).toBeCloseTo(edgeWidth(edge) * 0.4);
    expect(scaledLinkWidth({ interest_state: "declined" }, 3)).toBeLessThan(
      scaledLinkWidth(edge, 3),
    );
  });

  it("limiar de texto controla quando o nome aparece", () => {
    expect(shouldRenderLabel(1, 1.6)).toBe(false);
    expect(shouldRenderLabel(1.6, 1.6)).toBe(true);
    expect(shouldRenderLabel(3, 1.6)).toBe(true);
    expect(shouldRenderLabel(0.5, 4)).toBe(false);
    // o nó sob o cursor sempre mostra o nome
    expect(shouldRenderLabel(0.5, 4, true)).toBe(true);
  });
});

describe("forças", () => {
  it("repulsão amigável positiva vira força negativa do d3", () => {
    expect(chargeStrength(120)).toBe(-120);
    expect(chargeStrength(0)).toBe(-0);
    expect(chargeStrength(-30)).toBe(-30);
  });

  it("forcesFromSettings não muta os dados nem as configurações", () => {
    const settings = { ...DEFAULT_GRAPH_SETTINGS, repulsion: 300, linkDistance: 80 };
    const snapshot = JSON.stringify(settings);
    const forces = forcesFromSettings(settings);
    expect(forces).toEqual({
      charge: -300,
      center: DEFAULT_GRAPH_SETTINGS.centerForce,
      linkStrength: DEFAULT_GRAPH_SETTINGS.linkForce,
      linkDistance: 80,
    });
    expect(JSON.stringify(settings)).toBe(snapshot);
  });

  it("token de reaquecimento é monotônico", () => {
    expect(nextReheatToken(0)).toBe(1);
    expect(nextReheatToken(7)).toBe(8);
  });
});

describe("direção das setas = direção do interesse", () => {
  const edge = (decision_a: string, decision_b: string) => ({ decision_a, decision_b });

  it("desligado nunca desenha seta", () => {
    expect(arrowMode(edge("interesse", "interesse"), false)).toBe("none");
    expect(arrowMode(edge("interesse", "sem_decisao"), false)).toBe("none");
  });

  it("interesse de um lado aponta do interessado para o outro", () => {
    expect(arrowMode(edge("interesse", "sem_decisao"), true)).toBe("forward");
    expect(arrowMode(edge("sem_decisao", "interesse"), true)).toBe("backward");
    expect(arrowMode(edge("agora_nao", "interesse"), true)).toBe("backward");
  });

  it("mútuo é bidirecional, nunca uma direção arbitrária", () => {
    expect(arrowMode(edge("interesse", "interesse"), true)).toBe("both");
  });

  it("sem interesse nenhum não tem seta", () => {
    expect(arrowMode(edge("sem_decisao", "sem_decisao"), true)).toBe("none");
    expect(arrowMode(edge("agora_nao", "agora_nao"), true)).toBe("none");
    expect(arrowMode(edge("agora_nao", "sem_decisao"), true)).toBe("none");
  });
});

describe("integração do painel no canvas e na rota", () => {
  const canvas = readFileSync("src/features/admin/MatchGraphCanvas.tsx", "utf8");
  const route = readFileSync("src/routes/admin_.graph.tsx", "utf8");
  const panel = readFileSync("src/features/admin/GraphSettingsPanel.tsx", "utf8");
  const hook = readFileSync("src/features/admin/useGraphSettings.ts", "utf8");

  it("canvas usa as APIs de força e o reheat do force-graph", () => {
    expect(canvas).toContain('d3Force("charge")');
    expect(canvas).toContain('d3Force("link")');
    expect(canvas).toContain('d3Force("center")');
    expect(canvas).toContain("d3ReheatSimulation()");
    expect(canvas).toContain("reheatToken");
  });

  it("canvas aplica multiplicadores e limiar de texto vindos das settings", () => {
    expect(canvas).toContain("scaledNodeRadius(node, settings.nodeSize)");
    expect(canvas).toContain("scaledLinkWidth(l.edge, settings.linkThickness");
    expect(canvas).toContain("shouldRenderLabel(scale, settings.textThreshold");
    expect(canvas).toContain("arrowMode(link.edge, settings.showArrows)");
  });

  it("cor da aresta segue só o estado e o hover continua por incidência", () => {
    expect(canvas).toContain("edgeStroke(l.edge, hovered)");
    expect(canvas).toContain("isIncidentEdge(l.edge, hovered)");
    expect(canvas).not.toContain("segmentColor(l.edge");
  });

  it("rota liga o painel sem mexer nos filtros da URL", () => {
    expect(route).toContain("<GraphSettingsPanel");
    expect(route).toContain("settings={graphSettings.settings}");
    expect(route).toContain("reheatToken={graphSettings.reheatToken}");
    expect(route).not.toContain("nodeSize:");
    expect(route).not.toContain("repulsion:");
  });

  it("painel expõe todos os controles pedidos com rótulos em PT-BR", () => {
    for (const label of [
      "Setas (direção do interesse)",
      "Limite para a visibilidade textual",
      "Tamanho dos nós",
      "Grossura dos links",
      "Animar",
      "Força centrípeta",
      "Força de repulsão",
      "Força dos links",
      "Distância dos links",
      "Restaurar padrão",
      "Tela",
      "Forças",
    ]) {
      expect(panel).toContain(label);
    }
    expect(panel).toContain("aria-label={label}");
  });

  it("hook lê localStorage somente após hidratação (SSR-safe)", () => {
    expect(hook).toContain("useEffect");
    expect(hook).toContain("loadGraphSettings()");
    expect(hook).toContain("saveGraphSettings(settings)");
  });
});
