/**
 * Configuração central do enriquecimento social (Instagram).
 *
 * Todo número mágico de TTL/limite vive aqui — nada de constantes espalhadas
 * pela aplicação. Os valores podem ser sobrescritos por env no servidor
 * através de `resolveSocialConfig`.
 */

export interface SocialConfig {
  /** L1 — cache de processo (Edge Worker). */
  memoryTtlMs: number;
  /** L2 — quanto tempo um FETCH do provider continua fresco. */
  fetchTtlMs: number;
  /** L2 — validade máxima da ANÁLISE de IA (mesmo com fingerprint igual). */
  analysisTtlMs: number;
  /** Máximo de mídias recentes estruturadas persistidas por perfil. */
  maxRecentMedia: number;
  /** Teto de caracteres por caption armazenada. */
  maxCaptionChars: number;
  /** Intervalo mínimo entre refreshes administrativos do mesmo perfil. */
  adminRefreshCooldownMs: number;
}

export const DEFAULT_SOCIAL_CONFIG: SocialConfig = {
  memoryTtlMs: 10 * 60 * 1000, // 10 min
  fetchTtlMs: 12 * 60 * 60 * 1000, // 12 h
  analysisTtlMs: 30 * 24 * 60 * 60 * 1000, // 30 dias
  maxRecentMedia: 12,
  maxCaptionChars: 200,
  adminRefreshCooldownMs: 10 * 60 * 1000, // espelha o gate do banco
};

function positiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/** Lê overrides de ambiente (server-only). Valores inválidos caem no default. */
export function resolveSocialConfig(
  env: Record<string, string | undefined> = {},
): SocialConfig {
  return {
    memoryTtlMs: positiveInt(env["SOCIAL_MEMORY_TTL_MS"], DEFAULT_SOCIAL_CONFIG.memoryTtlMs),
    fetchTtlMs: positiveInt(env["SOCIAL_FETCH_TTL_MS"], DEFAULT_SOCIAL_CONFIG.fetchTtlMs),
    analysisTtlMs: positiveInt(env["SOCIAL_ANALYSIS_TTL_MS"], DEFAULT_SOCIAL_CONFIG.analysisTtlMs),
    maxRecentMedia: positiveInt(env["SOCIAL_MAX_RECENT_MEDIA"], DEFAULT_SOCIAL_CONFIG.maxRecentMedia),
    maxCaptionChars: positiveInt(
      env["SOCIAL_MAX_CAPTION_CHARS"],
      DEFAULT_SOCIAL_CONFIG.maxCaptionChars,
    ),
    adminRefreshCooldownMs: DEFAULT_SOCIAL_CONFIG.adminRefreshCooldownMs,
  };
}
