import { describe, expect, it } from "vitest";
import {
  buildPrompt,
  runOnboardingAi,
  type OrchestratorDeps,
} from "@/lib/onboarding-ai-orchestrator";
import {
  MIN_SUGGESTION_CONFIDENCE,
  PROMPT_VERSION,
  aiSuggestionResultSchema,
  normalizeAgainstCatalog,
  type AiSuggestionItem,
  type AiSuggestionResult,
  type ModelOutput,
  type SuggestOnboardingInput,
} from "@/lib/onboarding-ai-schema";
import type { EventCatalog } from "@/features/participant/types";
import { heuristicSuggestionProvider, inferNeedKind } from "@/features/onboarding/suggestions";
import { mergeCapped } from "@/features/onboarding/mergeItems";
import { mapWizardToSaveProfileInput, mapProfileToWizardDraft } from "@/features/onboarding/mappers";
import { createEmptyDraft, cryptoUid } from "@/features/onboarding/draft";
import type { WizardDraft, WizardNeed, WizardOffer } from "@/features/onboarding/types";

/**
 * IMPLEMENTAÇÃO 8/12 — testes de sugestões reais + revisão transversal da
 * Fase 2 (Impl 5 cross-segment, Impl 6 needKind, Impl 7 segmento do item).
 *
 * Todos os testes usam mocks determinísticos do Lovable AI Gateway — nenhuma
 * chamada paga é necessária.
 */

// ---------------------------------------------------------------- fixtures

const catalog: EventCatalog = {
  segments: [
    { id: "alimentacao", label: "Alimentação", emoji: null },
    { id: "marketing", label: "Marketing", emoji: null },
    { id: "tecnologia", label: "Tecnologia", emoji: null },
    { id: "financas", label: "Finanças", emoji: null },
    { id: "logistica", label: "Logística", emoji: null },
    { id: "servicos", label: "Serviços", emoji: null },
  ] as EventCatalog["segments"],
  taxonomy: [
    // alimentação
    { id: "tx-buffet", segment_id: "alimentacao", label: "Buffet", kind: "both", synonyms: [] },
    {
      id: "tx-delivery",
      segment_id: "alimentacao",
      label: "Delivery de refeições",
      kind: "offer",
      synonyms: [],
    },
    // marketing
    {
      id: "tx-mkt",
      segment_id: "marketing",
      label: "Marketing digital",
      kind: "both",
      synonyms: [],
    },
    { id: "tx-foto", segment_id: "marketing", label: "Fotografia", kind: "both", synonyms: [] },
    // tecnologia
    {
      id: "tx-pedidos",
      segment_id: "tecnologia",
      label: "Automação de pedidos",
      kind: "both",
      synonyms: [],
    },
    { id: "tx-crm", segment_id: "tecnologia", label: "CRM", kind: "both", synonyms: [] },
    // finanças
    {
      id: "tx-bpo",
      segment_id: "financas",
      label: "BPO financeiro",
      kind: "both",
      synonyms: [],
    },
    {
      id: "tx-contabil",
      segment_id: "financas",
      label: "Contabilidade empresarial",
      kind: "both",
      synonyms: [],
    },
    // logística
    {
      id: "tx-entrega",
      segment_id: "logistica",
      label: "Transporte e entregas",
      kind: "both",
      synonyms: [],
    },
    // serviços
    {
      id: "tx-estrutura",
      segment_id: "servicos",
      label: "Estrutura para eventos",
      kind: "both",
      synonyms: [],
    },
    // armadilhas deliberadas
    {
      id: "tx-inativo-fora",
      segment_id: "marketing",
      label: "Item fora do catálogo ativo",
      kind: "both",
      synonyms: [],
    },
    {
      id: "tx-somente-offer",
      segment_id: "tecnologia",
      label: "Hospedagem em nuvem",
      kind: "offer",
      synonyms: [],
    },
    {
      id: "tx-sem-segmento",
      segment_id: null,
      label: "Serviço genérico",
      kind: "both",
      synonyms: [],
    },
  ],
};

