/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { mergeCapped } from "@/features/onboarding/mergeItems";
import type { AiSuggestionResult } from "@/lib/onboarding-ai-schema";

// Stub do server function ANTES de importar o hook.
const suggestMock = vi.fn();
vi.mock("@/lib/onboarding-ai.functions", () => ({
  suggestOnboardingItems: (...args: unknown[]) => suggestMock(...args),
}));
vi.mock("@tanstack/react-start", () => ({
  useServerFn: <T>(fn: T) => fn,
}));

// Import DEPOIS dos mocks.
import { useSharedAiAnalysis } from "@/features/onboarding/aiAnalysisState";

const KEY = { focus: "offers" as const, eventId: "e1", segmentId: "tec", summary: "Resumo profissional válido" };

function fakeResult(): AiSuggestionResult {
  return {
    understanding: { summary: "x", mainActivity: "x", keywords: [], clarifyingQuestion: null },
    offers: [
      { taxonomyItemId: null, segmentId: null, label: "A", kind: "offer", confidence: 0.9 },
      { taxonomyItemId: null, segmentId: null, label: "B", kind: "offer", confidence: 0.9 },
    ],
    needs: [],
    source: "ai",
    promptVersion: "a1a2-v2",
  };
}

beforeEach(() => {
  suggestMock.mockReset();
});

describe("mergeCapped — atômico e sem perda", () => {
  it("1 existente + 4 sugestões → 5 itens distintos", () => {
    const existing = [{ label: "Consultoria" }];
    const additions = [
      { label: "Contabilidade" },
      { label: "Auditoria" },
      { label: "Compliance" },
      { label: "BPO" },
    ];
    const out = mergeCapped(existing, additions, 5);
    expect(out).toHaveLength(5);
    expect(out.map((x) => x.label)).toEqual([
      "Consultoria",
      "Contabilidade",
      "Auditoria",
      "Compliance",
      "BPO",
    ]);
  });

  it("deduplica case-insensitive contra existing e entre additions", () => {
    const existing = [{ label: "Consultoria" }];
    const additions = [
      { label: "CONSULTORIA" }, // duplicata do existente
      { label: "Auditoria" },
      { label: " auditoria " }, // duplicata dentro do lote
      { label: "BPO" },
    ];
    const out = mergeCapped(existing, additions, 5);
    expect(out.map((x) => x.label)).toEqual(["Consultoria", "Auditoria", "BPO"]);
  });

  it("respeita cap total e preserva ordem das sugestões", () => {
    const existing = [{ label: "X" }, { label: "Y" }, { label: "Z" }];
    const additions = [{ label: "A" }, { label: "B" }, { label: "C" }, { label: "D" }];
    const out = mergeCapped(existing, additions, 5);
    expect(out.map((x) => x.label)).toEqual(["X", "Y", "Z", "A", "B"]);
  });
});

describe("useSharedAiAnalysis — memória por chave sem nova chamada", () => {
  it("IMPL 22: reanalisar a MESMA chave não gasta nova chamada e preserva o resultado", async () => {
    suggestMock.mockResolvedValue(fakeResult());
    const { result } = renderHook(() => useSharedAiAnalysis());

    await act(async () => {
      await result.current.analyze(KEY, []);
    });
    expect(suggestMock).toHaveBeenCalledTimes(1);
    expect(result.current.status.s).toBe("done");
    expect(result.current.resultFor(KEY)?.offers).toHaveLength(2);

    // Voltar para a etapa (mesma chave) → zero chamada nova.
    await act(async () => {
      await result.current.analyze(KEY, []);
    });
    expect(suggestMock).toHaveBeenCalledTimes(1);
    expect(result.current.callCount()).toBe(1);
    expect(result.current.statusFor(KEY).s).toBe("done");
  });

  it("mudar summary invalida resultado: match deixa de acontecer até novo analyze", async () => {
    suggestMock.mockResolvedValue(fakeResult());
    const { result } = renderHook(() => useSharedAiAnalysis());

    await act(async () => {
      await result.current.analyze(KEY, []);
    });
    expect(result.current.status.s).toBe("done");
    if (result.current.status.s === "done") {
      expect(result.current.status.keyId).toContain("Resumo profissional válido");
    }

    // Uma chave diferente (novo summary) NÃO deve reutilizar.
    const newKey = { ...KEY, summary: "Outro resumo totalmente diferente" };
    await act(async () => {
      await result.current.analyze(newKey, []);
    });
    // Nova chave → nova chamada.
    expect(suggestMock).toHaveBeenCalledTimes(2);
  });
});
