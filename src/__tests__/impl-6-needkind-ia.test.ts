import { describe, expect, it } from "vitest";
import {
  DEFAULT_NEED_KIND,
  NEED_KIND_VALUES,
  PROMPT_VERSION,
  aiSuggestionItemSchema,
  coerceNeedKind,
  modelOutputSchema,
  normalizeAgainstCatalog,
  type ModelOutput,
} from "@/lib/onboarding-ai-schema";
import { buildPrompt } from "@/lib/onboarding-ai-orchestrator";
import { inferNeedKind } from "@/features/onboarding/suggestions";
import { needKindSchema } from "@/features/participant/schemas";
import { mapWizardToSaveProfileInput } from "@/features/onboarding/mappers";
import { mergeCapped } from "@/features/onboarding/mergeItems";
import type { EventCatalog } from "@/features/participant/types";
import type { WizardDraft, WizardNeed } from "@/features/onboarding/types";

/** IMPL 6 — needKind na saída da IA (independente do seletor da UI). */

const catalog: EventCatalog = {
  segments: [{ id: "alimentacao", label: "Alimentação", emoji: null }] as EventCatalog["segments"],
  taxonomy: [
    {
      id: "tx-emb",
      segment_id: "logistica",
      label: "Embalagens",
      kind: "both",
      synonyms: [],
    },
    {
      id: "tx-mkt",
      segment_id: "marketing",
      label: "Marketing digital",
      kind: "both",
      synonyms: [],
    },
  ],
};

function need(label: string, needKind: unknown) {
  return { taxonomyItemId: null, label, needKind, confidence: 0.8, rationale: "r" } as never;
}

function output(needs: unknown[]): ModelOutput {
  return modelOutputSchema.parse({
    understanding: { summary: "s", mainActivity: "a", keywords: [], clarifyingQuestion: null },
    offers: [{ taxonomyItemId: null, label: "Buffet", confidence: 0.9, rationale: "r" }],
    needs,
  });
}

function normNeeds(needs: unknown[]) {
  return normalizeAgainstCatalog(output(needs), { segmentId: "alimentacao", catalog }).needs;
}

describe("contrato do domínio", () => {
  it("usa exatamente os valores aceitos por save_own_profile_v2", () => {
    expect([...NEED_KIND_VALUES].sort()).toEqual(
      [
        "compradores",
        "distribuidores",
        "fornecedor",
        "outro",
        "parceiro",
        "produtos",
        "profissionais",
        "servico",
      ].sort(),
    );
    expect(NEED_KIND_VALUES).toEqual(needKindSchema.options);
    expect(DEFAULT_NEED_KIND).toBe("outro");
  });

  it("needKind é semanticamente obrigatório em sugestões de necessidade", () => {
    // IMPL 7: itens carregam `segmentId` (null = texto livre).
    const base = { taxonomyItemId: null, segmentId: null, label: "X", confidence: 0.5 };
    expect(aiSuggestionItemSchema.safeParse({ ...base, kind: "need" }).success).toBe(false);
    expect(
      aiSuggestionItemSchema.safeParse({ ...base, kind: "need", needKind: "fornecedor" }).success,
    ).toBe(true);
    // Ofertas não precisam de needKind.
    expect(aiSuggestionItemSchema.safeParse({ ...base, kind: "offer" }).success).toBe(true);
    expect(
      aiSuggestionItemSchema.safeParse({ ...base, kind: "need", needKind: "hackz" }).success,
    ).toBe(false);
  });
});

describe("normalização preserva o needKind da própria sugestão", () => {
  const casos: Array<[string, string, string]> = [
    ["Fornecedor de embalagens", "fornecedor", "fornecedor"],
    ["Serviço contábil", "servico", "servico"],
    ["Parceria comercial", "parceiro", "parceiro"],
    ["Novos compradores", "compradores", "compradores"],
    ["Distribuidor regional", "distribuidores", "distribuidores"],
    ["Profissionais de cozinha", "profissionais", "profissionais"],
    ["Comprar equipamento", "produtos", "produtos"],
    ["Algo indefinido", "outro", "outro"],
  ];
  for (const [label, sugerido, esperado] of casos) {
    it(`${label} => ${esperado}`, () => {
      expect(normNeeds([need(label, sugerido)])[0]!.needKind).toBe(esperado);
    });
  }

  it("ofertas continuam sem needKind", () => {
    const r = normalizeAgainstCatalog(output([]), { segmentId: "alimentacao", catalog });
    expect(r.offers[0]!.needKind).toBeUndefined();
  });

  it("preserva taxonomyItemId junto com o needKind", () => {
    const r = normNeeds([
      {
        taxonomyItemId: "tx-emb",
        label: "Embalagens",
        needKind: "fornecedor",
        confidence: 0.7,
        rationale: "r",
      },
    ]);
    expect(r[0]).toMatchObject({ taxonomyItemId: "tx-emb", needKind: "fornecedor" });
  });
});