/** Catálogo REALMENTE ativo: `tx-inativo-fora` não é entregue ao normalizador. */
const activeCatalog: EventCatalog = {
  ...catalog,
  taxonomy: catalog.taxonomy.filter((t) => t.id !== "tx-inativo-fora"),
};

const restauranteInput: SuggestOnboardingInput = {
  eventId: "sudoexpo-2026",
  segmentId: "alimentacao",
  summary:
    "Tenho um restaurante com delivery e estou crescendo. Tenho dificuldade para divulgar, organizar pedidos e controlar melhor meu financeiro.",
};

const eventosInput: SuggestOnboardingInput = {
  eventId: "sudoexpo-2026",
  segmentId: "servicos",
  summary:
    "Tenho uma empresa de eventos corporativos. Quero aumentar as vendas e melhorar a entrega.",
};

function model(partial: {
  offers?: ModelOutput["offers"];
  needs?: ModelOutput["needs"];
}): ModelOutput {
  return {
    understanding: {
      summary: "Resumo interpretado",
      mainActivity: "Atividade principal",
      keywords: ["a", "b"],
      clarifyingQuestion: null,
    },
    offers: partial.offers ?? [],
    needs: partial.needs ?? [],
  };
}

const off = (taxonomyItemId: string | null, label: string, confidence = 0.8) => ({
  taxonomyItemId,
  label,
  confidence,
  rationale: "citação do resumo",
});
const need = (
  taxonomyItemId: string | null,
  label: string,
  needKind: string | null,
  confidence = 0.8,
) => ({ taxonomyItemId, label, needKind, confidence, rationale: "citação do resumo" });

// --------------------------------------------- cenário A — restaurante/delivery

describe("cenário A — restaurante com delivery (cross-segment real)", () => {
  const raw = model({
    offers: [off("tx-delivery", "Delivery de refeições"), off("tx-buffet", "Buffet")],
    needs: [
      need("tx-mkt", "Marketing digital", "servico"),
      need("tx-pedidos", "Automação de pedidos", "servico"),
      need("tx-bpo", "BPO financeiro", "servico"),
      need("tx-entrega", "Transporte e entregas", "servico"),
    ],
  });
  const norm = normalizeAgainstCatalog(raw, {
    segmentId: restauranteInput.segmentId,
    catalog: activeCatalog,
  });

  it("(1) sugestões cross-segment sobrevivem à normalização com id válido", () => {
    expect(norm.needs.map((n) => n.taxonomyItemId)).toEqual([
      "tx-mkt",
      "tx-pedidos",
      "tx-bpo",
      "tx-entrega",
    ]);
  });

  it("(2) segmentId vem do item da taxonomia, nunca do perfil nem do modelo", () => {
    expect(norm.needs.map((n) => n.segmentId)).toEqual([
      "marketing",
      "tecnologia",
      "financas",
      "logistica",
    ]);
    expect(norm.needs.every((n) => n.segmentId !== restauranteInput.segmentId)).toBe(true);
  });

  it("(3) needKind reflete o significado do item (marketing/software/contábil = servico)", () => {
    expect(norm.needs.map((n) => n.needKind)).toEqual([
      "servico",
      "servico",
      "servico",
      "servico",
    ]);
  });

  it("(9) ofertas do próprio segmento continuam válidas", () => {
    expect(norm.offers.map((o) => [o.taxonomyItemId, o.segmentId])).toEqual([
      ["tx-delivery", "alimentacao"],
      ["tx-buffet", "alimentacao"],
    ]);
  });

  it("(1/4/11) atravessa UI acceptance → WizardDraft → payload sem perder nada", () => {
    const draft: WizardDraft = {
      ...createEmptyDraft(),
      name: "Ana",
      company: "Restaurante da Ana",
      city: "Rio Verde",
      segmentId: "alimentacao",
      summary: restauranteInput.summary,
      consent: true,
      offers: [],
      needs: [],
    };

    // aceitação humana (mesma lógica do StepOffers/StepNeeds)
    const offers: WizardOffer[] = norm.offers.map((s) => ({
      localId: cryptoUid(),
      label: s.label,
      segmentId: s.segmentId ?? draft.segmentId,
      taxonomyItemId: s.taxonomyItemId,
      source: "ai" as const,
    }));
    const needs: WizardNeed[] = norm.needs.map((s, i) => ({
      localId: cryptoUid(),
      label: s.label,
      segmentId: s.segmentId ?? draft.segmentId,
      taxonomyItemId: s.taxonomyItemId,
      needKind: s.needKind ?? "outro",
      isPriority: i === 0,
      source: "ai" as const,
    }));

    const payload = mapWizardToSaveProfileInput(
      { ...draft, offers: mergeCapped([], offers, 5), needs: mergeCapped([], needs, 5) },
      "sudoexpo-2026",
    );

    // (4) profile.segment_id continua o segmento da EMPRESA
    expect(payload.segmentId).toBe("alimentacao");
    expect(payload.needs.map((n) => [n.taxonomy_item_id, n.segment_id, n.need_kind])).toEqual([
      ["tx-mkt", "marketing", "servico"],
      ["tx-pedidos", "tecnologia", "servico"],
      ["tx-bpo", "financas", "servico"],
      ["tx-entrega", "logistica", "servico"],
    ]);
    expect(payload.offers.every((o) => o.segment_id === "alimentacao")).toBe(true);
    // (11) source preservado até o payload
    expect(payload.offers.every((o) => o.source === "ai")).toBe(true);
    expect(payload.needs.every((n) => n.source === "ai")).toBe(true);
    expect(payload.needs.filter((n) => n.is_priority).length).toBe(1);
  });
});

