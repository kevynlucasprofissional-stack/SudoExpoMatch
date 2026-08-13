import { describe, expect, it } from "vitest";
import {
  PROMPT_VERSION,
  aiSuggestionItemSchema,
  modelOutputSchema,
  normalizeAgainstCatalog,
  type AiSuggestionItem,
  type ModelOutput,
} from "@/lib/onboarding-ai-schema";
import { heuristicSuggestionProvider } from "@/features/onboarding/suggestions";
import {
  mapWizardToSaveProfileInput,
  mapProfileToWizardDraft,
} from "@/features/onboarding/mappers";
import { wizardDraftSchema, persistedDraftSchema } from "@/features/onboarding/schemas";
import { catalogTaxonomyItemSchema } from "@/features/taxonomy/schemas";
import type { EventCatalog } from "@/features/participant/types";
import type { WizardDraft, WizardNeed, WizardOffer } from "@/features/onboarding/types";

/**
 * IMPL 7 — o segmento de cada offer/need vem de `taxonomy_items.segment_id`.
 * `profile.segment_id` continua sendo o segmento da EMPRESA.
 */

const TX_MKT = "11111111-1111-1111-1111-111111111111";
const TX_BUFFET = "22222222-2222-2222-2222-222222222222";
const TX_SEMSEG = "33333333-3333-3333-3333-333333333333";

const catalog: EventCatalog = {
  segments: [
    { id: "alimentacao", label: "Alimentação", emoji: null },
    { id: "marketing", label: "Marketing", emoji: null },
  ],
  taxonomy: [
    {
      id: TX_MKT,
      segment_id: "marketing",
      label: "Gestão de redes sociais",
      kind: "both",
      synonyms: [],
    },
    { id: TX_BUFFET, segment_id: "alimentacao", label: "Buffet", kind: "both", synonyms: [] },
    { id: TX_SEMSEG, segment_id: null, label: "Item sem segmento", kind: "both", synonyms: [] },
  ],
};

function modelOut(opts: {
  offerTax?: string | null;
  offerLabel?: string;
  needTax?: string | null;
  needLabel?: string;
}): ModelOutput {
  return modelOutputSchema.parse({
    understanding: { summary: "s", mainActivity: "a", keywords: [], clarifyingQuestion: null },
    offers: [
      {
        taxonomyItemId: opts.offerTax ?? null,
        label: opts.offerLabel ?? "Buffet",
        confidence: 0.9,
        rationale: "r",
      },
    ],
    needs: [
      {
        taxonomyItemId: opts.needTax ?? null,
        label: opts.needLabel ?? "Gestão de redes sociais",
        needKind: "servico",
        confidence: 0.8,
        rationale: "r",
      },
    ],
  });
}

const norm = (o: Parameters<typeof modelOut>[0]) =>
  normalizeAgainstCatalog(modelOut(o), { segmentId: "alimentacao", catalog });

