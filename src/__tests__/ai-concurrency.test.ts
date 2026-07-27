/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { AiSuggestionResult } from "@/lib/onboarding-ai-schema";

const suggestMock = vi.fn();
vi.mock("@/lib/onboarding-ai.functions", () => ({
  suggestOnboardingItems: (...args: unknown[]) => suggestMock(...args),
}));
vi.mock("@tanstack/react-start", () => ({
  useServerFn: <T,>(fn: T) => fn,
}));

import { useSharedAiAnalysis } from "@/features/onboarding/aiAnalysisState";

function defer<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function mkResult(label: string): AiSuggestionResult {
  return {
    understanding: { summary: label, mainActivity: "", keywords: [], clarifyingQuestion: null },
    offers: [{ taxonomyItemId: null, label, kind: "offer", confidence: 0.9 }],
    needs: [],
    source: "ai",
    promptVersion: "a1a2-v2",
  };
}

const KEY_A = { eventId: "e1", segmentId: "tec", summary: "Resumo A" };
const KEY_B = { eventId: "e1", segmentId: "tec", summary: "Resumo B totalmente diferente" };

beforeEach(() => suggestMock.mockReset());

describe("useSharedAiAnalysis — concorrência com generation token", () => {
  it("A começa, input muda para B, B resolve antes de A; A ao resolver NÃO sobrescreve", async () => {
    const dA = defer<AiSuggestionResult>();
    const dB = defer<AiSuggestionResult>();
    suggestMock.mockImplementationOnce(() => dA.promise).mockImplementationOnce(() => dB.promise);

    const { result } = renderHook(() => useSharedAiAnalysis());

    // Dispara A (não await)
    let aPromise!: Promise<void>;
    act(() => {
      aPromise = result.current.analyze(KEY_A, []);
    });
    expect(result.current.status.s).toBe("loading");

    // Input muda: dispara B (mais recente)
    let bPromise!: Promise<void>;
    act(() => {
      bPromise = result.current.analyze(KEY_B, []);
    });

    // B resolve primeiro
    await act(async () => {
      dB.resolve(mkResult("B"));
      await bPromise;
    });
    expect(result.current.status.s).toBe("done");
    if (result.current.status.s === "done") {
      expect(result.current.status.result.offers[0].label).toBe("B");
    }

    // A resolve depois — NÃO pode sobrescrever B
    await act(async () => {
      dA.resolve(mkResult("A"));
      await aPromise;
    });
    expect(result.current.status.s).toBe("done");
    if (result.current.status.s === "done") {
      expect(result.current.status.result.offers[0].label).toBe("B");
      expect(result.current.status.keyId).toContain("Resumo B");
    }
    expect(suggestMock).toHaveBeenCalledTimes(2);
  });

  it("chamadas concorrentes com a MESMA chave invocam o servidor apenas 1x", async () => {
    const d = defer<AiSuggestionResult>();
    suggestMock.mockImplementation(() => d.promise);
    const { result } = renderHook(() => useSharedAiAnalysis());

    let p1!: Promise<void>;
    let p2!: Promise<void>;
    act(() => {
      p1 = result.current.analyze(KEY_A, []);
      p2 = result.current.analyze(KEY_A, []);
    });
    expect(suggestMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      d.resolve(mkResult("A"));
      await Promise.all([p1, p2]);
    });
    expect(result.current.callCount()).toBe(1);
    expect(result.current.status.s).toBe("done");
  });

  it("falha antiga NÃO substitui sucesso mais novo", async () => {
    const dA = defer<AiSuggestionResult>();
    const dB = defer<AiSuggestionResult>();
    suggestMock.mockImplementationOnce(() => dA.promise).mockImplementationOnce(() => dB.promise);

    const { result } = renderHook(() => useSharedAiAnalysis());

    let aPromise!: Promise<void>;
    act(() => {
      aPromise = result.current.analyze(KEY_A, []);
    });
    let bPromise!: Promise<void>;
    act(() => {
      bPromise = result.current.analyze(KEY_B, []);
    });

    // B sucesso primeiro
    await act(async () => {
      dB.resolve(mkResult("B"));
      await bPromise;
    });
    expect(result.current.status.s).toBe("done");

    // A falha depois — NÃO pode virar "error" nem apagar B
    await act(async () => {
      dA.reject(new Error("boom"));
      await aPromise.catch(() => {});
    });
    expect(result.current.status.s).toBe("done");
    if (result.current.status.s === "done") {
      expect(result.current.status.result.offers[0].label).toBe("B");
    }
  });
});