// ------------------------------------------------ cenário B — eventos corporativos

describe("cenário B — eventos corporativos", () => {
  const raw = model({
    offers: [
      off("tx-estrutura", "Estrutura para eventos"),
      off("tx-buffet", "Buffet"),
      off(null, "Cerimonial completo"),
    ],
    needs: [
      need("tx-foto", "Fotografia", "servico"),
      need("tx-crm", "CRM", "servico"),
      need("tx-entrega", "Transporte e entregas", "servico"),
      need("tx-buffet", "Buffet", "fornecedor"),
    ],
  });
  const norm = normalizeAgainstCatalog(raw, {
    segmentId: eventosInput.segmentId,
    catalog: activeCatalog,
  });

  it("(9) oferta do próprio segmento + texto livre convivem", () => {
    expect(norm.offers[0]).toMatchObject({ taxonomyItemId: "tx-estrutura", segmentId: "servicos" });
    expect(norm.offers[2]).toMatchObject({ taxonomyItemId: null, segmentId: null });
  });

  it("(2) buffet/fotografia/CRM/logística trazem o segmento do próprio item", () => {
    expect(norm.needs.map((n) => n.segmentId)).toEqual([
      "marketing",
      "tecnologia",
      "logistica",
      "alimentacao",
    ]);
  });

  it("(3) needKind respeita o significado: buffet como fornecedor, CRM como servico", () => {
    const byLabel = Object.fromEntries(norm.needs.map((n) => [n.label, n.needKind]));
    expect(byLabel["Buffet"]).toBe("fornecedor");
    expect(byLabel["CRM"]).toBe("servico");
    expect(byLabel["Transporte e entregas"]).toBe("servico");
  });

  it("(4) o mesmo item pode ser oferta (alimentacao) e necessidade cross-segment", () => {
    expect(norm.offers.find((o) => o.label === "Buffet")?.segmentId).toBe("alimentacao");
    expect(norm.needs.find((n) => n.label === "Buffet")?.segmentId).toBe("alimentacao");
  });
});