describe("resposta inválida/incompleta não quebra o fluxo", () => {
  it("needKind inexistente no domínio vira 'outro' (item não é descartado)", () => {
    const r = normNeeds([need("Fornecedor de embalagens", "supplier")]);
    expect(r).toHaveLength(1);
    expect(r[0]!.needKind).toBe("outro");
  });

  it("needKind ausente/null/não-string vira 'outro'", () => {
    expect(normNeeds([need("A", undefined)])[0]!.needKind).toBe("outro");
    expect(normNeeds([need("B", null)])[0]!.needKind).toBe("outro");
    expect(
      modelOutputSchema.safeParse({
        understanding: { summary: "", mainActivity: "", keywords: [], clarifyingQuestion: null },
        offers: [],
        needs: [{ taxonomyItemId: null, label: "C", confidence: 0.5, rationale: "" }],
      }).success,
    ).toBe(true);
  });

  it("coerceNeedKind normaliza caixa/espaços e cai para 'outro'", () => {
    expect(coerceNeedKind("  Fornecedor ")).toBe("fornecedor");
    expect(coerceNeedKind(42)).toBe("outro");
    expect(coerceNeedKind("")).toBe("outro");
  });
});

describe("prompt", () => {
  const p = buildPrompt(
    { eventId: "e1", segmentId: "alimentacao", summary: "Restaurante" },
    catalog,
  );

  it("exige needKind classificado pelo significado, não pelo segmento/UI", () => {
    expect(p).toContain("cada NECESSIDADE precisa de `needKind`");
    expect(p).toContain("nunca pelo segmento da empresa nem por qualquer estado de tela");
  });

  it("lista os valores válidos e os exemplos pedidos", () => {
    for (const v of NEED_KIND_VALUES) expect(p).toContain(v);
    expect(p).toContain("fornecedor de embalagens => fornecedor");
    expect(p).toContain("contratar contador ou agência de marketing => servico");
    expect(p).toContain("achar distribuidor para meus produtos => distribuidores");
    expect(p).toContain("contratar profissionais/mão de obra => profissionais");
    expect(p).toContain("comprar produto/equipamento => produtos");
    expect(p).toContain("parceria comercial => parceiro");
    expect(p).toContain("Ofertas NÃO têm needKind");
  });
});

describe("cache/prompt version", () => {
  it("versão nova invalida respostas antigas sem needKind", () => {
    // A versão evolui a cada mudança de contrato (IMPL 7 = a1a2-v5-itemsegment).
    expect(PROMPT_VERSION).not.toBe("a1a2-v3-crossseg");
    expect(PROMPT_VERSION.startsWith("a1a2-v")).toBe(true);
  });
});

describe("fallback heurístico tem tipos coerentes", () => {
  const casos: Array<[string, string]> = [
    ["Fornecedor de embalagens", "fornecedor"],
    ["Serviços de contabilidade", "servico"],
    ["Marketing digital", "servico"],
    ["Distribuidor para o interior", "distribuidores"],
    ["Novos clientes", "compradores"],
    ["Profissionais de vendas", "profissionais"],
    ["Parceria comercial", "parceiro"],
    ["Comprar equipamento de cozinha", "produtos"],
    ["Xyzabc", "outro"],
  ];
  for (const [label, esperado] of casos) {
    it(`${label} => ${esperado}`, () => {
      expect(inferNeedKind(label)).toBe(esperado);
    });
  }

  it("nunca devolve valor fora do domínio", () => {
    expect(NEED_KIND_VALUES).toContain(inferNeedKind("qualquer coisa esquisita"));
  });
});

describe("pipeline UI → payload de submit", () => {
  function accept(uiKind: "servico", suggested: string | undefined) {
    // Réplica exata do handler de StepNeeds.
    const additions: WizardNeed[] = [
      {
        localId: "n1",
        label: "Fornecedor de embalagens",
        segmentId: "alimentacao",
        taxonomyItemId: "tx-emb",
        needKind: (suggested as WizardNeed["needKind"]) ?? "outro",
        isPriority: true,
        source: "ai",
      },
    ];
    void uiKind;
    return mergeCapped<WizardNeed>([], additions, 5);
  }

  it("UI em 'servico' não sobrescreve 'fornecedor' sugerido", () => {
    expect(accept("servico", "fornecedor")[0]!.needKind).toBe("fornecedor");
  });

  it("sugestão sem needKind cai em 'outro', nunca no seletor da UI", () => {
    expect(accept("servico", undefined)[0]!.needKind).toBe("outro");
  });

  it("o needKind sugerido sobrevive até o payload de save_own_profile_v2", () => {
    const needs = accept("servico", "fornecedor");
    const draft: WizardDraft = {
      step: 4,
      name: "Ana",
      company: "Rest",
      city: "RV",
      neighborhood: "",
      businessSize: "pequeno",
      businessType: "servico",
      niche: "",
      segmentId: "alimentacao",
      summary: "Restaurante familiar com buffet corporativo diário.",
      instagram: "",
      targetBusinessSize: "any",
      targetBusinessType: "any",
      targetSegmentId: "any",
      offers: [
        {
          localId: "o1",
          label: "Buffet",
          segmentId: "alimentacao",
          taxonomyItemId: null,
        },
      ],
      needs,
      consent: true,
    };
    const payload = mapWizardToSaveProfileInput(draft, "sudoexpo-2026");
    expect(payload.needs[0]!.need_kind).toBe("fornecedor");
    expect(needKindSchema.safeParse(payload.needs[0]!.need_kind).success).toBe(true);
  });
});
