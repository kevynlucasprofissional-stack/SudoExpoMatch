import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  buildCacheKey,
  buildConfirmedOffersBlock,
  buildPrompt,
  runOnboardingAi,
  type OrchestratorDeps,
} from "@/lib/onboarding-ai-orchestrator";
import {
  PROMPT_VERSION,
  buildAiRunInput,
  filterMirroredNeeds,
  type AiSuggestionItem,
  type AiSuggestionResult,
  type SuggestOnboardingInput,
} from "@/lib/onboarding-ai-schema";
import {
  AI_SUGGESTION_BADGE,
  buildSuggestionFeed,
  suggestionIdentity,
} from "@/features/onboarding/suggestionFeed";
import {
  normalizeConfirmedOffers,
  serializeAnalysisKey,
  type AnalysisKey,
} from "@/features/onboarding/aiAnalysisState";
import type { EventCatalog } from "@/features/participant/types";
import type { SuggestionItem } from "@/features/onboarding/types";

const stepsSrc = readFileSync("src/features/onboarding/steps.tsx", "utf8");

const catalog: EventCatalog = {
  segments: [
    { id: "alim", label: "Alimentação", emoji: null },
    { id: "mkt", label: "Marketing", emoji: null },
  ],
  taxonomy: [
    { id: "t-emb", segment_id: "alim", label: "Embalagens", kind: "need", synonyms: [] },
    {
      id: "t-mkt",
      segment_id: "mkt",
      label: "Gestão de redes sociais",
      kind: "both",
      synonyms: [],
    },
  ],
};

const baseInput: SuggestOnboardingInput = {
  eventId: "e1",
  segmentId: "alim",
  summary: "Hamburgueria com delivery",
};

// ============================================================================
// Etapa 3/4 — sem painel manual, IA automática
// ============================================================================
describe("IMPL 22 — painel manual removido das etapas 3 e 4", () => {
  it('não existe botão "Analisar com IA" nem variantes manuais', () => {
    expect(stepsSrc).not.toContain("Analisar com IA");
    expect(stepsSrc).not.toContain("Analisar de novo");
    expect(stepsSrc).not.toContain("Reabrir sugestões");
    expect(stepsSrc).not.toContain("Aceitar todas");
    expect(stepsSrc).not.toContain("Analisar perfil");
  });

  it("AiAssistantPanel não é mais referenciado", () => {
    expect(stepsSrc).not.toContain("AiAssistantPanel");
  });

  it("as duas etapas disparam a IA automaticamente pelo hook", () => {
    expect(stepsSrc).toContain("useAutoAiSuggestions");
    expect(stepsSrc).toContain('focus: "offers"');
    expect(stepsSrc).toContain('focus: "needs"');
  });

  it("a IA nunca é chamada durante o render (só via efeito no hook)", () => {
    const hook = readFileSync("src/features/onboarding/useAutoAiSuggestions.ts", "utf8");
    expect(hook).toContain("useEffect");
    expect(hook).toContain("analysis.analyze");
  });

  it("existe indicação discreta de carregamento, não painel", () => {
    expect(stepsSrc).toContain("Personalizando sugestões");
  });
});