// ------------------------------------------------------- contratos defensivos

describe("(5) ids inválidos, inativos e kind incompatível viram texto livre", () => {
  const norm = normalizeAgainstCatalog(
    model({
      offers: [
        off("tx-nao-existe", "Item inventado"),
        off("tx-inativo-fora", "Item inativo"),
        off("tx-sem-segmento", "Serviço genérico"),
      ],
      needs: [need("tx-somente-offer", "Hospedagem em nuvem", "servico")],
    }),
    { segmentId: "alimentacao", catalog: activeCatalog },
  );

  it("id inexistente → null sem quebrar o fluxo", () => {
    expect(norm.offers[0]).toMatchObject({ taxonomyItemId: null, segmentId: null });
    expect(norm.offers[0]!.label).toBe("Item inventado");
  });

  it("id ativo apenas fora do catálogo entregue → null", () => {
    expect(norm.offers[1]).toMatchObject({ taxonomyItemId: null, segmentId: null });
  });

  it("item sem segment_id não é autoritativo → texto livre", () => {
    expect(norm.offers[2]).toMatchObject({ taxonomyItemId: null, segmentId: null });
  });

  it("kind incompatível (offer usado como need) → texto livre", () => {
    expect(norm.needs[0]).toMatchObject({ taxonomyItemId: null, segmentId: null });
    expect(norm.needs[0]!.needKind).toBe("servico");
  });

  it("resultado continua válido no schema final (sem exceção)", () => {
    expect(() =>
      aiSuggestionResultSchema.parse({ ...norm, source: "ai", promptVersion: PROMPT_VERSION }),
    ).not.toThrow();
  });
});

describe("(6) resposta incompleta e needKind inválido usam coerção segura", () => {
  const norm = normalizeAgainstCatalog(
    model({
      needs: [
        need("tx-mkt", "Marketing digital", "consultoria_estrategica"),
        need("tx-crm", "CRM", null),
        { taxonomyItemId: "tx-bpo", label: "BPO financeiro", confidence: NaN, rationale: "" },
      ],
    }),
    { segmentId: "alimentacao", catalog: activeCatalog },
  );

  it("needKind fora do domínio → outro (não derruba a sugestão)", () => {
    expect(norm.needs[0]).toMatchObject({ taxonomyItemId: "tx-mkt", needKind: "outro" });
  });

  it("needKind ausente → outro", () => {
    expect(norm.needs[1]!.needKind).toBe("outro");
  });

  it("confidence ausente/NaN não descarta o item (default 0.5)", () => {
    expect(norm.needs[2]).toMatchObject({ taxonomyItemId: "tx-bpo", confidence: 0.5 });
  });
});

describe("(7) deduplicação e limite máximo", () => {
  const norm = normalizeAgainstCatalog(
    model({
      offers: [
        off("tx-buffet", "Buffet"),
        off("tx-buffet", "buffet"),
        off(null, "  BUFFET  "),
        off(null, "A"),
        off(null, "B"),
        off(null, "C"),
        off(null, "D"),
        off(null, "E"),
        off(null, "F"),
      ],
    }),
    { segmentId: "alimentacao", catalog: activeCatalog },
  );

  it("labels duplicados (case/espaços) são eliminados", () => {
    expect(norm.offers.filter((o) => o.label.toLowerCase().trim() === "buffet").length).toBe(1);
  });

  it("no máximo 5 itens por lista", () => {
    expect(norm.offers.length).toBe(5);
    expect(norm.offers.map((o) => o.label)).toEqual(["Buffet", "A", "B", "C", "D"]);
  });
});

