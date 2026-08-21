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
  /**
   * Quantas publicações recentes alimentam a IA (bio + N posts).
   * NÃO limita a persistência: o backend guarda tudo que a Apify devolveu.
   */
  recentPostsForAi: number;
  /** Teto defensivo (bytes) do payload bruto saneado do provider. */
  maxProviderPayloadBytes: number;
  /** Intervalo mínimo entre refreshes administrativos do mesmo perfil. */
  adminRefreshCooldownMs: number;
}

/** Limites duros do N usado pela IA (experimento controlado 0/3/6/9). */
export const SOCIAL_RECENT_POSTS_MIN = 3;
export const SOCIAL_RECENT_POSTS_MAX = 9;
/**
 * Valor validado empiricamente (6 perfis reais, 24 execuções):
 * 6 posts ≈ 9 posts em ofertas/necessidades/confiança, com ~21% menos tokens
 * de entrada. 3 posts fica claramente atrás. Portanto: 6.
 */
export const SOCIAL_RECENT_POSTS_DEFAULT = 6;

export const DEFAULT_SOCIAL_CONFIG: SocialConfig = {
  memoryTtlMs: 10 * 60 * 1000, // 10 min
  fetchTtlMs: 12 * 60 * 60 * 1000, // 12 h
  analysisTtlMs: 30 * 24 * 60 * 60 * 1000, // 30 dias
  maxRecentMedia: 12,
  maxCaptionChars: 200,
  recentPostsForAi: SOCIAL_RECENT_POSTS_DEFAULT,
  // Medição real (6 perfis, 12 posts cada): média 75 KB, máximo 179 KB.
  // 256 KB cobre com folga um perfil normal completo.
  maxProviderPayloadBytes: 256 * 1024,
  adminRefreshCooldownMs: 10 * 60 * 1000, // espelha o gate do banco
};

function positiveInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/** Aplica o intervalo permitido do N da IA (3..9). */
export function clampRecentPostsForAi(raw: unknown): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n)) return SOCIAL_RECENT_POSTS_DEFAULT;
  return Math.min(SOCIAL_RECENT_POSTS_MAX, Math.max(SOCIAL_RECENT_POSTS_MIN, n));
}

/** Lê overrides de ambiente (server-only). Valores inválidos caem no default. */
export function resolveSocialConfig(
  env: Record<string, string | undefined> = {},
): SocialConfig {
  const rawPosts = env["SOCIAL_RECENT_POSTS_LIMIT"];
  return {
    memoryTtlMs: positiveInt(env["SOCIAL_MEMORY_TTL_MS"], DEFAULT_SOCIAL_CONFIG.memoryTtlMs),
    fetchTtlMs: positiveInt(env["SOCIAL_FETCH_TTL_MS"], DEFAULT_SOCIAL_CONFIG.fetchTtlMs),
    analysisTtlMs: positiveInt(env["SOCIAL_ANALYSIS_TTL_MS"], DEFAULT_SOCIAL_CONFIG.analysisTtlMs),
    maxRecentMedia: positiveInt(env["SOCIAL_MAX_RECENT_MEDIA"], DEFAULT_SOCIAL_CONFIG.maxRecentMedia),
    maxCaptionChars: positiveInt(
      env["SOCIAL_MAX_CAPTION_CHARS"],
      DEFAULT_SOCIAL_CONFIG.maxCaptionChars,
    ),
    recentPostsForAi: clampRecentPostsForAi(
      rawPosts === undefined || rawPosts === "" || !Number.isFinite(Number(rawPosts))
        ? SOCIAL_RECENT_POSTS_DEFAULT
        : rawPosts,
    ),
    maxProviderPayloadBytes: positiveInt(
      env["SOCIAL_MAX_PROVIDER_PAYLOAD_BYTES"],
      DEFAULT_SOCIAL_CONFIG.maxProviderPayloadBytes,
    ),
    adminRefreshCooldownMs: DEFAULT_SOCIAL_CONFIG.adminRefreshCooldownMs,
  };
}


/**
 * Versão da Graph API usada pelo provider oficial (Business Discovery).
 *
 * Validada na documentação oficial da Meta (Graph API Versions/Changelog):
 * a versão mais recente disponível é `v26.0` (lançada em 29/07/2026) — é o
 * default. Pode ser sobrescrita por `INSTAGRAM_GRAPH_API_VERSION` sem deploy
 * de código quando a Meta publicar uma nova versão ou expirar esta.
 */
export const DEFAULT_GRAPH_API_VERSION = "v26.0";

const GRAPH_VERSION_RE = /^v\d{1,3}\.\d{1,2}$/;

export function resolveGraphApiVersion(env: Record<string, string | undefined> = {}): string {
  const raw = env["INSTAGRAM_GRAPH_API_VERSION"]?.trim();
  return raw && GRAPH_VERSION_RE.test(raw) ? raw : DEFAULT_GRAPH_API_VERSION;
}