// ============================================================================
// Feed unificado: proveniência e deduplicação
// ============================================================================
describe("IMPL 22 — lista única com proveniência", () => {
  const heuristic: SuggestionItem[] = [
    { taxonomyItemId: "t-emb", segmentId: "alim", label: "Embalagens", kind: "need" },
    { taxonomyItemId: null, segmentId: null, label: "Contabilidade", kind: "need" },
  ];

  const ai = (over: Partial<AiSuggestionItem>[] = []): AiSuggestionItem[] =>
    over.map((o) => ({
      taxonomyItemId: null,
      segmentId: null,
      label: "X",
      kind: "need",
      confidence: 0.8,
      ...o,
    })) as AiSuggestionItem[];

  it("heurística aparece mesmo sem resultado de IA", () => {
    const feed = buildSuggestionFeed({ kind: "need", heuristic, ai: [] });
    expect(feed).toHaveLength(2);
    expect(feed.every((f) => f.fromAi)).toBe(false);
  });

  it("deduplica por taxonomyItemId e marca selo de IA no item único", () => {
    const feed = buildSuggestionFeed({
      kind: "need",
      heuristic,
      ai: ai([
        { taxonomyItemId: "t-emb", label: "Embalagens sustentáveis", needKind: "fornecedor" },
      ]),
    });
    expect(feed.filter((f) => f.taxonomyItemId === "t-emb")).toHaveLength(1);
    const item = feed.find((f) => f.taxonomyItemId === "t-emb")!;
    expect(item.fromAi).toBe(true);
    expect(item.fromHeuristic).toBe(true);
    expect(item.needKind).toBe("fornecedor");
  });

  it("deduplica por label normalizado quando não há taxonomyItemId", () => {
    const feed = buildSuggestionFeed({
      kind: "need",
      heuristic,
      ai: ai([{ label: "  CONTABILIDADE " }]),
    });
    expect(feed.filter((f) => f.label.toLowerCase().startsWith("contab"))).toHaveLength(1);
  });

  it("itens só da IA entram com source ai e selo", () => {
    const feed = buildSuggestionFeed({
      kind: "need",
      heuristic,
      ai: ai([{ label: "Sistema de pedidos" }]),
    });
    const novo = feed.find((f) => f.label === "Sistema de pedidos")!;
    expect(novo.source).toBe("ai");
    expect(novo.fromAi).toBe(true);
    expect(AI_SUGGESTION_BADGE).toBe("Sugestão de IA");
  });

  it("itens já no draft saem da lista de sugestões", () => {
    const feed = buildSuggestionFeed({
      kind: "need",
      heuristic,
      ai: [],
      existing: [{ label: "embalagens", taxonomyItemId: "t-emb" }],
    });
    expect(feed.map((f) => f.label)).toEqual(["Contabilidade"]);
  });

  it("identidade prioriza taxonomyItemId sobre label", () => {
    expect(suggestionIdentity({ taxonomyItemId: "t-1", label: "A" })).toBe("id:t-1");
    expect(suggestionIdentity({ taxonomyItemId: null, label: " Ã " })).toContain("label:");
  });

  it("nada é adicionado automaticamente ao draft (usuário confirma)", () => {
    expect(stepsSrc).toContain("addFromFeed");
    expect(stepsSrc).toContain("IA sugere, usuário confirma");
  });
});

// ============================================================================
// Chave semântica da Etapa 4
// ============================================================================
describe("IMPL 22 — chave da análise distingue focus e ofertas confirmadas", () => {
  const base: AnalysisKey = { focus: "offers", eventId: "e1", segmentId: "alim", summary: "s" };

  it("focus faz parte da identidade", () => {
    expect(serializeAnalysisKey(base)).not.toBe(serializeAnalysisKey({ ...base, focus: "needs" }));
  });

  it("trocar oferta confirmada invalida a análise de necessidades", () => {
    const k1: AnalysisKey = {
      ...base,
      focus: "needs",
      confirmedOffers: normalizeConfirmedOffers([
        { label: "A", taxonomyItemId: "a" },
        { label: "B", taxonomyItemId: "b" },
      ]),
    };
    const k2: AnalysisKey = {
      ...k1,
      confirmedOffers: normalizeConfirmedOffers([
        { label: "A", taxonomyItemId: "a" },
        { label: "C", taxonomyItemId: "c" },
      ]),
    };
    expect(serializeAnalysisKey(k1)).not.toBe(serializeAnalysisKey(k2));
  });

  it("mesma oferta em outra ordem reaproveita a mesma análise", () => {
    const a = normalizeConfirmedOffers([
      { label: "B", taxonomyItemId: "b" },
      { label: "A", taxonomyItemId: "a" },
    ]);
    const b = normalizeConfirmedOffers([
      { label: "A", taxonomyItemId: "a" },
      { label: "B", taxonomyItemId: "b" },
    ]);
    expect(serializeAnalysisKey({ ...base, focus: "needs", confirmedOffers: a })).toBe(
      serializeAnalysisKey({ ...base, focus: "needs", confirmedOffers: b }),
    );
  });

  it("ofertas confirmadas não afetam a chave da Etapa 3", () => {
    expect(
      serializeAnalysisKey({
        ...base,
        confirmedOffers: normalizeConfirmedOffers([{ label: "A", taxonomyItemId: "a" }]),
      }),
    ).toBe(serializeAnalysisKey(base));
  });
});