describe("(10) defesa determinística mínima contra sugestão desconectada", () => {
  it("o piso é baixo o suficiente para não bloquear sugestão boa", () => {
    expect(MIN_SUGGESTION_CONFIDENCE).toBeLessThanOrEqual(0.3);
  });

  it("item explicitamente quase-chute (confidence < piso) é descartado", () => {
    const norm = normalizeAgainstCatalog(
      model({
        needs: [
          need("tx-mkt", "Marketing digital", "servico", 0.9),
          need("tx-estrutura", "Estrutura para eventos", "servico", 0.05),
        ],
      }),
      { segmentId: "alimentacao", catalog: activeCatalog },
    );
    expect(norm.needs.map((n) => n.label)).toEqual(["Marketing digital"]);
  });

  it("cross-segment com confiança normal NÃO é bloqueado pelo piso", () => {
    const norm = normalizeAgainstCatalog(
      model({ needs: [need("tx-contabil", "Contabilidade empresarial", "servico", 0.35)] }),
      { segmentId: "alimentacao", catalog: activeCatalog },
    );
    expect(norm.needs[0]!.taxonomyItemId).toBe("tx-contabil");
  });

  it("o prompt exige aderência ao resumo e justificativa citando o texto", () => {
    const p = buildPrompt(restauranteInput, activeCatalog);
    expect(p).toContain("ADERÊNCIA");
    expect(p).toMatch(/ancorada no resumo/i);
    expect(p).toMatch(/Não liste itens do catálogo só porque existem/i);
    // e continua permitindo cross-segment (Impl 5)
    expect(p).toMatch(/cross-segment são permitidas/i);
  });
});

// ------------------------------------------------------------ fallback heurístico

describe("(8) fallback heurístico continua funcional e não inventa cross-segment", () => {
  it("sugere apenas itens do próprio segmento do participante", async () => {
    const res = await heuristicSuggestionProvider.suggest({
      segmentId: "alimentacao",
      summary: restauranteInput.summary,
      catalog: activeCatalog,
    });
    expect(res.items.length).toBeGreaterThan(0);
    const segs = new Set(res.items.map((i) => i.segmentId));
    expect([...segs]).toEqual(["alimentacao"]);
  });

  it("nunca marca taxonomyItemId de item sem segmento próprio", async () => {
    const res = await heuristicSuggestionProvider.suggest({
      segmentId: "alimentacao",
      summary: restauranteInput.summary,
      catalog: activeCatalog,
    });
    for (const i of res.items) {
      if (i.taxonomyItemId) expect(i.segmentId).toBeTruthy();
    }
  });

  it("inferNeedKind é determinístico e coerente com o significado", () => {
    expect(inferNeedKind("Marketing digital")).toBe("servico");
    expect(inferNeedKind("Contabilidade empresarial")).toBe("servico");
    expect(inferNeedKind("Transporte e entregas")).toBe("servico");
    expect(inferNeedKind("Fornecedor de embalagens")).toBe("fornecedor");
    expect(inferNeedKind("Distribuidor regional")).toBe("distribuidores");
    expect(inferNeedKind("Zzz aleatório")).toBe("outro");
  });
});

// -------------------------------------------------------- pipeline + cache (12)

function deps(over: Partial<OrchestratorDeps>): OrchestratorDeps {
  return {
    readCache: async () => null,
    writeCache: async () => {},
    consumeRateLimit: async () => true,
    logRun: async () => {},
    fallback: async () => ({
      understanding: { summary: "", mainActivity: "", keywords: [], clarifyingQuestion: null },
      offers: [],
      needs: [],
      source: "heuristic",
      promptVersion: PROMPT_VERSION,
    }),
    callGateway: async () => ({ output: model({}) }),
    sleep: async () => {},
    now: () => 0,
    ...over,
  } as OrchestratorDeps;
}