describe("normalização deriva o segmento do próprio taxonomy item", () => {
  it("necessidade cross-segment (marketing) para restaurante alimentação", () => {
    const r = norm({ needTax: TX_MKT });
    expect(r.needs[0]).toMatchObject({
      taxonomyItemId: TX_MKT,
      segmentId: "marketing",
      needKind: "servico",
    });
  });

  it("oferta cross-segment usa o segmento do item, não o da empresa", () => {
    const r = norm({ offerTax: TX_MKT, offerLabel: "Gestão de redes sociais" });
    expect(r.offers[0]).toMatchObject({ taxonomyItemId: TX_MKT, segmentId: "marketing" });
  });

  it("same-segment continua preservado", () => {
    const r = norm({ offerTax: TX_BUFFET });
    expect(r.offers[0]).toMatchObject({ taxonomyItemId: TX_BUFFET, segmentId: "alimentacao" });
  });

  it("ID inválido/inativo → texto livre (sem segmento inventado)", () => {
    const r = norm({ needTax: "44444444-4444-4444-4444-444444444444" });
    expect(r.needs[0]).toMatchObject({ taxonomyItemId: null, segmentId: null });
  });

  it("taxonomy item com segment_id nulo não é autoritativo → texto livre", () => {
    const r = norm({ needTax: TX_SEMSEG, needLabel: "Item sem segmento" });
    expect(r.needs[0]).toMatchObject({ taxonomyItemId: null, segmentId: null });
  });

  it("modelo nunca informa segmento: o campo é ignorado se vier no fio", () => {
    const raw = modelOut({ needTax: TX_MKT }) as unknown as Record<string, unknown>;
    (raw["needs"] as Array<Record<string, unknown>>)[0]!["segmentId"] = "alimentacao";
    const r = normalizeAgainstCatalog(raw as ModelOutput, { segmentId: "alimentacao", catalog });
    expect(r.needs[0]!.segmentId).toBe("marketing");
  });

  it("schema exige segmentId quando há taxonomy item", () => {
    const base = { taxonomyItemId: TX_MKT, label: "X", kind: "offer" as const, confidence: 0.5 };
    expect(aiSuggestionItemSchema.safeParse({ ...base, segmentId: null }).success).toBe(false);
    expect(aiSuggestionItemSchema.safeParse({ ...base, segmentId: "marketing" }).success).toBe(
      true,
    );
    expect(
      aiSuggestionItemSchema.safeParse({ ...base, taxonomyItemId: null, segmentId: null }).success,
    ).toBe(true);
  });

  it("catálogo aceita segment_id nulo vindo do banco", () => {
    expect(
      catalogTaxonomyItemSchema.safeParse({
        id: TX_SEMSEG,
        segment_id: null,
        label: "L",
        kind: "both",
        synonyms: [],
      }).success,
    ).toBe(true);
  });
});

describe("heurística (fallback) também usa o segmento do item", () => {
  it("itens do catálogo carregam o próprio segmento", async () => {
    const r = await heuristicSuggestionProvider.suggest({
      segmentId: "alimentacao",
      summary: "restaurante com buffet",
      catalog,
    });
    for (const item of r.items) {
      if (item.taxonomyItemId) expect(item.segmentId).toBeTruthy();
    }
    const buffet = r.items.find((i) => i.taxonomyItemId === TX_BUFFET);
    expect(buffet?.segmentId).toBe("alimentacao");
  });

  it("não inventa segmento para item sem segment_id", async () => {
    const r = await heuristicSuggestionProvider.suggest({
      segmentId: "alimentacao",
      summary: "restaurante",
      catalog,
    });
    const semSeg = r.items.find((i) => i.label === "Item sem segmento");
    if (semSeg) {
      expect(semSeg.taxonomyItemId).toBeNull();
      expect(semSeg.segmentId ?? null).toBeNull();
    }
  });
});

// ---------- UI → draft → payload ----------

function acceptOffers(picks: AiSuggestionItem[], profileSegment: string): WizardOffer[] {
  // Réplica do handler de StepOffers (IMPL 7).
  return picks.map((s, i) => ({
    localId: `o${i}`,
    label: s.label,
    segmentId: s.segmentId ?? profileSegment,
    taxonomyItemId: s.taxonomyItemId,
    source: "ai" as const,
  }));
}

function acceptNeeds(picks: AiSuggestionItem[], profileSegment: string): WizardNeed[] {
  return picks.map((s, i) => ({
    localId: `n${i}`,
    label: s.label,
    segmentId: s.segmentId ?? profileSegment,
    taxonomyItemId: s.taxonomyItemId,
    needKind: s.needKind ?? "outro",
    isPriority: i === 0,
    source: "ai" as const,
  }));
}

function draftWith(offers: WizardOffer[], needs: WizardNeed[]): WizardDraft {
  return {
    step: 5,
    name: "Ana",
    company: "Restaurante",
    city: "Rio Verde",
    neighborhood: "",
    segmentId: "alimentacao",
    summary: "Restaurante familiar com buffet corporativo diário.",
    offers,
    needs,
    consent: true,
  };
}