// ============================================================================
// Cache do servidor
// ============================================================================
describe("IMPL 22 — cache key do servidor", () => {
  it("focus muda a chave", async () => {
    const a = await buildCacheKey({ ...baseInput, focus: "offers" }, catalog);
    const b = await buildCacheKey({ ...baseInput, focus: "needs" }, catalog);
    expect(a).not.toBe(b);
  });

  it("confirmedOffers entram na chave quando focus=needs", async () => {
    const a = await buildCacheKey(
      {
        ...baseInput,
        focus: "needs",
        confirmedOffers: [{ taxonomyItemId: "o1", label: "Hambúrguer", segmentId: "alim" }],
      },
      catalog,
    );
    const b = await buildCacheKey(
      {
        ...baseInput,
        focus: "needs",
        confirmedOffers: [{ taxonomyItemId: "o2", label: "Delivery", segmentId: "alim" }],
      },
      catalog,
    );
    const same = await buildCacheKey(
      {
        ...baseInput,
        focus: "needs",
        confirmedOffers: [{ taxonomyItemId: "o1", label: "Hambúrguer", segmentId: "alim" }],
      },
      catalog,
    );
    expect(a).not.toBe(b);
    expect(a).toBe(same);
  });

  it("confirmedOffers são ignoradas quando focus=offers", async () => {
    const a = await buildCacheKey({ ...baseInput, focus: "offers" }, catalog);
    const b = await buildCacheKey(
      {
        ...baseInput,
        focus: "offers",
        confirmedOffers: [{ taxonomyItemId: "o1", label: "Hambúrguer", segmentId: "alim" }],
      },
      catalog,
    );
    expect(a).toBe(b);
  });

  it("PROMPT_VERSION foi atualizada para o novo contrato", () => {
    expect(PROMPT_VERSION).toContain("focus");
  });

  it("ai_runs registra apenas metadados seguros (focus e contagem)", async () => {
    const meta = buildAiRunInput(
      {
        ...baseInput,
        focus: "needs",
        confirmedOffers: [{ taxonomyItemId: "o1", label: "Hambúrguer", segmentId: "alim" }],
      },
      "hash",
    ) as Record<string, unknown>;
    expect(meta["focus"]).toBe("needs");
    expect(meta["confirmedOfferCount"]).toBe(1);
    expect(JSON.stringify(meta)).not.toContain("Hambúrguer");
  });
});

// ============================================================================
// Prompt e semântica da Etapa 4
// ============================================================================
describe("IMPL 22 — prompt por foco", () => {
  it("focus=offers pede ofertas", () => {
    const p = buildPrompt({ ...baseInput, focus: "offers" }, catalog);
    expect(p).toContain("FOCO DESTA ANÁLISE: OFERTAS");
  });

  it("focus=needs pergunta o que empresas como esta normalmente precisam", () => {
    const p = buildPrompt({ ...baseInput, focus: "needs" }, catalog);
    expect(p).toContain("FOCO DESTA ANÁLISE: NECESSIDADES");
    expect(p).toContain("normalmente precisam");
    expect(p).toContain("necessidades plausíveis");
  });

  it("ofertas confirmadas entram no prompt com a regra anti-espelho", () => {
    const p = buildPrompt(
      {
        ...baseInput,
        focus: "needs",
        confirmedOffers: [
          { taxonomyItemId: "t-mkt", label: "Gestão de redes sociais", segmentId: "mkt" },
        ],
      },
      catalog,
    );
    expect(p).toContain("Ofertas CONFIRMADAS");
    expect(p).toContain("Gestão de redes sociais");
    expect(p).toContain("PROIBIDO sugerir como necessidade");
  });

  it("sem ofertas confirmadas o bloco não aparece", () => {
    expect(buildConfirmedOffersBlock({ ...baseInput, focus: "needs" })).toBe("");
    expect(
      buildConfirmedOffersBlock({
        ...baseInput,
        focus: "offers",
        confirmedOffers: [{ taxonomyItemId: null, label: "A", segmentId: null }],
      }),
    ).toBe("");
  });

  it("cross-segment continua explícito no prompt", () => {
    const p = buildPrompt({ ...baseInput, focus: "needs" }, catalog);
    expect(p).toContain("cross-segment");
    expect(p).toContain("needKind");
  });
});