describe("(12) versão de prompt e cache", () => {
  it("resultado do Gateway sai com a versão atual e source ai", async () => {
    const res = await runOnboardingAi({
      input: restauranteInput,
      catalog: activeCatalog,
      actorUserId: "u1",
      deps: deps({
        callGateway: async () => ({
          output: model({ needs: [need("tx-mkt", "Marketing digital", "servico")] }),
        }),
      }),
    });
    expect(res.promptVersion).toBe(PROMPT_VERSION);
    expect(res.source).toBe("ai");
    expect(res.needs[0]).toMatchObject({ segmentId: "marketing", needKind: "servico" });
  });

  it("cache antigo sem segmentId/needKind é rejeitado e o pipeline recalcula", async () => {
    const stale = {
      understanding: { summary: "", mainActivity: "", keywords: [], clarifyingQuestion: null },
      offers: [],
      needs: [{ taxonomyItemId: "tx-mkt", label: "Marketing digital", kind: "need", confidence: 0.8 }],
      source: "ai",
      promptVersion: "a1a2-v4-needkind",
    };
    let called = 0;
    const res = await runOnboardingAi({
      input: restauranteInput,
      catalog: activeCatalog,
      actorUserId: "u1",
      deps: deps({
        readCache: async () => stale as never,
        callGateway: async () => {
          called += 1;
          return { output: model({ needs: [need("tx-bpo", "BPO financeiro", "servico")] }) };
        },
      }),
    });
    expect(called).toBe(1);
    expect(res.promptVersion).toBe(PROMPT_VERSION);
    expect(res.needs[0]!.taxonomyItemId).toBe("tx-bpo");
  });

  it("cache válido da versão atual é servido sem chamar o Gateway", async () => {
    const good: AiSuggestionResult = aiSuggestionResultSchema.parse({
      understanding: { summary: "", mainActivity: "", keywords: [], clarifyingQuestion: null },
      offers: [],
      needs: [
        {
          taxonomyItemId: "tx-mkt",
          segmentId: "marketing",
          label: "Marketing digital",
          kind: "need",
          needKind: "servico",
          confidence: 0.8,
        },
      ],
      source: "ai",
      promptVersion: PROMPT_VERSION,
    });
    let called = 0;
    const res = await runOnboardingAi({
      input: restauranteInput,
      catalog: activeCatalog,
      actorUserId: "u1",
      deps: deps({
        readCache: async () => good,
        callGateway: async () => {
          called += 1;
          return { output: model({}) };
        },
      }),
    });
    expect(called).toBe(0);
    expect(res.needs[0]!.segmentId).toBe("marketing");
  });

  it("erro terminal do Gateway cai no heurístico com source heuristic", async () => {
    const res = await runOnboardingAi({
      input: restauranteInput,
      catalog: activeCatalog,
      actorUserId: "u1",
      deps: deps({
        callGateway: async () => {
          throw new Error("400 bad request");
        },
      }),
    });
    expect(res.source).toBe("heuristic");
  });
});

// ------------------------------------------- (15) regressões: edição, limite, source

