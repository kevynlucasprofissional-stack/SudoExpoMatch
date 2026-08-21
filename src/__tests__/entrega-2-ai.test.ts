import { describe, expect, it } from "vitest";
import {
  aiSuggestionResultSchema,
  buildAiRunInput,
  hashCacheKey,
  normalizeAgainstCatalog,
  suggestOnboardingInputSchema,
  type ModelOutput,
} from "@/lib/onboarding-ai-schema";
import type { EventCatalog } from "@/features/participant/types";

const catalog: EventCatalog = {
  segments: [
    { id: "tecnologia", label: "Tecnologia", emoji: null, profile_selectable: true },
    { id: "servicos", label: "Serviços", emoji: null, profile_selectable: true },
  ],
  taxonomy: [
    {
      id: "11111111-1111-1111-1111-111111111111",
      segment_id: "tecnologia",
      label: "Software de gestão",
      kind: "offer",
      synonyms: [],
    },
    {
      id: "22222222-2222-2222-2222-222222222222",
      segment_id: "tecnologia",
      label: "Suporte técnico",
      kind: "both",
      synonyms: [],
    },
    {
      id: "33333333-3333-3333-3333-333333333333",
      segment_id: "servicos",
      label: "Contador",
      kind: "offer",
      synonyms: [],
    },
  ],
};

describe("suggestOnboardingInputSchema", () => {
  it("aceita entrada mínima válida", () => {
    const r = suggestOnboardingInputSchema.safeParse({
      eventId: "e",
      segmentId: "tecnologia",
      summary: "Fornecedor de software",
    });
    expect(r.success).toBe(true);
  });
  it("rejeita summary vazio ou >800 chars", () => {
    expect(
      suggestOnboardingInputSchema.safeParse({ eventId: "e", segmentId: "s", summary: "" }).success,
    ).toBe(false);
    expect(
      suggestOnboardingInputSchema.safeParse({
        eventId: "e",
        segmentId: "s",
        summary: "x".repeat(801),
      }).success,
    ).toBe(false);
  });
});

describe("normalizeAgainstCatalog", () => {
  const baseModelOutput: ModelOutput = {
    understanding: {
      summary: "resumo",
      mainActivity: "software",
      keywords: ["saas"],
      clarifyingQuestion: null,
    },
    offers: [
      {
        taxonomyItemId: "11111111-1111-1111-1111-111111111111",
        label: "Software de gestão",
        confidence: 0.9,
        rationale: "match direto",
      },
      {
        taxonomyItemId: "33333333-3333-3333-3333-333333333333",
        label: "Contador",
        confidence: 0.8,
        rationale: "",
      }, // segmento errado
      {
        taxonomyItemId: "00000000-0000-0000-0000-000000000000",
        label: "Fantasma",
        confidence: 0.5,
        rationale: "",
      }, // id inexistente
      { taxonomyItemId: null, label: "Consultoria custom", confidence: 0.7, rationale: "" },
    ],
    needs: [
      {
        taxonomyItemId: "22222222-2222-2222-2222-222222222222",
        label: "Suporte técnico",
        needKind: null,
        confidence: 0.7,
        rationale: "",
      }, // both -> ok como need
      {
        taxonomyItemId: "11111111-1111-1111-1111-111111111111",
        label: "Software de gestão",
        needKind: null,
        confidence: 0.6,
        rationale: "",
      }, // kind offer -> null
    ],
  };

  it("remove IDs inválidos e kind incompatível; aceita cross-segment (IMPL 5)", () => {
    const r = normalizeAgainstCatalog(baseModelOutput, { segmentId: "tecnologia", catalog });
    // IMPL 5: item de outro segmento é válido (cross-segment permitido).
    expect(r.offers.find((o) => o.label === "Contador")?.taxonomyItemId).toBe(
      "33333333-3333-3333-3333-333333333333",
    );
    expect(r.offers.find((o) => o.label === "Fantasma")?.taxonomyItemId).toBeNull();
    expect(r.offers.find((o) => o.label === "Software de gestão")?.taxonomyItemId).toBe(
      "11111111-1111-1111-1111-111111111111",
    );
    expect(r.needs.find((n) => n.label === "Software de gestão")?.taxonomyItemId).toBeNull();
    expect(r.needs.find((n) => n.label === "Suporte técnico")?.taxonomyItemId).toBe(
      "22222222-2222-2222-2222-222222222222",
    );
  });

  it("limita a 5 ofertas e deduplica por label", () => {
    const many: ModelOutput = {
      ...baseModelOutput,
      offers: Array.from({ length: 8 }, (_, i) => ({
        taxonomyItemId: null,
        label: i < 3 ? "Repetido" : `Item ${i}`,
        confidence: 0.5,
        rationale: "",
      })),
      needs: [],
    };
    const r = normalizeAgainstCatalog(many, { segmentId: "tecnologia", catalog });
    expect(r.offers.length).toBeLessThanOrEqual(5);
    expect(r.offers.filter((o) => o.label === "Repetido").length).toBe(1);
  });

  it("resultado final passa pelo schema público", () => {
    const r = normalizeAgainstCatalog(baseModelOutput, { segmentId: "tecnologia", catalog });
    const full = aiSuggestionResultSchema.safeParse({
      ...r,
      source: "ai",
      promptVersion: "a1a2-v1",
    });
    expect(full.success).toBe(true);
  });
});

describe("buildAiRunInput", () => {
  it("não vaza summary/PII no payload de log", () => {
    const payload = buildAiRunInput(
      { eventId: "e", segmentId: "s", summary: "meu telefone é 11999999999 e email a@b.com" },
      "kabc",
    );
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toMatch(/9999/);
    expect(serialized).not.toMatch(/a@b\.com/);
    expect(payload).toMatchObject({ hash: "kabc", segmentId: "s", summaryLen: expect.any(Number) });
  });
});

describe("hashCacheKey", () => {
  it("mesmas partes -> mesma chave; partes diferentes -> chaves diferentes (SHA-256)", async () => {
    const a = await hashCacheKey(["a", "b"]);
    const a2 = await hashCacheKey(["a", "b"]);
    const b = await hashCacheKey(["a", "c"]);
    expect(a).toBe(a2);
    expect(a).not.toBe(b);
    expect(a).toMatch(/^k[0-9a-f]{32}$/);
  });
});
