import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import {
  HIGH_SCORE_MIN,
  LOW_SCORE_MAX,
  PERMISSIVE_STRONG_MIN_DECISIONS,
  SCORE_BUCKETS,
  hasPrivateKey,
  intelligenceBehaviorSchema,
  intelligenceMatcherSchema,
  intelligenceOverviewSchema,
  intelligenceTaxonomySchema,
  translateIntelligenceError,
} from "@/features/admin/intelligenceSchemas";
import {
  NO_DATA_LABEL,
  behaviorRanking,
  behaviorScatterPoints,
  cohortBadge,
  formatPp,
  formatRate,
  groundTruthStatus,
  interestRate,
  kindRows,
  lowScoreComposition,
  lowScoreNoiseShare,
  networkSummary,
  outcomesCoverage,
  propensityRows,
  rate,
  reasonLiftRows,
  scoreBucketRows,
  scoreMatrix,
  selectiveSignalGap,
  snapshotDrift,
  taxonomyCoverage,
  taxonomySegmentRows,
  taxonomySideRows,
} from "@/features/admin/intelligencePresentation";
import { intelligenceKey } from "@/features/admin/useAdminIntelligence";
import { matchGraphSchema } from "@/features/admin/graphSchemas";

/**
 * IMPL 29 — SudoExpo Intelligence.
 *
 * Cobre as definições analíticas da V1 (perspectiva A/B, `sem_decisao` fora do
 * denominador, seletivo, permissivo forte, score baixo, cobertura taxonômica,
 * snapshot drift), a ausência de PII no contrato, o uso do evento selecionado
 * e os estados de vazio/amostra pequena.
 */

/** UUID determinístico (nunca aleatório) para fixtures estáveis. */
const uuid = (n: number) => `${String(n).padStart(8, "0")}-0000-4000-8000-000000000000`;

const OVERVIEW_RAW = {
  event_id: "sudoexpo-2026",
  generated_at: "2026-09-14T04:00:00Z",
  participants_active: 132,
  matches_active: 2540,
  algorithm_versions: { "v2.4": 2540 },
  decisions_total: 519,
  participants_with_decision: 64,
  interests: 338,
  declines: 181,
  mutual_matches: 12,
  selective_participants: 14,
  permissive_strong_participants: 17,
  selective_high: { decisions: 67, interests: 56 },
  selective_low: { decisions: 114, interests: 49 },
  low_score_interests: { total: 230, permissive_strong: 147, selective: 49, other: 34 },
  score_buckets: [
    {
      bucket: "0-19",
      decisions: 124,
      interests: 61,
      selective_decisions: 53,
      selective_interests: 23,
    },
    {
      bucket: "60-74",
      decisions: 97,
      interests: 68,
      selective_decisions: 60,
      selective_interests: 50,
    },
  ],
  taxonomy: {
    needs_total: 304,
    needs_canonical: 194,
    offers_total: 459,
    offers_canonical: 235,
  },
  snapshot: { decisions: 519, drift: 109, unknown: 0 },
  connections: { total: 382, by_status: { concluido: 354, apresentados: 27 }, offline: 11 },
  outcomes: { by_kind: {}, total: 0, connections_with_outcome: 0 },
};

const MATCHER_RAW = {
  event_id: "sudoexpo-2026",
  generated_at: "2026-09-14T04:00:00Z",
  matches_active: 2540,
  score_matrix: [
    { bucket_a: "20-39", bucket_b: "60-74", matches: 499, mutual: 2, connections: 86 },
    { bucket_a: "75+", bucket_b: "75+", matches: 10, mutual: 4, connections: 6 },
  ],
  reason_lift: [
    {
      code: "proximidade",
      n_with: 368,
      interests_with: 228,
      n_without: 151,
      interests_without: 110,
      selective_n_with: 90,
      selective_interests_with: 40,
      selective_n_without: 91,
      selective_interests_without: 65,
    },
    {
      code: "prioridade",
      n_with: 40,
      interests_with: 31,
      n_without: 479,
      interests_without: 307,
      selective_n_with: 8,
      selective_interests_with: 7,
      selective_n_without: 173,
      selective_interests_without: 98,
    },
  ],
  kinds: [
    {
      kind: "inverso",
      matches: 957,
      decisions: 179,
      interests: 137,
      selective_decisions: 60,
      selective_interests: 30,
    },
    {
      kind: "direto",
      matches: 121,
      decisions: 26,
      interests: 14,
      selective_decisions: 10,
      selective_interests: 4,
    },
  ],
  residuals: {
    total: 49,
    mutual: 0,
    with_connection: 49,
    with_strong_outcome: 0,
    sample: [
      {
        match_id: uuid(1),
        profile_id: uuid(2),
        profile_name: "Participante 1",
        company: "Empresa 1",
        score: 12,
        kind: "inverso",
        mutual: false,
        connection_status: "concluido",
        strong_outcome: false,
      },
    ],
  },
};

