import { useEffect, useMemo, useRef } from "react";
import type { AiSuggestionItem } from "@/lib/onboarding-ai-schema";
import type { SocialBusinessContext } from "@/lib/social-context";
import type { SocialBusinessAnalysis } from "@/lib/social-analysis";
import {
  serializeAnalysisKey,
  type AnalysisKey,
  type ConfirmedOffer,
  type SharedAiAnalysis,
} from "./aiAnalysisState";
import type { BusinessSize, BusinessType } from "./types";

export interface AutoAiSuggestionsArgs {
  focus: "offers" | "needs";
  enabled: boolean;
  eventId?: string | undefined;
  segmentId: string;
  summary: string;
  businessSize?: BusinessSize | "" | undefined;
  businessType?: BusinessType | "" | undefined;
  niche?: string | undefined;
  socialContext?: SocialBusinessContext | null | undefined;
  socialAnalysis?: SocialBusinessAnalysis | null | undefined;
  /** Itens já no draft — só evitam repetição no prompt (fora da chave). */
  existingLabels: string[];
  /** Ofertas confirmadas na Etapa 3 — parte da chave quando focus="needs". */
  confirmedOffers?: ConfirmedOffer[] | undefined;
  analysis?: SharedAiAnalysis | undefined;
}

/**
 * IMPL 22 — dispara a análise de IA AUTOMATICAMENTE ao entrar na etapa, uma
 * única vez por contexto semântico, e devolve as sugestões já prontas.
 *
 * Sem botão manual: o participante nunca precisa acionar um mecanismo técnico.
 * A chamada nunca acontece durante o render (só em `useEffect`), a chave é
 * estável e `analyze` memoriza por chave — voltar da Etapa 4 para a Etapa 3
 * sem alterar nada faz ZERO chamada nova.
 */
export function useAutoAiSuggestions(args: AutoAiSuggestionsArgs): {
  items: AiSuggestionItem[];
  loading: boolean;
  failed: boolean;
} {
  const {
    focus,
    enabled,
    eventId,
    segmentId,
    summary,
    businessSize,
    businessType,
    niche,
    socialContext,
    socialAnalysis,
    existingLabels,
    confirmedOffers,
    analysis,
  } = args;

  const key = useMemo<AnalysisKey | null>(() => {
    if (!enabled || !eventId || !summary.trim() || !segmentId) return null;
    return {
      focus,
      eventId,
      segmentId,
      summary,
      ...(businessSize ? { businessSize } : {}),
      ...(businessType ? { businessType } : {}),
      ...(niche ? { niche } : {}),
      socialContext: socialContext ?? null,
      socialAnalysis: socialAnalysis ?? null,
      ...(focus === "needs" ? { confirmedOffers: confirmedOffers ?? [] } : {}),
    };
  }, [
    enabled,
    eventId,
    focus,
    segmentId,
    summary,
    businessSize,
    businessType,
    niche,
    socialContext,
    socialAnalysis,
    confirmedOffers,
  ]);

  const keyId = key ? serializeAnalysisKey(key) : null;

  // `existingLabels` não participa da chave nem das deps do efeito: serve só
  // para o prompt evitar repetição. Sem o ref, cada item adicionado dispararia
  // um novo efeito.
  const labelsRef = useRef(existingLabels);
  labelsRef.current = existingLabels;
  const keyRef = useRef(key);
  keyRef.current = key;

  useEffect(() => {
    if (!keyId || !analysis || !keyRef.current) return;
    void analysis.analyze(keyRef.current, labelsRef.current);
  }, [keyId, analysis]);

  const status = key && analysis ? analysis.statusFor(key) : { s: "idle" as const };
  const result = key && analysis ? analysis.resultFor(key) : null;

  return {
    items: result ? (focus === "offers" ? result.offers : result.needs) : [],
    loading: status.s === "loading",
    failed: status.s === "error",
  };
}