describe("(15) regressões de edição, limite e source", () => {
  it("mergeCapped respeita o limite 5 e não duplica labels existentes", () => {
    const base: WizardOffer[] = [
      { localId: "1", label: "Buffet", segmentId: "alimentacao", taxonomyItemId: "tx-buffet" },
    ];
    const add: WizardOffer[] = ["Buffet", "A", "B", "C", "D", "E"].map((l) => ({
      localId: l,
      label: l,
      segmentId: "marketing",
      taxonomyItemId: null,
      source: "ai" as const,
    }));
    const merged = mergeCapped(base, add, 5);
    expect(merged.length).toBe(5);
    expect(merged.filter((m) => m.label.toLowerCase() === "buffet").length).toBe(1);
    expect(merged[0]!.source).toBeUndefined();
  });

  it("editar perfil preserva o segmento cross-segment de cada item", () => {
    const draft = mapProfileToWizardDraft({
      id: "p1",
      event_id: "sudoexpo-2026",
      name: "Ana",
      company: "Restaurante da Ana",
      city: "Rio Verde",
      neighborhood: null,
      segment_id: "alimentacao",
      summary: restauranteInput.summary,
      consent: true,
      offers: [
        {
          id: "o1",
          label: "Delivery de refeições",
          detail: null,
          segment_id: "alimentacao",
          taxonomy_item_id: "tx-delivery",
        },
      ],
      needs: [
        {
          id: "n1",
          label: "Marketing digital",
          detail: null,
          segment_id: "marketing",
          taxonomy_item_id: "tx-mkt",
          need_kind: "servico",
          is_priority: true,
        },
      ],
    } as never);

    expect(draft.segmentId).toBe("alimentacao");
    expect(draft.needs[0]).toMatchObject({ segmentId: "marketing", needKind: "servico" });

    // re-salvar não reescreve o segmento do item para o da empresa
    const payload = mapWizardToSaveProfileInput(draft, "sudoexpo-2026");
    expect(payload.needs[0]!.segment_id).toBe("marketing");
    expect(payload.needs[0]!.source).toBe("user");
  });

  it("source heuristic sobrevive até o payload", () => {
    const draft: WizardDraft = {
      ...createEmptyDraft(),
      name: "Bia",
      company: "Eventos Bia",
      city: "Rio Verde",
      segmentId: "servicos",
      summary: eventosInput.summary,
      consent: true,
      offers: [
        {
          localId: "o",
          label: "Estrutura para eventos",
          segmentId: "servicos",
          taxonomyItemId: "tx-estrutura",
          source: "heuristic",
        },
      ],
      needs: [
        {
          localId: "n",
          label: "Fotografia",
          segmentId: "marketing",
          taxonomyItemId: "tx-foto",
          needKind: "servico",
          isPriority: true,
          source: "heuristic",
        },
      ],
    };
    const payload = mapWizardToSaveProfileInput(draft, "sudoexpo-2026");
    expect(payload.offers[0]!.source).toBe("heuristic");
    expect(payload.needs[0]!.source).toBe("heuristic");
    expect(payload.needs[0]!.segment_id).toBe("marketing");
  });
});

// -------------------------------------------- (14) revisão transversal da Fase 2

describe("(14) elo a elo da Fase 2", () => {
  it("segmento da empresa → catálogo COMPLETO no prompt (nenhum filtro por segmento)", () => {
    const p = buildPrompt(restauranteInput, activeCatalog);
    for (const t of activeCatalog.taxonomy) expect(p).toContain(t.id);
  });

  it("sugestão → id válido → segmento do item → needKind → confirmação → payload", () => {
    const suggestion: AiSuggestionItem = normalizeAgainstCatalog(
      model({ needs: [need("tx-pedidos", "Automação de pedidos", "servico")] }),
      { segmentId: "alimentacao", catalog: activeCatalog },
    ).needs[0]!;

    expect(suggestion).toMatchObject({
      taxonomyItemId: "tx-pedidos",
      segmentId: "tecnologia",
      needKind: "servico",
    });

    const draft: WizardDraft = {
      ...createEmptyDraft(),
      name: "Ana",
      company: "Restaurante da Ana",
      city: "Rio Verde",
      segmentId: "alimentacao",
      summary: restauranteInput.summary,
      consent: true,
      offers: [
        {
          localId: "o",
          label: "Delivery de refeições",
          segmentId: "alimentacao",
          taxonomyItemId: "tx-delivery",
          source: "user",
        },
      ],
      // confirmação humana explícita: só entra no draft porque o usuário aceitou
      needs: [
        {
          localId: "n",
          label: suggestion.label,
          segmentId: suggestion.segmentId ?? "alimentacao",
          taxonomyItemId: suggestion.taxonomyItemId,
          needKind: suggestion.needKind ?? "outro",
          isPriority: true,
          source: "ai",
        },
      ],
    };
    const payload = mapWizardToSaveProfileInput(draft, "sudoexpo-2026");
    expect(payload).toMatchObject({ segmentId: "alimentacao" });
    expect(payload.needs[0]).toMatchObject({
      taxonomy_item_id: "tx-pedidos",
      segment_id: "tecnologia",
      need_kind: "servico",
      source: "ai",
    });
  });
});