describe("aceitar sugestão na UI preserva o segmento da taxonomia", () => {
  const r = norm({ offerTax: TX_BUFFET, needTax: TX_MKT });
  const offers = acceptOffers(r.offers, "alimentacao");
  const needs = acceptNeeds(r.needs, "alimentacao");

  it("need de marketing não é sobrescrito pelo perfil alimentação", () => {
    expect(needs[0]!.segmentId).toBe("marketing");
    expect(needs[0]!.needKind).toBe("servico"); // IMPL 6 intacta
    expect(needs[0]!.source).toBe("ai"); // source intacto
  });

  it("aceitar todas de uma vez não sobrescreve segmentos", () => {
    const mix = norm({ offerTax: TX_MKT, offerLabel: "Gestão de redes sociais" });
    const all = acceptOffers([...mix.offers, ...r.offers], "alimentacao");
    expect(all.map((o) => o.segmentId)).toEqual(["marketing", "alimentacao"]);
  });

  it("texto livre cai no segmento da empresa (sem inventar)", () => {
    const livre = acceptNeeds(norm({ needTax: null }).needs, "alimentacao");
    expect(livre[0]).toMatchObject({ taxonomyItemId: null, segmentId: "alimentacao" });
  });

  it("payload preserva marketing no item e alimentação no perfil", () => {
    const payload = mapWizardToSaveProfileInput(draftWith(offers, needs), "sudoexpo-2026");
    expect(payload.segmentId).toBe("alimentacao");
    expect(payload.needs[0]!.segment_id).toBe("marketing");
    expect(payload.needs[0]!.taxonomy_item_id).toBe(TX_MKT);
    expect(payload.offers[0]!.segment_id).toBe("alimentacao");
  });

  it("draft sanitize/restore preserva o cross-segment", () => {
    const draft = draftWith(offers, needs);
    const restored = persistedDraftSchema.parse(
      JSON.parse(
        JSON.stringify({ version: 2, savedAt: new Date().toISOString(), draft }),
      ) as unknown,
    );
    expect(wizardDraftSchema.parse(restored.draft).needs[0]!.segmentId).toBe("marketing");
    expect(restored.draft.segmentId).toBe("alimentacao");
  });

  it("edição de perfil existente preserva marketing no need", () => {
    const wizard = mapProfileToWizardDraft({
      id: "p1",
      event_id: "sudoexpo-2026",
      name: "Ana",
      company: "Restaurante",
      city: "Rio Verde",
      neighborhood: null,
      segment_id: "alimentacao",
      summary: "Restaurante familiar com buffet corporativo diário.",
      consent: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      offers: [
        {
          id: "o1",
          label: "Buffet",
          detail: null,
          segment_id: "alimentacao",
          taxonomy_item_id: TX_BUFFET,
          source: "user",
        },
      ],
      needs: [
        {
          id: "n1",
          label: "Gestão de redes sociais",
          detail: null,
          segment_id: "marketing",
          taxonomy_item_id: TX_MKT,
          need_kind: "servico",
          is_priority: true,
          source: "ai",
        },
      ],
    } as never);
    expect(wizard.segmentId).toBe("alimentacao");
    expect(wizard.needs[0]!.segmentId).toBe("marketing");
    const payload = mapWizardToSaveProfileInput(
      { ...wizard, step: 5, consent: true },
      "sudoexpo-2026",
    );
    expect(payload.needs[0]!.segment_id).toBe("marketing");
  });

  it("trocar o segmento da empresa não reescreve itens de taxonomia", () => {
    // Réplica de StepSegment.handleSelect (IMPL 7).
    const prev = "alimentacao";
    const novo = "servicos";
    const rewrite = <T extends { segmentId: string; taxonomyItemId: string | null }>(list: T[]) =>
      list.map((i) => (!i.taxonomyItemId && i.segmentId === prev ? { ...i, segmentId: novo } : i));
    const livre = acceptNeeds(norm({ needTax: null }).needs, prev);
    expect(rewrite(needs)[0]!.segmentId).toBe("marketing");
    expect(rewrite(offers)[0]!.segmentId).toBe("alimentacao"); // ancorado em taxonomia
    expect(rewrite(livre)[0]!.segmentId).toBe(novo); // texto livre acompanha
  });
});

describe("cache/prompt version", () => {
  it("versão nova invalida cache sem segmentId", () => {
    // A versão evolui a cada mudança de contrato (IMPL 8 = a1a2-v6-adherence).
    expect(PROMPT_VERSION).not.toBe("a1a2-v4-needkind");
    expect(PROMPT_VERSION.startsWith("a1a2-v")).toBe(true);
  });
});
