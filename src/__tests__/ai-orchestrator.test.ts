import { describe, expect, it, vi } from "vitest";
import {
  runOnboardingAi,
  buildPrompt,
  type OrchestratorDeps,
} from "@/lib/onboarding-ai-orchestrator";
import type { AiSuggestionResult } from "@/lib/onboarding-ai-schema";
import { AI_MODEL } from "@/lib/onboarding-ai-schema";
import type { EventCatalog } from "@/features/participant/types";

const catalog: EventCatalog = {
  segments: [
    { id: "tec", label: "Tecnologia", emoji: null },
    { id: "srv", label: "Serviços", emoji: null },
  ],
  taxonomy: [
    { id: "t-1", segment_id: "tec", label: "Software de gestão", kind: "offer", synonyms: [] },
    { id: "t-2", segment_id: "tec", label: "Suporte técnico", kind: "both", synonyms: [] },
    { id: "t-3", segment_id: "srv", label: "Contador", kind: "offer", synonyms: [] },
  ],
};

const goodModelOutput = {
  understanding: { summary: "SaaS B2B", mainActivity: "Software", keywords: ["saas"], clarifyingQuestion: null },
  offers: [
    { taxonomyItemId: "t-1", label: "Software de gestão", confidence: 0.9, rationale: "match" },
    { taxonomyItemId: null, label: "Consultoria", confidence: 0.7, rationale: "extra" },
  ],
  needs: [
    { taxonomyItemId: "t-2", label: "Suporte técnico", confidence: 0.6, rationale: "" },
  ],
};

const fallbackResult: AiSuggestionResult = {
  understanding: { summary: "", mainActivity: "", keywords: [], clarifyingQuestion: null },
  offers: [{ taxonomyItemId: null, label: "Fallback", kind: "offer", confidence: 0.4 }],
  needs: [],
  source: "heuristic",
  promptVersion: "a1a2-v2",
};

function makeDeps(over: Partial<OrchestratorDeps> = {}): OrchestratorDeps {
  const base: OrchestratorDeps = {
    callGateway: vi.fn(async () => ({ output: goodModelOutput, tokensInput: 10, tokensOutput: 20 })),
    readCache: vi.fn(async () => null),
    writeCache: vi.fn(async () => {}),
    consumeRateLimit: vi.fn(async () => true),
    logRun: vi.fn(async () => {}),
    fallback: vi.fn(async () => fallbackResult),
    sleep: vi.fn(async () => {}),
    now: () => 0,
  };
  return { ...base, ...over };
}

const input = { eventId: "e1", segmentId: "tec", summary: "SaaS B2B para PMEs" };
const actorUserId = "user-1";

describe("runOnboardingAi — sucesso em 1 tentativa", () => {
  it("chama Gateway exatamente 1x e persiste no cache", async () => {
    const deps = makeDeps();
    const out = await runOnboardingAi({ input, catalog, actorUserId, deps });
    expect(out.source).toBe("ai");
    expect(deps.callGateway).toHaveBeenCalledTimes(1);
    expect(deps.writeCache).toHaveBeenCalledTimes(1);
    expect(deps.fallback).not.toHaveBeenCalled();
  });
});

describe("runOnboardingAi — retry apenas em transitórios (429/5xx/timeout)", () => {
  for (const [name, err] of [
    ["timeout", new Error("timeout")],
    ["429", new Error("HTTP 429 too many requests")],
    ["500", new Error("HTTP 500 upstream")],
  ] as const) {
    it(`${name}: 2 chamadas totais (1 retry) e depois fallback`, async () => {
      const call = vi.fn().mockRejectedValueOnce(err).mockRejectedValueOnce(err);
      const deps = makeDeps({ callGateway: call });
      const out = await runOnboardingAi({ input, catalog, actorUserId, deps });
      expect(call).toHaveBeenCalledTimes(2);
      expect(deps.sleep).toHaveBeenCalledTimes(1);
      expect(out.source).toBe("heuristic");
      expect(deps.fallback).toHaveBeenCalledTimes(1);
    });
  }

  it("transitório na 1ª e sucesso na 2ª: retorna resultado AI", async () => {
    const call = vi
      .fn()
      .mockRejectedValueOnce(new Error("HTTP 502 bad gateway"))
      .mockResolvedValueOnce({ output: goodModelOutput });
    const deps = makeDeps({ callGateway: call });
    const out = await runOnboardingAi({ input, catalog, actorUserId, deps });
    expect(call).toHaveBeenCalledTimes(2);
    expect(out.source).toBe("ai");
  });
});

describe("runOnboardingAi — terminais 4xx e schema inválido: 1 chamada + fallback", () => {
  for (const code of [400, 401, 402, 403, 404, 422]) {
    it(`HTTP ${code} → fallback imediato, sem retry`, async () => {
      const call = vi.fn().mockRejectedValue(new Error(`HTTP ${code} boom`));
      const deps = makeDeps({ callGateway: call });
      const out = await runOnboardingAi({ input, catalog, actorUserId, deps });
      expect(call).toHaveBeenCalledTimes(1);
      expect(deps.sleep).not.toHaveBeenCalled();
      expect(out.source).toBe("heuristic");
    });
  }

  it("schema inválido → 1 chamada + fallback sem retry", async () => {
    const call = vi.fn().mockResolvedValue({ output: { garbage: true } });
    const deps = makeDeps({ callGateway: call });
    const out = await runOnboardingAi({ input, catalog, actorUserId, deps });
    expect(call).toHaveBeenCalledTimes(1);
    expect(out.source).toBe("heuristic");
    expect(deps.writeCache).not.toHaveBeenCalled();
  });
});

