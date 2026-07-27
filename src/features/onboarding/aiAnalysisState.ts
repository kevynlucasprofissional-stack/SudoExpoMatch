import { useCallback, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { suggestOnboardingItems } from "@/lib/onboarding-ai.functions";
import type { AiSuggestionResult } from "@/lib/onboarding-ai-schema";

/**
 * Chave da entrada analisada — se mudar, o resultado atual é invalidado.
 * `existingLabels` NÃO entra na chave para permitir reuso entre Ofertas e
 * Necessidades (labels adicionadas em uma etapa não devem reanalisar).
 */
export interface AnalysisKey {
  eventId: string;
  segmentId: string;
  summary: string;
}

function serializeKey(k: AnalysisKey): string {
  return `${k.eventId}\u0001${k.segmentId}\u0001${k.summary.trim()}`;
}

export type AnalysisStatus =
  | { s: "idle" }
  | { s: "loading" }
  | { s: "done"; result: AiSuggestionResult; keyId: string }
  | { s: "dismissed"; keyId: string }
  | { s: "error" };

export interface SharedAiAnalysis {
  status: AnalysisStatus;
  currentKey: AnalysisKey | null;
  /** Dispara análise. Reutiliza resultado se a chave não mudou. */
  analyze: (key: AnalysisKey, existingLabels: string[]) => Promise<void>;
  /** Fecha painel para a chave atual (não reanalisa até ação explícita). */
  dismiss: () => void;
  /** Reabre o painel se estava fechado. */
  reopen: () => void;
}

/**
 * Estado compartilhado da IA de onboarding — vive no WizardPage, é passado
 * para StepOffers e StepNeeds. Garante que só há uma chamada por
 * (evento + segmento + resumo). Se o resumo/segmento mudar, invalida o
 * resultado local sem chamar o Gateway até o usuário clicar em "Analisar".
 */
export function useSharedAiAnalysis(): SharedAiAnalysis {
  const suggest = useServerFn(suggestOnboardingItems);
  const [status, setStatus] = useState<AnalysisStatus>({ s: "idle" });
  const [currentKey, setCurrentKey] = useState<AnalysisKey | null>(null);
  const inFlight = useRef<string | null>(null);

  const analyze = useCallback(
    async (key: AnalysisKey, existingLabels: string[]) => {
      const keyId = serializeKey(key);
      // Reutiliza resultado válido para a mesma chave.
      if (status.s === "done" && status.keyId === keyId) return;
      if (inFlight.current === keyId) return;
      inFlight.current = keyId;
      setCurrentKey(key);
      setStatus({ s: "loading" });
      try {
        const result = await suggest({
          data: {
            eventId: key.eventId,
            segmentId: key.segmentId,
            summary: key.summary,
            existingLabels,
          },
        });
        setStatus({ s: "done", result, keyId });
      } catch {
        setStatus({ s: "error" });
      } finally {
        inFlight.current = null;
      }
    },
    [status, suggest],
  );

  const dismiss = useCallback(() => {
    setStatus((prev) => {
      if (prev.s === "done") return { s: "dismissed", keyId: prev.keyId };
      return { s: "idle" };
    });
  }, []);

  const reopen = useCallback(() => {
    setStatus((prev) => (prev.s === "dismissed" ? { s: "idle" } : prev));
  }, []);

  return { status, currentKey, analyze, dismiss, reopen };
}

/**
 * Retorna resultado válido para a chave, ou null se a chave mudou/foi limpa.
 * Compara chave atual vs a que produziu o resultado.
 */
export function pickResultForKey(
  analysis: SharedAiAnalysis,
  key: AnalysisKey,
): { result: AiSuggestionResult; dismissed: boolean } | null {
  const keyId = serializeKey(key);
  if (analysis.status.s === "done" && analysis.status.keyId === keyId) {
    return { result: analysis.status.result, dismissed: false };
  }
  if (analysis.status.s === "dismissed" && analysis.status.keyId === keyId) {
    // Ainda temos o resultado se o hook decidir persistir; caso contrário nulo.
    return null;
  }
  return null;
}
