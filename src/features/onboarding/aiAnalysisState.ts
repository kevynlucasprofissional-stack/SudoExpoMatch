import { useCallback, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { suggestOnboardingItems } from "@/lib/onboarding-ai.functions";
import type { AiSuggestionResult } from "@/lib/onboarding-ai-schema";
import { socialContextFingerprint, type SocialBusinessContext } from "@/lib/social-context";
import type { SocialBusinessAnalysis } from "@/lib/social-analysis";
import type { BusinessSize, BusinessType } from "./types";

/**
 * Oferta CONFIRMADA pelo participante na Etapa 3 — estrutura enxuta enviada
 * ao servidor como contexto da análise de necessidades (sem `localId`).
 */
export interface ConfirmedOffer {
  taxonomyItemId: string | null;
  label: string;
  segmentId: string | null;
}

/** Normalização determinística: trim, dedup por identidade e ordenação. */
export function normalizeConfirmedOffers(
  offers: Array<{ label: string; taxonomyItemId: string | null; segmentId?: string | null }>,
): ConfirmedOffer[] {
  const seen = new Set<string>();
  const out: ConfirmedOffer[] = [];
  for (const o of offers) {
    const label = (o.label ?? "").trim();
    if (!label) continue;
    const id = o.taxonomyItemId ?? null;
    const identity = id ?? label.toLowerCase();
    if (seen.has(identity)) continue;
    seen.add(identity);
    out.push({ taxonomyItemId: id, label, segmentId: o.segmentId?.trim() || null });
  }
  return out.sort((a, b) =>
    (a.taxonomyItemId ?? a.label.toLowerCase()).localeCompare(
      b.taxonomyItemId ?? b.label.toLowerCase(),
    ),
  );
}

/**
 * Chave da entrada analisada — se mudar, o resultado atual é invalidado.
 *
 * `focus` distingue a intenção da análise: a Etapa 3 pede OFERTAS a partir de
 * quem a empresa é; a Etapa 4 pede NECESSIDADES considerando também o que ela
 * efetivamente confirmou oferecer. Por isso `confirmedOffers` participa da
 * chave apenas quando `focus === "needs"` — trocar uma oferta exige nova
 * análise; não mexer nas ofertas reaproveita a análise anterior.
 *
 * `existingLabels` continua FORA da chave: serve para evitar repetição no
 * prompt, não como identidade semântica (senão cada item adicionado gastaria
 * uma nova chamada).
 */
export interface AnalysisKey {
  focus: "offers" | "needs";
  eventId: string;
  segmentId: string;
  summary: string;
  businessSize?: BusinessSize | "";
  businessType?: BusinessType | "";
  niche?: string;
  socialContext?: SocialBusinessContext | null;
  socialAnalysis?: SocialBusinessAnalysis | null;
  /** Somente relevante para `focus: "needs"`. */
  confirmedOffers?: ConfirmedOffer[];
}

export function serializeAnalysisKey(k: AnalysisKey): string {
  const offers =
    k.focus === "needs"
      ? normalizeConfirmedOffers(k.confirmedOffers ?? [])
          .map((o) => `${o.taxonomyItemId ?? ""}~${o.label.toLowerCase()}`)
          .join(",")
      : "";
  return [
    k.focus,
    k.eventId,
    k.segmentId,
    k.summary.trim(),
    k.businessSize ?? "",
    k.businessType ?? "",
    (k.niche ?? "").trim().toLowerCase(),
    socialContextFingerprint(k.socialContext ?? null),
    k.socialAnalysis ? JSON.stringify(k.socialAnalysis) : "",
    offers,
  ].join("\u0001");
}

export type AnalysisStatus =
  | { s: "idle" }
  | { s: "loading"; keyId: string }
  | { s: "done"; result: AiSuggestionResult; keyId: string }
  | { s: "error"; keyId: string };

export interface SharedAiAnalysis {
  /** Status da chamada mais recente (debug/telemetria). */
  status: AnalysisStatus;
  /** Status específico de uma chave — é o que cada etapa deve consultar. */
  statusFor: (key: AnalysisKey) => AnalysisStatus;
  /** Resultado memorizado para a chave, se houver (sem nova chamada). */
  resultFor: (key: AnalysisKey) => AiSuggestionResult | null;
  /** Dispara análise. Reutiliza resultado memorizado se a chave não mudou. */
  analyze: (key: AnalysisKey, existingLabels: string[]) => Promise<void>;
  /** Zera completamente o estado temporário da IA (reset do formulário). */
  reset: () => void;
  /** Debug/tests: contagem de chamadas ao server function. */
  callCount: () => number;
}

/**
 * Estado compartilhado da IA de onboarding — vive no WizardPage e é passado
 * para StepOffers e StepNeeds.
 *
 * Memória por chave: cada `keyId` guarda seu próprio resultado. Voltar da
 * Etapa 4 para a Etapa 3 (ou vice-versa) reaproveita o resultado memorizado
 * — ZERO chamada nova enquanto o contexto semântico não mudar.
 *
 * Concorrência: cada `analyze` recebe um `gen` incremental; apenas a mais
 * recente pode atualizar `status`. Resultados são escritos sempre na própria
 * chave, então uma resposta atrasada nunca contamina a etapa atual.
 *
 * Dedup: chamadas concorrentes com a MESMA `keyId` reusam a mesma promise.
 */
export function useSharedAiAnalysis(): SharedAiAnalysis {
  const suggest = useServerFn(suggestOnboardingItems);
  const [status, setStatus] = useState<AnalysisStatus>({ s: "idle" });
  const [results, setResults] = useState<Record<string, AiSuggestionResult>>({});
  const [errors, setErrors] = useState<Record<string, true>>({});
  const inFlight = useRef<Map<string, Promise<void>>>(new Map());
  const activeGen = useRef(0);
  const callCountRef = useRef(0);
  const resultsRef = useRef(results);
  resultsRef.current = results;

  const analyze = useCallback(
    async (key: AnalysisKey, existingLabels: string[]) => {
      const keyId = serializeAnalysisKey(key);
      // Resultado já memorizado para esta chave — nenhuma chamada.
      if (resultsRef.current[keyId]) return;
      // Dedup por chave — chamadas concorrentes esperam a mesma promise.
      const pending = inFlight.current.get(keyId);
      if (pending) return pending;

      const gen = ++activeGen.current;
      setStatus({ s: "loading", keyId });
      callCountRef.current += 1;

      const confirmedOffers =
        key.focus === "needs" ? normalizeConfirmedOffers(key.confirmedOffers ?? []) : [];

      // eslint-disable-next-line prefer-const -- atribuído após a definição de `run`, que a referencia
      let self: Promise<void>;
      const run = async () => {
        try {
          const result = await suggest({
            data: {
              focus: key.focus,
              eventId: key.eventId,
              segmentId: key.segmentId,
              summary: key.summary,
              existingLabels,
              ...(confirmedOffers.length > 0 ? { confirmedOffers } : {}),
              ...(key.businessSize ? { businessSize: key.businessSize } : {}),
              ...(key.businessType ? { businessType: key.businessType } : {}),
              ...(key.niche?.trim() ? { niche: key.niche.trim() } : {}),
              ...(key.socialContext ? { socialContext: key.socialContext } : {}),
              ...(key.socialAnalysis ? { socialAnalysis: key.socialAnalysis } : {}),
            },
          });

          // O resultado é sempre gravado na PRÓPRIA chave: uma resposta
          // atrasada nunca vaza para a etapa/contexto atual.
          setResults((prev) => ({ ...prev, [keyId]: result }));
          if (gen === activeGen.current) setStatus({ s: "done", result, keyId });
        } catch {
          setErrors((prev) => ({ ...prev, [keyId]: true }));
          if (gen === activeGen.current) setStatus({ s: "error", keyId });
        } finally {
          if (inFlight.current.get(keyId) === self) {
            inFlight.current.delete(keyId);
          }
        }
      };
      self = run();
      inFlight.current.set(keyId, self);
      return self;
    },
    [suggest],
  );

  const statusFor = useCallback(
    (key: AnalysisKey): AnalysisStatus => {
      const keyId = serializeAnalysisKey(key);
      const result = results[keyId];
      if (result) return { s: "done", result, keyId };
      if (inFlight.current.has(keyId)) return { s: "loading", keyId };
      if (errors[keyId]) return { s: "error", keyId };
      return { s: "idle" };
    },
    [results, errors],
  );

  const resultFor = useCallback(
    (key: AnalysisKey) => results[serializeAnalysisKey(key)] ?? null,
    [results],
  );

  const reset = useCallback(() => {
    activeGen.current += 1;
    inFlight.current.clear();
    setResults({});
    setErrors({});
    setStatus({ s: "idle" });
  }, []);

  return {
    status,
    statusFor,
    resultFor,
    analyze,
    reset,
    callCount: () => callCountRef.current,
  };
}