const BEHAVIOR_RAW = {
  event_id: "sudoexpo-2026",
  generated_at: "2026-09-14T04:00:00Z",
  participants_with_decision: 64,
  selective: 14,
  permissive_strong: 17,
  all_interest_small_sample: 21,
  decisions_total: 519,
  propensity_histogram: [
    { bucket: "0-10%", participants: 12, decisions: 101 },
    { bucket: "90-100%", participants: 41, decisions: 276 },
  ],
  participants: [
    {
      profile_id: uuid(3),
      name: "Seletiva",
      company: "Empresa A",
      segment_id: "agro",
      decisions: 39,
      interests: 29,
      declines: 10,
      propensity_pct: 74.4,
      avg_accepted_score: 61.1,
      selective: true,
      permissive_strong: false,
      all_interest_small_sample: false,
    },
    {
      profile_id: uuid(4),
      name: "Permissivo",
      company: "Empresa B",
      segment_id: "tecnologia",
      decisions: 34,
      interests: 34,
      declines: 0,
      propensity_pct: 100,
      avg_accepted_score: 27.5,
      selective: false,
      permissive_strong: true,
      all_interest_small_sample: false,
    },
    {
      profile_id: uuid(5),
      name: "Sem interesse",
      company: "",
      segment_id: null,
      decisions: 3,
      interests: 0,
      declines: 3,
      propensity_pct: 0,
      avg_accepted_score: null,
      selective: false,
      permissive_strong: false,
      all_interest_small_sample: false,
    },
  ],
};

const TAXONOMY_RAW = {
  event_id: "sudoexpo-2026",
  generated_at: "2026-09-14T04:00:00Z",
  coverage: [
    { side: "need", total: 304, canonical: 194 },
    { side: "offer", total: 459, canonical: 235 },
  ],
  by_source: [
    { source: "user", side: "offer", total: 234, canonical: 95 },
    { source: "ai", side: "need", total: 101, canonical: 97 },
  ],
  by_segment: [
    { segment_id: "outros", segment_label: "Outros", total: 114, canonical: 0 },
    { segment_id: "comercio", segment_label: "Comércio", total: 31, canonical: 31 },
  ],
  free_text_top: [
    {
      norm: "insumos agricolas",
      label: "Insumos agrícolas",
      side: "need",
      frequency: 2,
      participants: 2,
      observed_opportunity: 4,
    },
  ],
  taxonomy_items_active: 44,
  taxonomy_relations_active: 0,
};

const overview = intelligenceOverviewSchema.parse(OVERVIEW_RAW);
const matcher = intelligenceMatcherSchema.parse(MATCHER_RAW);
const behavior = intelligenceBehaviorSchema.parse(BEHAVIOR_RAW);
const taxonomy = intelligenceTaxonomySchema.parse(TAXONOMY_RAW);

// ---------------------------------------------------------------- definições

describe("definições analíticas da V1", () => {
  it("fixa os limiares combinados", () => {
    expect(LOW_SCORE_MAX).toBe(40);
    expect(HIGH_SCORE_MIN).toBe(60);
    expect(PERMISSIVE_STRONG_MIN_DECISIONS).toBe(5);
    expect(SCORE_BUCKETS).toEqual(["0-19", "20-39", "40-59", "60-74", "75+"]);
  });

  it("taxa nunca existe sem denominador", () => {
    const r = rate(0, 0);
    expect(r.pct).toBeNull();
    expect(formatRate(r)).toBe("—");
    expect(rate(3, 4).pct).toBe(75);
  });

  it("marca amostra pequena por denominador", () => {
    expect(rate(1, 5).smallSample).toBe(true);
    expect(rate(100, 400).smallSample).toBe(false);
  });

  it("interest rate usa apenas decisões registradas (sem_decisao fora)", () => {
    const ir = interestRate(overview);
    expect(ir.denominator).toBe(overview.decisions_total);
    expect(ir.denominator).toBe(overview.interests + overview.declines);
    expect(ir.pct).toBeCloseTo(65.1, 1);
  });
});

