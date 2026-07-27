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

export function serializeAnalysisKey(k: AnalysisKey): string {
  return `${k.eventId}\u0001${k.segmentId}\u0001${k.summary.trim()}`;
}

export type AnalysisStatus =
  | { s: "idle" }
  | { s: "loading"; keyId: string }
  | { s: "done"; result: AiSuggestionResult; keyId: string }
  | { s: "dismissed"; result: AiSuggestionResult; keyId: string }
  | { s: "error"; keyId: string };

export interface SharedAiAnalysis {
  status: AnalysisStatus;
  /** Dispara análise. Reutiliza resultado se a chave não mudou. */
  analyze: (key: AnalysisKey, existingLabels: string[]) => Promise<void>;
  /** Fecha painel para a chave atual, PRESERVANDO o resultado em memória. */
  dismiss: () => void;
  /** Reabre o painel: restaura `done` com o mesmo resultado, sem nova chamada. */
  reopen: () => void;
  /** Debug/tests: contagem de chamadas ao server function. */
  callCount: () => number;
}

/**
 * Estado compartilhado da IA de onboarding — vive no WizardPage, é passado
 * para StepOffers e StepNeeds. Garante que só há uma chamada por
 * (evento + segmento + resumo). Se o resumo/segmento mudar, o resultado
 * fica órfão (não é exibido) até o usuário clicar em "Analisar" de novo.
 */
export function useSharedAiAnalysis(): SharedAiAnalysis {
  const suggest = useServerFn(suggestOnboardingItems);
  const [status, setStatus] = useState<AnalysisStatus>({ s: "idle" });
  const inFlight = useRef<string | null>(null);
  const callCountRef = useRef(0);

  const analyze = useCallback(
    async (key: AnalysisKey, existingLabels: string[]) => {
      const keyId = serializeAnalysisKey(key);
      // Reutiliza resultado válido para a mesma chave — sem chamada.
      const cur = status;
      if ((cur.s === "done" || cur.s === "dismissed") && cur.keyId === keyId) {
        if (cur.s === "dismissed") {
          setStatus({ s: "done", result: cur.result, keyId });
        }
        return;
      }
      if (inFlight.current === keyId) return;
      inFlight.current = keyId;
      setStatus({ s: "loading", keyId });
      callCountRef.current += 1;
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
        setStatus({ s: "error", keyId });
      } finally {
        inFlight.current = null;
      }
    },
    [status, suggest],
  );

  const dismiss = useCallback(() => {
    setStatus((prev) =>
      prev.s === "done"
        ? { s: "dismissed", result: prev.result, keyId: prev.keyId }
        : prev,
    );
  }, []);

  const reopen = useCallback(() => {
    setStatus((prev) =>
      prev.s === "dismissed"
        ? { s: "done", result: prev.result, keyId: prev.keyId }
        : prev,
    );
  }, []);

  return {
    status,
    analyze,
    dismiss,
    reopen,
    callCount: () => callCountRef.current,
  };
}