// ============================================================================
// Anti-espelho determinístico
// ============================================================================
describe("IMPL 22 — necessidade nunca espelha oferta confirmada", () => {
  const need = (label: string, id: string | null): AiSuggestionItem =>
    ({
      taxonomyItemId: id,
      segmentId: null,
      label,
      kind: "need",
      confidence: 0.9,
      needKind: "servico",
    }) as AiSuggestionItem;

  it("filtra por taxonomyItemId (agência de marketing)", () => {
    const out = filterMirroredNeeds(
      [need("Gestão de redes sociais", "t-mkt"), need("Fotografia", null)],
      [{ taxonomyItemId: "t-mkt", label: "Gestão de redes sociais", segmentId: "mkt" }],
    );
    expect(out.map((n) => n.label)).toEqual(["Fotografia"]);
  });

  it("filtra por label normalizado (contabilidade/BPO)", () => {
    const out = filterMirroredNeeds(
      [need(" bpo  FINANCEIRO ", null), need("Marketing", null)],
      [{ taxonomyItemId: null, label: "BPO financeiro", segmentId: null }],
    );
    expect(out.map((n) => n.label)).toEqual(["Marketing"]);
  });

  it("sem ofertas confirmadas nada é filtrado", () => {
    const needs = [need("A", null)];
    expect(filterMirroredNeeds(needs, undefined)).toBe(needs);
    expect(filterMirroredNeeds(needs, [])).toBe(needs);
  });

  it("o orquestrador aplica o filtro no resultado da IA", async () => {
    const gatewayOutput = {
      understanding: {
        summary: "Agência",
        mainActivity: "Marketing",
        keywords: [],
        clarifyingQuestion: null,
      },
      offers: [],
      needs: [
        {
          taxonomyItemId: "t-mkt",
          segmentId: null,
          label: "Gestão de redes sociais",
          confidence: 0.9,
          rationale: "espelho",
          needKind: "servico",
        },
        {
          taxonomyItemId: "t-emb",
          segmentId: null,
          label: "Embalagens",
          confidence: 0.8,
          rationale: "ok",
          needKind: "fornecedor",
        },
      ],
    };
    const fallbackResult: AiSuggestionResult = {
      understanding: { summary: "", mainActivity: "", keywords: [], clarifyingQuestion: null },
      offers: [],
      needs: [],
      source: "heuristic",
      promptVersion: PROMPT_VERSION,
    };
    const deps: OrchestratorDeps = {
      callGateway: vi.fn(async () => ({ output: gatewayOutput, tokensInput: 1, tokensOutput: 1 })),
      readCache: vi.fn(async () => null),
      writeCache: vi.fn(async () => {}),
      consumeRateLimit: vi.fn(async () => true),
      logRun: vi.fn(async () => {}),
      fallback: vi.fn(async () => fallbackResult),
      sleep: vi.fn(async () => {}),
      now: () => 0,
    };
    const out = await runOnboardingAi({
      input: {
        ...baseInput,
        focus: "needs",
        confirmedOffers: [
          { taxonomyItemId: "t-mkt", label: "Gestão de redes sociais", segmentId: "mkt" },
        ],
      },
      catalog,
      actorUserId: "u1",
      deps,
    });
    expect(out.needs.map((n) => n.label)).toEqual(["Embalagens"]);
    expect(out.needs[0]?.needKind).toBe("fornecedor");
    expect(out.needs[0]?.segmentId).toBe("alim");
  });
});
