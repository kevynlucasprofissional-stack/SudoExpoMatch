import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import {
  DEFAULT_GRAPH_FILTERS,
  INTEREST_COLOR,
  countStates,
  deriveInterestState,
  edgeColor,
  edgeWidth,
  filterGraph,
  neighborsOf,
  nodeInterestSummary,
  nodeRadius,
  segmentColor,
  type GraphFilters,
} from "@/features/admin/graphPresentation";
import { matchGraphSchema, type GraphEdge, type MatchGraph } from "@/features/admin/graphSchemas";
import { hasActiveGraphFilters, normalizeGraphSearch } from "@/features/admin/graphUrlState";
import { hasPrivateKey } from "@/features/admin/participantsSchemas";

/**
 * IMPL 27 — Mapa de conexões (Graph View) do admin.
 * Cobre: derivação das 4 cores (incluindo agora_nao/sem_decisao), ausência de
 * dados privados no payload, filtros/subgrafo, isolamento por evento e o
 * contrato de navegação nó→participante / aresta→match.
 */

const node = (id: string, over: Partial<MatchGraph["nodes"][number]> = {}) => ({
  profile_id: id,
  name: `Pessoa ${id.slice(0, 4)}`,
  company: `Empresa ${id.slice(0, 4)}`,
  segment_id: "agro",
  segment_label: "Agro",
  degree: 1,
  ...over,
});

/** UUID determinístico (nunca aleatório) para fixtures estáveis. */
const uuid = (n: number) => `${String(n).padStart(8, "0")}-0000-4000-8000-000000000000`;

let edgeSeq = 0;
const edge = (a: string, b: string, over: Partial<GraphEdge> = {}): GraphEdge => ({
  match_id: uuid(++edgeSeq),
  a_profile_id: a,
  b_profile_id: b,
  score_for_a: 60,
  score_for_b: 50,
  kind: "direto",
  decision_a: "sem_decisao",
  decision_b: "sem_decisao",
  interest_state: "none",
  connection_status: null,
  reviewed: false,
  has_briefing: false,
  ...over,
});

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";

function graphOf(nodes: MatchGraph["nodes"], edges: GraphEdge[]): MatchGraph {
  return {
    event_id: "sudoexpo-2026",
    nodes,
    edges,
    meta: {
      nodes_total: nodes.length,
      edges_total: edges.length,
      ...countStates(edges),
    },
  };
}

describe("cores por estado de interesse", () => {
  it("usa exatamente a paleta acordada", () => {
    expect(INTEREST_COLOR.single).toBe("#27e300");
    expect(INTEREST_COLOR.none).toBe("#1b26ae");
    expect(INTEREST_COLOR.mutual).toBe("#ff7c31");
    expect(INTEREST_COLOR.declined).toBe("#6b7280");
  });

  it("interesse dos dois lados = mútuo (laranja)", () => {
    expect(deriveInterestState("interesse", "interesse")).toBe("mutual");
    expect(edgeColor({ interest_state: "mutual" })).toBe("#ff7c31");
  });

  it("interesse de um lado só = verde, em qualquer direção", () => {
    expect(deriveInterestState("interesse", "sem_decisao")).toBe("single");
    expect(deriveInterestState("agora_nao", "interesse")).toBe("single");
    expect(edgeColor({ interest_state: "single" })).toBe("#27e300");
  });

  it("ninguém decidiu = azul", () => {
    expect(deriveInterestState("sem_decisao", "sem_decisao")).toBe("none");
    expect(edgeColor({ interest_state: "none" })).toBe("#1b26ae");
  });

  it("agora_nao sem nenhum interesse = estado próprio, nunca azul", () => {
    expect(deriveInterestState("agora_nao", "sem_decisao")).toBe("declined");
    expect(deriveInterestState("agora_nao", "agora_nao")).toBe("declined");
    expect(edgeColor({ interest_state: "declined" })).not.toBe(INTEREST_COLOR.none);
  });

  it("agora_nao e sem_decisao nunca contam como interesse", () => {
    for (const a of ["agora_nao", "sem_decisao"]) {
      for (const b of ["agora_nao", "sem_decisao"]) {
        expect(deriveInterestState(a, b)).not.toBe("mutual");
        expect(deriveInterestState(a, b)).not.toBe("single");
      }
    }
  });
});

