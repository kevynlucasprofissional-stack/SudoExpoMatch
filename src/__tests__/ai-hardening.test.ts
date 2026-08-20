import { describe, expect, it } from "vitest";
import { classifyGatewayError, hashCacheKey } from "@/lib/onboarding-ai-schema";
import { mapWizardToSaveProfileInput } from "@/features/onboarding/mappers";
import { createEmptyDraft } from "@/features/onboarding/draft";

describe("classifyGatewayError", () => {
  it("400/401/403/422 são terminais e NÃO retentam", () => {
    expect(classifyGatewayError(new Error("HTTP 400 bad request"))).toBe("terminal_4xx");
    expect(classifyGatewayError(new Error("Unauthorized 401"))).toBe("terminal_4xx");
    expect(classifyGatewayError(new Error("Forbidden 403"))).toBe("terminal_4xx");
    expect(classifyGatewayError(new Error("Unprocessable entity 422"))).toBe("terminal_4xx");
  });

  it("429/5xx/timeout/network são transitórios e permitem 1 retry", () => {
    expect(classifyGatewayError(new Error("HTTP 429 too many requests"))).toBe("transient");
    expect(classifyGatewayError(new Error("HTTP 500 upstream"))).toBe("transient");
    expect(classifyGatewayError(new Error("HTTP 503 unavailable"))).toBe("transient");
    expect(classifyGatewayError(new Error("timeout"))).toBe("transient");
    expect(classifyGatewayError(new Error("Failed to fetch"))).toBe("transient");
    expect(classifyGatewayError(new Error("network unreachable"))).toBe("transient");
  });

  it("erros desconhecidos NÃO são retentados (economiza créditos)", () => {
    expect(classifyGatewayError(new Error("weird schema mismatch"))).toBe("unknown");
    expect(classifyGatewayError(null)).toBe("unknown");
  });
});

describe("hashCacheKey (SHA-256)", () => {
  it("é determinístico e sensível a alterações", async () => {
    const k1 = await hashCacheKey(["evt", "seg", "resumo longo"]);
    const k2 = await hashCacheKey(["evt", "seg", "resumo longo"]);
    const k3 = await hashCacheKey(["evt", "seg", "resumo longo!"]);
    expect(k1).toBe(k2);
    expect(k1).not.toBe(k3);
    expect(k1).toMatch(/^k[0-9a-f]{32}$/);
  });
});

describe("proveniência (source)", () => {
  function baseDraft() {
    return {
      ...createEmptyDraft(),
      name: "Fulano",
      company: "Empresa",
      city: "Ribeirão Preto",
      neighborhood: "Centro",
      segmentId: "servicos",
      summary: "Consultoria B2B",
      consent: true,
      offers: [
        {
          localId: "1",
          label: "Consultoria",
          segmentId: "servicos",
          taxonomyItemId: null,
          source: "ai" as const,
        },
        { localId: "2", label: "Treinamento", segmentId: "servicos", taxonomyItemId: null },
      ],
      needs: [
        {
          localId: "3",
          label: "Compradores",
          segmentId: "servicos",
          taxonomyItemId: null,
          needKind: "compradores" as const,
          isPriority: true,
          source: "heuristic" as const,
        },
      ],
    };
  }

  it("propaga `source` do wizard para o payload da RPC (default 'user')", () => {
    const out = mapWizardToSaveProfileInput(baseDraft(), "sudoexpo-2026");
    expect(out.offers[0].source).toBe("ai");
    expect(out.offers[1].source).toBe("user"); // default
    expect(out.needs[0].source).toBe("heuristic");
  });
});