describe("Selective Signal Gap", () => {
  it("é a diferença em pp entre score alto e score baixo dos seletivos", () => {
    const gap = selectiveSignalGap(overview);
    expect(gap.high.pct).toBeCloseTo(83.6, 1);
    expect(gap.low.pct).toBeCloseTo(43, 1);
    expect(gap.gapPp).toBeCloseTo(40.6, 1);
    expect(formatPp(gap.gapPp)).toContain("+");
  });

  it("devolve null quando falta denominador em algum lado", () => {
    const empty = intelligenceOverviewSchema.parse({
      ...OVERVIEW_RAW,
      selective_low: { decisions: 0, interests: 0 },
    });
    expect(selectiveSignalGap(empty).gapPp).toBeNull();
  });
});

describe("ruído de score baixo", () => {
  it("é a parcela vinda de permissivos fortes", () => {
    expect(lowScoreNoiseShare(overview).pct).toBeCloseTo(63.9, 1);
  });

  it("compõe permissivos, seletivos e outros somando o total", () => {
    const comp = lowScoreComposition(overview);
    expect(comp.map((c) => c.key)).toEqual(["permissive_strong", "selective", "other"]);
    expect(comp.reduce((a, c) => a + c.value, 0)).toBe(overview.low_score_interests.total);
  });
});

describe("buckets de score", () => {
  it("preenche buckets ausentes com zero e mantém a ordem do eixo", () => {
    const rows = scoreBucketRows(overview);
    expect(rows.map((r) => r.bucket)).toEqual([...SCORE_BUCKETS]);
    const missing = rows.find((r) => r.bucket === "40-59")!;
    expect(missing.decisions).toBe(0);
    expect(missing.all.pct).toBeNull();
    expect(missing.allPct).toBe(0);
  });

  it("calcula taxa separada para a coorte seletiva", () => {
    const high = scoreBucketRows(overview).find((r) => r.bucket === "60-74")!;
    expect(high.all.pct).toBeCloseTo(70.1, 1);
    expect(high.selective.pct).toBeCloseTo(83.3, 1);
  });
});

describe("cobertura taxonômica e snapshot drift", () => {
  it("cobertura é itens canônicos sobre itens ativos", () => {
    const cov = taxonomyCoverage(overview);
    expect(cov.needs.pct).toBeCloseTo(63.8, 1);
    expect(cov.offers.pct).toBeCloseTo(51.2, 1);
  });

  it("drift é decisão cujo match foi regerado depois", () => {
    const d = snapshotDrift(overview);
    expect(d.numerator).toBe(109);
    expect(d.denominator).toBe(519);
    expect(d.pct).toBeCloseTo(21, 1);
  });

  it("cobertura taxonômica por lado separa texto livre", () => {
    const rows = taxonomySideRows(taxonomy);
    const need = rows.find((r) => r.side === "need")!;
    expect(need.freeText).toBe(110);
    expect(need.coverage.pct).toBeCloseTo(63.8, 1);
  });

  it("prioriza segmentos com pior cobertura", () => {
    expect(taxonomySegmentRows(taxonomy)[0].segment_id).toBe("outros");
  });
});

describe("ground truth e outcomes", () => {
  it("declara insuficiência quando não há resultado forte", () => {
    const gt = groundTruthStatus(overview);
    expect(gt.sufficient).toBe(false);
    expect(gt.message).toContain("insuficiente");
    expect(outcomesCoverage(overview).pct).toBe(0);
  });

  it("reconhece suficiência quando a cobertura passa do mínimo", () => {
    const rich = intelligenceOverviewSchema.parse({
      ...OVERVIEW_RAW,
      outcomes: { by_kind: { conversa_realizada: 60 }, total: 60, connections_with_outcome: 60 },
    });
    expect(groundTruthStatus(rich).sufficient).toBe(true);
  });
});

