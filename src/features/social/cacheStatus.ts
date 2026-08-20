import { DEFAULT_SOCIAL_CONFIG } from "@/config/social";
import { SOCIAL_ANALYSIS_PROMPT_VERSION } from "@/lib/social-analysis";

/**
 * Leitura de frescor do cache social para a UI administrativa.
 *
 * COLETA e ANÁLISE são medidas separadamente: um perfil pode ter coleta
 * vencida com análise ainda perfeitamente válida (conteúdo não mudou), e
 * vice-versa (o prompt subiu de versão).
 */

export type FreshnessLevel = "fresh" | "stale" | "missing";

export interface SocialFreshness {
  fetch: FreshnessLevel;
  analysis: FreshnessLevel;
  /** Motivo pelo qual a análise precisa ser refeita, quando aplicável. */
  analysisReason: "ok" | "missing" | "prompt_version" | "expired";
  fetchAgeMs: number | null;
  analysisAgeMs: number | null;
}

function ageMs(iso: string | null | undefined, now: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Math.max(0, now - t) : null;
}

export function computeSocialFreshness(
  cache: {
    fetched_at?: string | null;
    analyzed_at?: string | null;
    ai_analysis?: unknown;
    ai_prompt_version?: string | null;
  } | null,
  opts: { now?: number; fetchTtlMs?: number; analysisTtlMs?: number } = {},
): SocialFreshness {
  const now = opts.now ?? Date.now();
  const fetchTtl = opts.fetchTtlMs ?? DEFAULT_SOCIAL_CONFIG.fetchTtlMs;
  const analysisTtl = opts.analysisTtlMs ?? DEFAULT_SOCIAL_CONFIG.analysisTtlMs;

  const fetchAge = ageMs(cache?.fetched_at, now);
  const analysisAge = ageMs(cache?.analyzed_at, now);

  const fetch: FreshnessLevel =
    fetchAge === null ? "missing" : fetchAge < fetchTtl ? "fresh" : "stale";

  let analysis: FreshnessLevel = "missing";
  let analysisReason: SocialFreshness["analysisReason"] = "missing";
  if (cache?.ai_analysis && analysisAge !== null) {
    if (cache.ai_prompt_version !== SOCIAL_ANALYSIS_PROMPT_VERSION) {
      analysis = "stale";
      analysisReason = "prompt_version";
    } else if (analysisAge >= analysisTtl) {
      analysis = "stale";
      analysisReason = "expired";
    } else {
      analysis = "fresh";
      analysisReason = "ok";
    }
  }

  return { fetch, analysis, analysisReason, fetchAgeMs: fetchAge, analysisAgeMs: analysisAge };
}

export function freshnessLabel(level: FreshnessLevel): string {
  switch (level) {
    case "fresh":
      return "atualizado";
    case "stale":
      return "desatualizado";
    default:
      return "sem dados";
  }
}

export function analysisReasonLabel(reason: SocialFreshness["analysisReason"]): string {
  switch (reason) {
    case "ok":
      return "análise válida — nenhuma reanálise necessária";
    case "prompt_version":
      return "versão do prompt mudou — será reanalisado";
    case "expired":
      return "análise expirada — será reanalisada";
    default:
      return "ainda sem análise de IA";
  }
}