describe("apresentação de nós e arestas", () => {
  it("mútuo é mais grosso que recusado", () => {
    expect(edgeWidth({ interest_state: "mutual" })).toBeGreaterThan(
      edgeWidth({ interest_state: "declined" }),
    );
  });

  it("tamanho do nó cresce com o grau, com teto", () => {
    expect(nodeRadius({ degree: 40 })).toBeGreaterThan(nodeRadius({ degree: 2 }));
    expect(nodeRadius({ degree: 100000 })).toBeLessThanOrEqual(12);
  });

  it("cor de segmento é determinística e definida para segmento nulo", () => {
    expect(segmentColor("agro")).toBe(segmentColor("agro"));
    expect(segmentColor(null)).toMatch(/^#/);
  });
});

describe("contrato da RPC admin_match_graph", () => {
  it("aceita o payload esperado e rejeita estado de interesse desconhecido", () => {
    const ok = matchGraphSchema.safeParse(graphOf([node(A), node(B)], [edge(A, B)]));
    expect(ok.success).toBe(true);

    const bad = matchGraphSchema.safeParse(
      graphOf([node(A)], [{ ...edge(A, B), interest_state: "talvez" as never }]),
    );
    expect(bad.success).toBe(false);
  });

  it("nós e arestas não trafegam nenhum dado privado", () => {
    const payload = graphOf([node(A), node(B)], [edge(A, B)]);
    for (const n of payload.nodes) expect(hasPrivateKey(n)).toBe(false);
    for (const e of payload.edges) expect(hasPrivateKey(e)).toBe(false);
  });

  it("a RPC do grafo isola por evento, exige papel e só usa matches ativos", () => {
    const sql = readFileSync(
      "supabase/migrations/20260914025324_09458a6d-cad5-4b1a-9a62-0a50e4f082f3.sql",
      "utf8",
    );
    expect(sql).toContain("public.admin_match_graph");
    expect(sql).toContain("has_any_event_role");
    expect(sql).toContain("m.event_id = _event_id");
    expect(sql).toContain("m.is_active");
    // Estado de interesse vem de match_decisions, nunca da coluna legada matches.label
    expect(sql).toContain("public.match_decisions");
    expect(sql).not.toContain("m.label");
    // Nenhum dado de contato no payload
    expect(sql).not.toContain("profile_contacts");
  });
});

describe("filtros e subgrafo", () => {
  const base = graphOf(
    [node(A), node(B), node(C, { segment_id: "servicos", segment_label: "Serviços" })],
    [
      edge(A, B, { interest_state: "mutual", decision_a: "interesse", decision_b: "interesse" }),
      edge(A, C, { interest_state: "declined", decision_a: "agora_nao", score_for_a: 20, score_for_b: 15 }),
    ],
  );

  const withFilters = (over: Partial<GraphFilters> = {}) =>
    filterGraph(base, { ...DEFAULT_GRAPH_FILTERS, ...over });

  it("por padrão esconde as duplas recusadas", () => {
    const out = withFilters();
    expect(out.edges).toHaveLength(1);
    expect(out.edges[0]!.interest_state).toBe("mutual");
  });

  it("mostra recusadas quando o estado é habilitado", () => {
    const out = withFilters({ states: ["mutual", "single", "none", "declined"] });
    expect(out.edges).toHaveLength(2);
  });

  it("esconde nós sem aresta visível, salvo se pedir isolados", () => {
    expect(withFilters().nodes.map((n) => n.profile_id)).toEqual([A, B]);
    expect(withFilters({ showIsolated: true }).nodes).toHaveLength(3);
  });

  it("score mínimo corta a dupla pelo maior lado", () => {
    const out = withFilters({ states: ["mutual", "declined"], minScore: 50 });
    expect(out.edges).toHaveLength(1);
  });

  it("filtro por segmento aceita qualquer lado da dupla", () => {
    const out = withFilters({ states: ["mutual", "declined"], segments: ["servicos"] });
    expect(out.edges).toHaveLength(1);
    expect(out.edges[0]!.b_profile_id).toBe(C);
  });

  it("busca ignora acento e caixa", () => {
    const g = graphOf(
      [node(A, { name: "Ádria Rocha" }), node(B, { name: "Marcela" })],
      [edge(A, B, { interest_state: "none" })],
    );
    expect(filterGraph(g, { ...DEFAULT_GRAPH_FILTERS, q: "adria" }).edges).toHaveLength(1);
    expect(filterGraph(g, { ...DEFAULT_GRAPH_FILTERS, q: "zzz" }).edges).toHaveLength(0);
  });

  it("só com conexão e só revisadas recortam corretamente", () => {
    const g = graphOf(
      [node(A), node(B)],
      [edge(A, B, { interest_state: "none", connection_status: "aguardando", reviewed: true })],
    );
    expect(filterGraph(g, { ...DEFAULT_GRAPH_FILTERS, onlyConnected: true }).edges).toHaveLength(1);
    expect(filterGraph(base, { ...DEFAULT_GRAPH_FILTERS, onlyConnected: true }).edges).toHaveLength(0);
    expect(filterGraph(g, { ...DEFAULT_GRAPH_FILTERS, onlyReviewed: true }).edges).toHaveLength(1);
  });

  it("recalcula o grau dentro do subgrafo visível", () => {
    const out = withFilters({ states: ["mutual", "declined"], showIsolated: true });
    const a = out.nodes.find((n) => n.profile_id === A)!;
    expect(a.degree).toBe(2);
  });

  it("vizinhança inclui o próprio nó e os conectados", () => {
    const set = neighborsOf(base.edges, A);
    expect([...set].sort()).toEqual([A, B, C].sort());
  });
});

describe("estado de URL", () => {
  const raw = {
    st: "",
    min: "",
    max: "",
    seg: "",
    q: "",
    conn: "",
    rev: "",
    iso: "",
    p: "",
    m: "",
  };

  it("cai nos padrões seguros e ignora estado inválido", () => {
    const f = normalizeGraphSearch({ ...raw, st: "mutual,talvez" });
    expect(f.states).toEqual(["mutual"]);
    expect(hasActiveGraphFilters(f)).toBe(true);
    expect(normalizeGraphSearch(raw).states).toEqual(DEFAULT_GRAPH_FILTERS.states);
    expect(hasActiveGraphFilters(normalizeGraphSearch(raw))).toBe(false);
  });

  it("lê seleção de nó e de aresta como estado compartilhável", () => {
    const f = normalizeGraphSearch({ ...raw, p: A, m: "" });
    expect(f.selectedProfileId).toBe(A);
    expect(f.selectedMatchId).toBeNull();
    const g = normalizeGraphSearch({ ...raw, m: uuid(7) });
    expect(g.selectedMatchId).not.toBeNull();
  });

  it("score mínimo negativo é normalizado", () => {
    expect(normalizeGraphSearch({ ...raw, min: "-30" }).minScore).toBe(0);
    expect(normalizeGraphSearch({ ...raw, min: "abc" }).minScore).toBeNull();
  });
});

describe("faixa de score (mínimo e máximo)", () => {
  const g = graphOf(
    [node(A), node(B), node(C)],
    [
      edge(A, B, { interest_state: "none", score_for_a: 20, score_for_b: 10 }),
      edge(A, C, { interest_state: "none", score_for_a: 90, score_for_b: 40 }),
    ],
  );

  it("score máximo corta a dupla pelo maior lado", () => {
    const out = filterGraph(g, { ...DEFAULT_GRAPH_FILTERS, maxScore: 30 });
    expect(out.edges).toHaveLength(1);
    expect(out.edges[0]!.score_for_a).toBe(20);
  });

  it("mínimo e máximo combinam como faixa fechada", () => {
    expect(filterGraph(g, { ...DEFAULT_GRAPH_FILTERS, minScore: 30, maxScore: 95 }).edges).toHaveLength(1);
    expect(filterGraph(g, { ...DEFAULT_GRAPH_FILTERS, minScore: 30, maxScore: 50 }).edges).toHaveLength(0);
    expect(filterGraph(g, { ...DEFAULT_GRAPH_FILTERS }).edges).toHaveLength(2);
  });

  it("score máximo entra e sai da URL", () => {
    const raw = { st: "", min: "", max: "", seg: "", q: "", conn: "", rev: "", iso: "", p: "", m: "" };
    expect(normalizeGraphSearch({ ...raw, max: "40" }).maxScore).toBe(40);
    expect(normalizeGraphSearch({ ...raw, max: "-1" }).maxScore).toBe(0);
    expect(normalizeGraphSearch({ ...raw, max: "abc" }).maxScore).toBeNull();
    expect(hasActiveGraphFilters(normalizeGraphSearch({ ...raw, max: "40" }))).toBe(true);
  });
});

describe("painel contextual da pessoa selecionada", () => {
  const edges = [
    edge(A, B, { interest_state: "mutual", decision_a: "interesse", decision_b: "interesse" }),
    edge(A, C, { interest_state: "single", decision_a: "sem_decisao", decision_b: "interesse" }),
    edge(B, C, { interest_state: "single", decision_a: "interesse", decision_b: "agora_nao" }),
  ];

  it("conta enviados, recebidos e mútuos pelo lado correto da dupla", () => {
    const a = nodeInterestSummary(edges, A);
    expect(a).toEqual({ visible: 2, sent: 1, received: 2, mutual: 1 });

    const c = nodeInterestSummary(edges, C);
    expect(c).toEqual({ visible: 2, sent: 1, received: 1, mutual: 0 });
  });

  it("pessoa sem dupla visível não gera contagem", () => {
    expect(nodeInterestSummary([], A)).toEqual({ visible: 0, sent: 0, received: 0, mutual: 0 });
  });
});

describe("contadores do subgrafo", () => {
  it("os contadores por estado somam o total de arestas visíveis", () => {
    const g = graphOf(
      [node(A), node(B), node(C)],
      [
        edge(A, B, { interest_state: "mutual", decision_a: "interesse", decision_b: "interesse" }),
        edge(A, C, { interest_state: "single", decision_a: "interesse" }),
        edge(B, C, { interest_state: "declined", decision_a: "agora_nao" }),
      ],
    );
    const out = filterGraph(g, { ...DEFAULT_GRAPH_FILTERS, states: ["mutual", "single", "none", "declined"] });
    const { mutual, single, none, declined } = out.counts;
    expect(mutual + single + none + declined).toBe(out.edges.length);
    expect(out.counts).toEqual({ mutual: 1, single: 1, none: 0, declined: 1 });
  });
});