// -------------------------------------------------------------- Matcher Lab

describe("Matcher Lab", () => {
  it("monta a matriz completa 5x5 com intensidade normalizada", () => {
    const grid = scoreMatrix(matcher, "matches");
    expect(grid.cells).toHaveLength(25);
    expect(grid.max).toBe(499);
    const hot = grid.cells.find((c) => c.bucketA === "20-39" && c.bucketB === "60-74")!;
    expect(hot.intensity).toBe(1);
    const cold = grid.cells.find((c) => c.bucketA === "0-19" && c.bucketB === "0-19")!;
    expect(cold.value).toBe(0);
  });

  it("troca a métrica sem alterar o payload", () => {
    const mutual = scoreMatrix(matcher, "mutual");
    expect(mutual.max).toBe(4);
    expect(scoreMatrix(matcher, "connections").max).toBe(86);
    expect(matcher.score_matrix[0].matches).toBe(499);
  });

  it("calcula lift em pp e ordena do maior para o menor", () => {
    const rows = reasonLiftRows(matcher, "all");
    expect(rows[0].code).toBe("prioridade");
    expect(rows[0].liftPp).toBeCloseTo(13.4, 1);
    const prox = rows.find((r) => r.code === "proximidade")!;
    expect(prox.liftPp).toBeCloseTo(-10.8, 1);
  });

  it("coorte seletiva usa outros denominadores e sinaliza amostra pequena", () => {
    const sel = reasonLiftRows(matcher, "selective").find((r) => r.code === "prioridade")!;
    expect(sel.withRate.denominator).toBe(8);
    expect(sel.smallSample).toBe(true);
  });

  it("efetividade por kind usa apenas kinds reais do payload", () => {
    const rows = kindRows(matcher);
    expect(rows.map((r) => r.kind).sort()).toEqual(["direto", "inverso"]);
    const inverso = rows.find((r) => r.kind === "inverso")!;
    expect(inverso.all.pct).toBeCloseTo(76.5, 1);
    expect(inverso.selective.pct).toBeCloseTo(50, 1);
  });

  it("residuais de score baixo trazem N e situação, sem inventar resultado forte", () => {
    expect(matcher.residuals.total).toBe(49);
    expect(matcher.residuals.with_strong_outcome).toBe(0);
    expect(matcher.residuals.sample[0].score).toBeLessThan(LOW_SCORE_MAX);
  });
});

// ------------------------------------------------------------- Behavior Lab

describe("Behavior Lab", () => {
  it("histograma cobre todas as faixas de propensão", () => {
    const rows = propensityRows(behavior);
    expect(rows.map((r) => r.bucket)).toEqual([
      "0-10%",
      "10-25%",
      "25-50%",
      "50-75%",
      "75-90%",
      "90-100%",
    ]);
    expect(rows.find((r) => r.bucket === "25-50%")!.participants).toBe(0);
  });

  it("scatter ignora quem não tem interesse (sem score médio aceito)", () => {
    const points = behaviorScatterPoints(behavior);
    expect(points).toHaveLength(2);
    expect(points.some((p) => p.name === "Sem interesse")).toBe(false);
  });

  it("ranking ordena por volume de decisões", () => {
    expect(behaviorRanking(behavior).map((p) => p.name)).toEqual([
      "Seletiva",
      "Permissivo",
      "Sem interesse",
    ]);
  });

  it("rotula coortes sem confundir permissivo forte com pouca amostra", () => {
    expect(cohortBadge({ selective: true, permissive_strong: false, all_interest_small_sample: false }).tone).toBe("selective");
    expect(cohortBadge({ selective: false, permissive_strong: true, all_interest_small_sample: false }).tone).toBe("permissive");
    expect(cohortBadge({ selective: false, permissive_strong: false, all_interest_small_sample: true }).tone).toBe("small");
    expect(cohortBadge({ selective: false, permissive_strong: false, all_interest_small_sample: false }).tone).toBe("neutral");
  });
});

// -------------------------------------------------------------------- Rede