describe("runOnboardingAi — cache hit e rate limit", () => {
  it("cache hit: 0 chamadas ao Gateway", async () => {
    const cached: AiSuggestionResult = {
      understanding: { summary: "x", mainActivity: "x", keywords: [], clarifyingQuestion: null },
      offers: [{ taxonomyItemId: null, label: "Cached", kind: "offer", confidence: 0.9 }],
      needs: [],
      source: "ai",
      promptVersion: "a1a2-v2",
    };
    const deps = makeDeps({ readCache: vi.fn(async () => cached) });
    const out = await runOnboardingAi({ input, catalog, actorUserId, deps });
    expect(out).toEqual(cached);
    expect(deps.callGateway).not.toHaveBeenCalled();
    expect(deps.consumeRateLimit).not.toHaveBeenCalled();
  });

  it("rate limit negado: 0 chamadas ao Gateway, retorna fallback", async () => {
    const deps = makeDeps({ consumeRateLimit: vi.fn(async () => false) });
    const out = await runOnboardingAi({ input, catalog, actorUserId, deps });
    expect(deps.callGateway).not.toHaveBeenCalled();
    expect(deps.fallback).toHaveBeenCalledTimes(1);
    expect(out.source).toBe("heuristic");
  });
});

describe("runOnboardingAi — normalização", () => {
  it("converte id inexistente, segmento errado e kind errado para null", async () => {
    const modelOutput = {
      understanding: { summary: "", mainActivity: "", keywords: [], clarifyingQuestion: null },
      offers: [
        { taxonomyItemId: "does-not-exist", label: "Fake", confidence: 0.5, rationale: "" },
        { taxonomyItemId: "t-3", label: "Wrong segment", confidence: 0.5, rationale: "" },
        { taxonomyItemId: "t-1", label: "Ok", confidence: 0.9, rationale: "" },
      ],
      needs: [
        { taxonomyItemId: "t-1", label: "Kind mismatch", confidence: 0.5, rationale: "" },
      ],
    };
    const deps = makeDeps({ callGateway: vi.fn(async () => ({ output: modelOutput })) });
    const out = await runOnboardingAi({ input, catalog, actorUserId, deps });
    expect(out.source).toBe("ai");
    expect(out.offers.find((o) => o.label === "Fake")?.taxonomyItemId).toBeNull();
    expect(out.offers.find((o) => o.label === "Wrong segment")?.taxonomyItemId).toBeNull();
    expect(out.offers.find((o) => o.label === "Ok")?.taxonomyItemId).toBe("t-1");
    expect(out.needs.find((n) => n.label === "Kind mismatch")?.taxonomyItemId).toBeNull();
  });
});

describe("runOnboardingAi — segurança do prompt (sem PII)", () => {
  it("prompt enviado ao Gateway não contém nome, telefone, email, WhatsApp, código", async () => {
    const call = vi.fn(async () => ({ output: goodModelOutput }));
    const deps = makeDeps({ callGateway: call });
    const summary =
      "Somos uma software house B2B focada em ERPs para pequenas indústrias em Ribeirão Preto.";
    await runOnboardingAi({
      input: { eventId: "e1", segmentId: "tec", summary },
      catalog,
      actorUserId,
      deps,
    });
    const promptSent = String(call.mock.calls[0]?.[0]?.prompt ?? "");
    expect(promptSent).toContain(summary);
    // Nada de PII "vazando" via prompt (o input schema já bloqueia esses campos,
    // mas garantimos a defesa em profundidade no builder do prompt).
    expect(promptSent).not.toMatch(/\bJoão\b|\bMaria\b|\bFulano\b/i);
    expect(promptSent).not.toMatch(/\+?55[\s-]?\d{2}[\s-]?9?\d{4,5}[\s-]?\d{4}/);
    expect(promptSent).not.toMatch(/whatsapp/i);
    expect(promptSent).not.toMatch(/@\S+\.\S+/);
    expect(promptSent).not.toMatch(/recovery|codigo|código de recuperação/i);
  });

  it("buildPrompt direto: só inclui summary + catálogo do segmento", () => {
    const p = buildPrompt(
      { eventId: "e1", segmentId: "tec", summary: "SaaS puro" },
      catalog,
    );
    expect(p).toContain("SaaS puro");
    expect(p).toContain("t-1");
    // Não deve trazer o item do segmento "srv".
    expect(p).not.toContain("Contador");
  });
});

describe("runOnboardingAi — proveniência em log", () => {
  it("logRun recebe source real do resultado (ai)", async () => {
    const deps = makeDeps();
    await runOnboardingAi({ input, catalog, actorUserId, deps });
    const row = (deps.logRun as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(row.succeeded).toBe(true);
    expect(row.fallbackUsed).toBe(false);
    expect(row.model).toBe(AI_MODEL);
  });

  it("logRun com fallback marca fallbackUsed=true e source heuristic no resultado", async () => {
    const call = vi.fn().mockRejectedValue(new Error("HTTP 400 bad"));
    const deps = makeDeps({ callGateway: call });
    const out = await runOnboardingAi({ input, catalog, actorUserId, deps });
    const row = (deps.logRun as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(out.source).toBe("heuristic");
    expect(row.fallbackUsed).toBe(true);
    expect(row.succeeded).toBe(false);
  });
});
