import {
  MAX_RESPONSE_BYTES,
  SOCIAL_FETCH_TIMEOUT_MS,
  createMemoryRateLimiter,
  createMemoryTtlCache,
  extractKeywords,
  extractSignals,
  guardedFetchText,
  sanitizeRecentMedia,
  parseInstagramPublicHtml,
  sanitizeSocialBusinessContext,
  type RateLimiter,
  type SocialBusinessContext,
  type SocialLookupResult,
  type SocialProvider,
  type TtlCache,
} from "./social-context";

/**
 * Adaptadores de provider do Instagram (server-only).
 *
 * Ordem de resolução:
 * 1. API oficial Meta/Instagram Graph (`business_discovery`) — exige
 *    INSTAGRAM_GRAPH_ACCESS_TOKEN + INSTAGRAM_BUSINESS_ACCOUNT_ID;
 * 2. leitura pública limitada (apenas metadados og: da página do perfil),
 *    sem autenticação, sem burlar login/CAPTCHA/rate limit;
 * 3. `unconfigured` — nenhum provider viável; a UI segue sem Instagram.
 *
 * O Instagram frequentemente responde com muro de login para acesso
 * anônimo. Quando isso acontece o provider público devolve
 * `unavailable/blocked` — nunca simulamos sucesso.
 */

export interface InstagramProviderEnv {
  INSTAGRAM_GRAPH_ACCESS_TOKEN?: string | undefined;
  INSTAGRAM_BUSINESS_ACCOUNT_ID?: string | undefined;
}

export function createGraphInstagramProvider(
  token: string,
  businessAccountId: string,
  fetchImpl: typeof fetch = fetch,
  mediaLimit = 20,
): SocialProvider {
  return {
    id: "instagram_graph",
    async fetchProfile(handle: string): Promise<SocialLookupResult> {
      const fields =
        `business_discovery.username(${handle})` +
        "{username,name,biography,website,followers_count,media_count,profile_picture_url," +
        `media.limit(${mediaLimit}){caption,media_type,timestamp,permalink}}`;
      const url =
        `https://graph.facebook.com/v21.0/${encodeURIComponent(businessAccountId)}` +
        `?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(token)}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), SOCIAL_FETCH_TIMEOUT_MS);
      try {
        const res = await fetchImpl(url, { signal: controller.signal });
        if (res.status === 404) return { status: "not_found" };
        if (!res.ok) return { status: "unavailable", reason: "error" };
        const json = (await res.json()) as {
          business_discovery?: {
            username?: string;
            name?: string;
            biography?: string;
            website?: string;
            followers_count?: number;
            media_count?: number;
            profile_picture_url?: string;
            media?: {
              data?: Array<{
                caption?: string;
                media_type?: string;
                timestamp?: string;
                permalink?: string;
              }>;
            };
          };
        };
        const bd = json.business_discovery;
        if (!bd?.username) return { status: "not_found" };
        const media = sanitizeRecentMedia(
          (bd.media?.data ?? []).map((m) => ({
            mediaType: m.media_type,
            caption: m.caption,
            timestamp: m.timestamp,
            permalink: m.permalink,
          })),
          mediaLimit,
        );
        const text = [bd.name, bd.biography, ...(media ?? []).map((m) => m.caption ?? "")]
          .filter(Boolean)
          .join(". ");
        const ctx = sanitizeSocialBusinessContext({
          provider: "instagram_graph",
          handle: bd.username,
          displayName: bd.name,
          bio: bd.biography,
          website: bd.website,
          followersCount: bd.followers_count,
          mediaCount: bd.media_count,
          profilePictureUrl: bd.profile_picture_url,
          recentMedia: media,
          keywords: extractKeywords(text),
          signals: extractSignals(text),
          fetchedAt: new Date().toISOString(),
          truncated: false,
        } satisfies Partial<SocialBusinessContext> as unknown);
        if (!ctx) return { status: "unavailable", reason: "empty" };
        return { status: "ok", context: ctx };
      } catch (err) {
        const name = (err as { name?: string } | null)?.name ?? "";
        return { status: "unavailable", reason: name === "AbortError" ? "timeout" : "error" };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

export function createPublicInstagramProvider(fetchImpl: typeof fetch = fetch): SocialProvider {
  return {
    id: "instagram_public",
    async fetchProfile(handle: string): Promise<SocialLookupResult> {
      const res = await guardedFetchText(`https://www.instagram.com/${handle}/`, {
        fetchImpl,
        timeoutMs: SOCIAL_FETCH_TIMEOUT_MS,
        maxBytes: MAX_RESPONSE_BYTES,
      });
      if (!res.ok) {
        if (res.reason === "timeout") return { status: "unavailable", reason: "timeout" };
        if (res.reason === "http_error" && res.status === 404) return { status: "not_found" };
        if (res.reason === "invalid_host" || res.reason === "blocked_redirect") {
          return { status: "unavailable", reason: "blocked" };
        }
        return { status: "unavailable", reason: "error" };
      }
      const ctx = parseInstagramPublicHtml(res.text, handle);
      if (!ctx) return { status: "unavailable", reason: "blocked" };
      return { status: "ok", context: ctx };
    },
  };
}

/** Provider inerte usado quando nenhuma integração está viável. */
export const unconfiguredInstagramProvider: SocialProvider = {
  id: "unconfigured",
  async fetchProfile(): Promise<SocialLookupResult> {
    return { status: "unavailable", reason: "provider_unconfigured" };
  },
};

/**
 * Escolhe o melhor provider disponível. Para desativar completamente a
 * leitura pública (ex.: bloqueio persistente do Instagram), defina
 * `INSTAGRAM_PUBLIC_READ_DISABLED=1`.
 */
export function resolveInstagramProvider(
  env: InstagramProviderEnv & { INSTAGRAM_PUBLIC_READ_DISABLED?: string | undefined } = {},
  fetchImpl: typeof fetch = fetch,
): SocialProvider {
  const token = env.INSTAGRAM_GRAPH_ACCESS_TOKEN?.trim();
  const account = env.INSTAGRAM_BUSINESS_ACCOUNT_ID?.trim();
  if (token && account) return createGraphInstagramProvider(token, account, fetchImpl);
  if (env.INSTAGRAM_PUBLIC_READ_DISABLED === "1") return unconfiguredInstagramProvider;
  return createPublicInstagramProvider(fetchImpl);
}

// Cache curto e rate limit por instância (Edge Worker) — deliberadamente em
// memória: o contexto é descartável e nunca é persistido.
let cacheRef: TtlCache<SocialBusinessContext> | null = null;
let limiterRef: RateLimiter | null = null;

export function socialCache(): TtlCache<SocialBusinessContext> {
  if (!cacheRef) cacheRef = createMemoryTtlCache<SocialBusinessContext>();
  return cacheRef;
}

export function socialRateLimiter(): RateLimiter {
  if (!limiterRef) limiterRef = createMemoryRateLimiter();
  return limiterRef;
}