describe("Rede (integração com o mapa existente)", () => {
  const graph = matchGraphSchema.parse({
    event_id: "sudoexpo-2026",
    nodes: [
      { profile_id: uuid(10), name: "A", company: "EA", segment_id: "agro", segment_label: "Agro", degree: 2 },
      { profile_id: uuid(11), name: "B", company: "EB", segment_id: "agro", segment_label: "Agro", degree: 1 },
      { profile_id: uuid(12), name: "C", company: "", segment_id: null, segment_label: null, degree: 0 },
    ],
    edges: [
      {
        match_id: uuid(20),
        a_profile_id: uuid(10),
        b_profile_id: uuid(11),
        score_for_a: 70,
        score_for_b: 30,
        kind: "direto",
        decision_a: "interesse",
        decision_b: "sem_decisao",
        interest_state: "single",
        connection_status: "concluido",
        reviewed: false,
        has_briefing: false,
      },
    ],
    meta: { nodes_total: 3, edges_total: 1, mutual: 0, single: 1, none: 0, declined: 0 },
  });

  it("resume a rede sem recriar o canvas", () => {
    const s = networkSummary(graph);
    expect(s.nodes).toBe(3);
    expect(s.edges).toBe(1);
    expect(s.isolated).toBe(1);
    expect(s.maxDegree).toBe(2);
    expect(s.avgDegree).toBe(1);
    expect(s.withConnection).toBe(1);
    expect(s.states.single).toBe(1);
    expect(s.topHubs[0].name).toBe("A");
  });
});

// ------------------------------------------------------------ contrato/rota

describe("contrato das RPCs e da rota", () => {
  const migration = readFileSync(
    "supabase/migrations/20260914045821_b9a0b7c4-000e-4e10-862f-c413fd5c031a.sql",
    "utf8",
  );
  const routeSrc = readFileSync("src/routes/admin_.inteligencia.tsx", "utf8");
  const hookSrc = readFileSync("src/features/admin/useAdminIntelligence.ts", "utf8");
  const adminSrc = readFileSync("src/routes/admin.tsx", "utf8");

  it("nenhum payload carrega chave privada/PII de contato", () => {
    for (const payload of [OVERVIEW_RAW, MATCHER_RAW, BEHAVIOR_RAW, TAXONOMY_RAW]) {
      expect(hasPrivateKey(payload)).toBe(false);
    }
    for (const row of MATCHER_RAW.residuals.sample) expect(hasPrivateKey(row)).toBe(false);
    for (const row of BEHAVIOR_RAW.participants) expect(hasPrivateKey(row)).toBe(false);
  });

  it("as quatro funções exigem admin do evento e são somente leitura", () => {
    for (const fn of [
      "admin_intelligence_overview",
      "admin_intelligence_matcher",
      "admin_intelligence_behavior",
      "admin_intelligence_taxonomy",
    ]) {
      expect(migration).toContain(`CREATE OR REPLACE FUNCTION public.${fn}(_event_id text)`);
      expect(migration).toContain(`GRANT EXECUTE ON FUNCTION public.${fn}(text)`);
      expect(migration).toContain(`REVOKE ALL ON FUNCTION public.${fn}(text) FROM PUBLIC`);
    }
    expect(migration.match(/_admin_require_event_admin\(_event_id\)/g)?.length).toBe(4);
    expect(migration).toContain("STABLE SECURITY DEFINER");
    for (const forbidden of ["INSERT INTO", "UPDATE public.", "DELETE FROM", "DROP "]) {
      expect(migration).not.toContain(forbidden);
    }
  });

  it("filtra por event_id e ignora sem_decisao e matches inativos", () => {
    expect(migration).toContain("WHERE event_id = _event_id AND is_active");
    expect(migration).toContain("dd.decision::text <> 'sem_decisao'");
    expect(migration).not.toContain("'cafe-entre-amigos");
  });

  it("usa o score da perspectiva de quem decidiu", () => {
    expect(migration).toContain(
      "CASE WHEN dd.profile_id = m.a_profile_id THEN m.score_for_a ELSE m.score_for_b END",
    );
  });

  it("mantém as definições de seletivo, permissivo forte e score baixo no SQL", () => {
    expect(migration).toContain("(ni > 0 AND nn > 0) AS selective");
    expect(migration).toContain("(n >= 5 AND ni = n) AS permissive_strong");
    expect(migration).toContain("score < 40");
    expect(migration).toContain("generated_at > decided_at");
  });

  it("não toca em pesos, reasons nem algorithm_version", () => {
    expect(migration).not.toContain("_recompute_matches_for_profile");
    expect(migration).not.toMatch(/UPDATE\s+public\.matches/);
  });

  it("a rota é admin-only e usa o evento selecionado", () => {
    expect(routeSrc).toContain('createFileRoute("/admin_/inteligencia")');
    expect(routeSrc).toContain('roleQuery.data !== "admin"');
    expect(routeSrc).toContain("AdminEventProvider");
    expect(routeSrc).toContain("EventSelector");
    expect(routeSrc).toContain("useAdminEvent()");
    expect(routeSrc).toContain("noindex,nofollow");
    for (const hook of [
      "useIntelligenceOverview(selectedEventId",
      "useIntelligenceMatcher(selectedEventId",
      "useIntelligenceBehavior(selectedEventId",
      "useIntelligenceTaxonomy(selectedEventId",
      "useAdminMatchGraph(selectedEventId",
    ]) {
      expect(routeSrc).toContain(hook);
    }
  });

  it("não usa EVENT_ID fixo em consulta de dados (só no gate de papel)", () => {
    expect(routeSrc).toContain("useEventRole(EVENT_ID)");
    expect(routeSrc.match(/EVENT_ID/g)?.length).toBe(2);
    expect(hookSrc).not.toContain("EVENT_ID");
    expect(hookSrc).toContain("_event_id: eventId");
  });

  it("chave de cache separa domínio e evento", () => {
    expect(intelligenceKey("overview", "a")).not.toEqual(intelligenceKey("overview", "b"));
    expect(intelligenceKey("overview", "a")).not.toEqual(intelligenceKey("matcher", "a"));
  });

  it("o admin oferece o atalho para a inteligência e mantém o mapa", () => {
    expect(adminSrc).toContain('<Link to="/admin/inteligencia">Inteligência</Link>');
    expect(adminSrc).toContain('<Link to="/admin/graph">Mapa de conexões</Link>');
  });

  it("traduz erros de acesso para linguagem do usuário", () => {
    expect(translateIntelligenceError(new Error("forbidden"))).toContain("Acesso negado");
    expect(translateIntelligenceError(new Error("not_authenticated"))).toContain("Sessão expirada");
  });
});

describe("estados de vazio e amostra pequena", () => {
  const empty = intelligenceOverviewSchema.parse({
    ...OVERVIEW_RAW,
    participants_active: 0,
    matches_active: 0,
    decisions_total: 0,
    participants_with_decision: 0,
    interests: 0,
    declines: 0,
    selective_high: { decisions: 0, interests: 0 },
    selective_low: { decisions: 0, interests: 0 },
    low_score_interests: { total: 0, permissive_strong: 0, selective: 0, other: 0 },
    score_buckets: [],
    taxonomy: { needs_total: 0, needs_canonical: 0, offers_total: 0, offers_canonical: 0 },
    snapshot: { decisions: 0, drift: 0, unknown: 0 },
    connections: { total: 0, by_status: {}, offline: 0 },
  });

  it("evento vazio não produz 0% falso", () => {
    expect(interestRate(empty).pct).toBeNull();
    expect(taxonomyCoverage(empty).needs.pct).toBeNull();
    expect(snapshotDrift(empty).pct).toBeNull();
    expect(formatRate(interestRate(empty))).toBe("—");
    expect(NO_DATA_LABEL).toBe("Dados insuficientes");
  });

  it("matriz e histograma seguem com eixos completos e zeros", () => {
    const emptyMatcher = intelligenceMatcherSchema.parse({
      ...MATCHER_RAW,
      score_matrix: [],
      reason_lift: [],
      kinds: [],
      residuals: { total: 0, mutual: 0, with_connection: 0, with_strong_outcome: 0, sample: [] },
    });
    const grid = scoreMatrix(emptyMatcher, "matches");
    expect(grid.cells).toHaveLength(25);
    expect(grid.max).toBe(0);
    expect(grid.cells.every((c) => c.intensity === 0)).toBe(true);
    expect(reasonLiftRows(emptyMatcher)).toEqual([]);
    expect(kindRows(emptyMatcher)).toEqual([]);
  });
});
