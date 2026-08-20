import { resolveGraphApiVersion } from "@/config/social";
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
 * Cadeia oficial de resolução (nunca simultânea):
 * 1. `instagram_graph` — API oficial Meta Business Discovery
 *    (INSTAGRAM_GRAPH_ACCESS_TOKEN + INSTAGRAM_BUSINESS_ACCOUNT_ID);
 * 2. `instagram_apify` — provider gerenciado (APIFY_API_TOKEN), cobre perfis
 *    públicos que o Business Discovery não alcança;
 * 3. `instagram_public` — leitura pública best-effort (metadados og:), sem
 *    autenticação e sem burlar login/CAPTCHA;
 * 4. `unconfigured` — nenhum provider viável; a UI segue sem Instagram.
 *
 * NUNCA usamos senha, cookie, sessionId, 2FA ou automação de login.
 */

export interface InstagramProviderEnv {
  INSTAGRAM_GRAPH_ACCESS_TOKEN?: string | undefined;
  INSTAGRAM_BUSINESS_ACCOUNT_ID?: string | undefined;
  INSTAGRAM_GRAPH_API_VERSION?: string | undefined;
  INSTAGRAM_PUBLIC_READ_DISABLED?: string | undefined;
  /** Token direto da Apify (server-only). */
  APIFY_API_TOKEN?: string | undefined;
  /** Alternativa: conexão Apify via Connector Gateway da Lovable. */
  APIFY_API_KEY?: string | undefined;
  LOVABLE_API_KEY?: string | undefined;
}

/** Credenciais aceitas pelo provider gerenciado (nunca logadas). */
export type ApifyAuth =
  | { mode: "direct"; token: string }
  | { mode: "gateway"; lovableApiKey: string; connectionApiKey: string };

/**
 * Resolve como falar com a Apify: token direto (`APIFY_API_TOKEN`) ou
 * Connector Gateway (`LOVABLE_API_KEY` + `APIFY_API_KEY`). Ausência das
 * credenciais Meta é irrelevante aqui — nunca gera erro.
 */
export function resolveApifyAuth(env: InstagramProviderEnv): ApifyAuth | null {
  const direct = env.APIFY_API_TOKEN?.trim();
  if (direct) return { mode: "direct", token: direct };
  const conn = env.APIFY_API_KEY?.trim();
  const lovable = env.LOVABLE_API_KEY?.trim();
  if (conn && lovable) return { mode: "gateway", lovableApiKey: lovable, connectionApiKey: conn };
  return null;
}

/** Códigos de diagnóstico — nunca contêm token nem resposta bruta. */
export type InstagramDiagnosticCode =
  | "graph_unconfigured"
  | "graph_configured"
  | "graph_available"
  | "graph_invalid_token"
  | "graph_permission_error"
  | "graph_invalid_business_account"
  | "graph_rate_limited"
  | "graph_error"
  | "target_not_professional"
  | "target_not_found"
  | "managed_unconfigured"
  | "managed_available"
  | "managed_invalid_token"
  | "managed_rate_limited"
  | "managed_timeout"
  | "managed_malformed"
  | "managed_error"
  | "public_enabled"
  | "public_disabled"
  | "timeout";

// ------------------------------------------------------------------ Graph
/** Classifica a resposta de erro do Graph sem expor nada sensível. */
export function classifyGraphError(status: number, body: unknown): InstagramDiagnosticCode {
  const err = (body as { error?: { code?: number; error_subcode?: number; message?: string } } | null)
    ?.error;
  const code = Number(err?.code ?? 0);
  const subcode = Number(err?.error_subcode ?? 0);
  const msg = String(err?.message ?? "").toLowerCase();

  if (code === 190 || status === 401) return "graph_invalid_token";
  if ([4, 17, 32, 613, 80004].includes(code) || status === 429) return "graph_rate_limited";
  if (msg.includes("not a business") || msg.includes("is not a business account") || subcode === 2207013) {
    return "target_not_professional";
  }
  if (msg.includes("cannot be found") || msg.includes("does not exist") || code === 110) {
    return msg.includes("username") ? "target_not_found" : "graph_invalid_business_account";
  }
  if (msg.includes("unknown path components") || subcode === 33) return "graph_invalid_business_account";
  if ([10, 200, 803].includes(code) || status === 403) return "graph_permission_error";
  return "graph_error";
}

function graphFailure(code: InstagramDiagnosticCode): SocialLookupResult {
  switch (code) {
    case "target_not_found":
      return { status: "not_found" };
    case "target_not_professional":
      return { status: "unavailable", reason: "not_professional" };
    case "graph_rate_limited":
      return { status: "rate_limited" };
    case "graph_invalid_token":
    case "graph_permission_error":
    case "graph_invalid_business_account":
      return { status: "unavailable", reason: "config_error" };
    default:
      return { status: "unavailable", reason: "error" };
  }
}

/** Campos oficialmente suportados hoje pelo `business_discovery`. */
export function buildBusinessDiscoveryFields(handle: string, mediaLimit: number): string {
  return (
    `business_discovery.username(${handle})` +
    "{username,name,biography,website,followers_count,follows_count,media_count," +
    `profile_picture_url,media.limit(${mediaLimit}){caption,media_type,timestamp,permalink}}`
  );
}

export function createGraphInstagramProvider(
  token: string,
  businessAccountId: string,
  fetchImpl: typeof fetch = fetch,
  mediaLimit = 20,
  apiVersion: string = resolveGraphApiVersion(),
): SocialProvider {
  return {
    id: "instagram_graph",
    async fetchProfile(handle: string): Promise<SocialLookupResult> {
      const fields = buildBusinessDiscoveryFields(handle, mediaLimit);
      const url =
        `https://graph.facebook.com/${apiVersion}/${encodeURIComponent(businessAccountId)}` +
        `?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(token)}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), SOCIAL_FETCH_TIMEOUT_MS);
      try {
        const res = await fetchImpl(url, { signal: controller.signal });
        let json: unknown = null;
        try {
          json = await res.json();
        } catch {
          json = null;
        }
        if (!res.ok) return graphFailure(classifyGraphError(res.status, json));
        const bd = (json as { business_discovery?: Record<string, unknown> } | null)
          ?.business_discovery as
          | {
              username?: string;
              name?: string;
              biography?: string;
              website?: string;
              followers_count?: number;
              follows_count?: number;
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
            }
          | undefined;
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
        const ctx = toContext("instagram_graph", {
          handle: bd.username,
          displayName: bd.name,
          bio: bd.biography,
          website: bd.website,
          followersCount: bd.followers_count,
          followsCount: bd.follows_count,
          mediaCount: bd.media_count,
          profilePictureUrl: bd.profile_picture_url,
          recentMedia: media,
        });
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

// ------------------------------------------------------------------ Apify
export const APIFY_ACTOR = "apify~instagram-profile-scraper";
export const APIFY_GATEWAY_URL = "https://connector-gateway.lovable.dev/apify";
export const APIFY_TIMEOUT_MS = 45_000;

interface ApifyItem {
  username?: unknown;
  fullName?: unknown;
  biography?: unknown;
  externalUrl?: unknown;
  externalUrls?: unknown;
  website?: unknown;
  private?: unknown;
  businessCategoryName?: unknown;
  followersCount?: unknown;
  followsCount?: unknown;
  postsCount?: unknown;
  profilePicUrl?: unknown;
  profilePicUrlHD?: unknown;
  error?: unknown;
  latestPosts?: unknown;
}

/** A Apify entrega o site ora em `externalUrl`, ora em `externalUrls[]`. */
function pickApifyWebsite(it: ApifyItem): unknown {
  if (typeof it.externalUrl === "string" && it.externalUrl) return it.externalUrl;
  if (Array.isArray(it.externalUrls)) {
    for (const entry of it.externalUrls) {
      if (typeof entry === "string" && entry) return entry;
      const url = (entry as { url?: unknown } | null)?.url;
      if (typeof url === "string" && url) return url;
    }
  }
  return it.website;
}

/** Mapeia o payload do Apify para o nosso domínio — nada bruto é guardado. */
export function mapApifyItemToContext(item: unknown, handle: string): SocialBusinessContext | null {
  if (!item || typeof item !== "object") return null;
  const it = item as ApifyItem;
  const posts = Array.isArray(it.latestPosts) ? it.latestPosts : [];
  const media = sanitizeRecentMedia(
    posts.map((p) => {
      const post = (p ?? {}) as Record<string, unknown>;
      return {
        mediaType: typeof post["type"] === "string" ? String(post["type"]).toUpperCase() : undefined,
        caption: post["caption"],
        timestamp: post["timestamp"],
        permalink: post["url"],
      };
    }),
  );
  return toContext("instagram_apify", {
    handle: typeof it.username === "string" && it.username ? it.username : handle,
    displayName: it.fullName,
    bio: it.biography,
    category: it.businessCategoryName,
    website: pickApifyWebsite(it),
    followersCount: it.followersCount,
    followsCount: it.followsCount,
    mediaCount: it.postsCount,
    profilePictureUrl: it.profilePicUrlHD ?? it.profilePicUrl,
    recentMedia: media,
  });
}

/**
 * Provider gerenciado (Apify official Instagram Profile Scraper).
 * Recebe apenas o handle normalizado; nunca recebe credenciais do Instagram.
 */
export function createApifyInstagramProvider(
  auth: ApifyAuth | string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = APIFY_TIMEOUT_MS,
): SocialProvider {
  const credentials: ApifyAuth = typeof auth === "string" ? { mode: "direct", token: auth } : auth;
  return {
    id: "instagram_apify",
    async fetchProfile(handle: string): Promise<SocialLookupResult> {
      const query = `?timeout=${Math.floor(timeoutMs / 1000)}&maxItems=1`;
      const path = `/acts/${APIFY_ACTOR}/run-sync-get-dataset-items${query}`;
      const url =
        credentials.mode === "gateway"
          ? `${APIFY_GATEWAY_URL}${path}`
          : `https://api.apify.com/v2${path}&token=${encodeURIComponent(credentials.token)}`;
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (credentials.mode === "gateway") {
        headers["Authorization"] = `Bearer ${credentials.lovableApiKey}`;
        headers["X-Connection-Api-Key"] = credentials.connectionApiKey;
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetchImpl(url, {
          method: "POST",
          signal: controller.signal,
          headers,
          body: JSON.stringify({ usernames: [handle], resultsLimit: 12 }),
        });
        if (res.status === 401 || res.status === 403) {
          return { status: "unavailable", reason: "config_error" };
        }
        if (res.status === 429) return { status: "rate_limited" };
        if (!res.ok) return { status: "unavailable", reason: "error" };
        let json: unknown = null;
        try {
          json = await res.json();
        } catch {
          return { status: "unavailable", reason: "error" };
        }
        const items = Array.isArray(json) ? json : null;
        if (!items) return { status: "unavailable", reason: "error" };
        if (items.length === 0) return { status: "not_found" };
        const first = items[0] as ApifyItem;
        const errText = typeof first?.error === "string" ? first.error.toLowerCase() : "";
        if (errText.includes("not_found") || errText.includes("not found")) {
          return { status: "not_found" };
        }
        if (errText) return { status: "unavailable", reason: "error" };
        const ctx = mapApifyItemToContext(first, handle);
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

// ----------------------------------------------------------------- público
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

// ------------------------------------------------------------------ cadeia
/**
 * Executa os providers em SEQUÊNCIA (nunca em paralelo). Só avança para o
 * próximo quando o desfecho é "este provider não cobre este alvo":
 * `not_professional`, `blocked`, `empty`, `error`, `timeout`,
 * `provider_unconfigured`, `not_found`.
 *
 * `rate_limited` e `config_error` interrompem a cadeia: são problemas de
 * configuração/quota que precisam ser diagnosticados, não mascarados.
 */
export function shouldTryNextProvider(res: SocialLookupResult): boolean {
  if (res.status === "ok") return false;
  if (res.status === "invalid") return false;
  if (res.status === "rate_limited") return false;
  if (res.status === "unavailable" && res.reason === "config_error") return false;
  return true;
}

export function createInstagramProviderChain(providers: SocialProvider[]): SocialProvider {
  const usable = providers.filter((p) => p.id !== "unconfigured");
  if (usable.length === 0) return unconfiguredInstagramProvider;
  if (usable.length === 1) return usable[0]!;
  return {
    id: "chain",
    async fetchProfile(handle: string): Promise<SocialLookupResult> {
      let last: SocialLookupResult = { status: "unavailable", reason: "error" };
      for (const provider of usable) {
        try {
          last = await provider.fetchProfile(handle);
        } catch {
          last = { status: "unavailable", reason: "error" };
        }
        if (!shouldTryNextProvider(last)) return last;
      }
      return last;
    },
  };
}

/**
 * Monta a cadeia a partir do ambiente. Para desativar a leitura pública
 * best-effort defina `INSTAGRAM_PUBLIC_READ_DISABLED=1`.
 */
export function resolveInstagramProvider(
  env: InstagramProviderEnv = {},
  fetchImpl: typeof fetch = fetch,
): SocialProvider {
  const token = env.INSTAGRAM_GRAPH_ACCESS_TOKEN?.trim();
  const account = env.INSTAGRAM_BUSINESS_ACCOUNT_ID?.trim();
  const apify = resolveApifyAuth(env);
  const chain: SocialProvider[] = [];
  // 1) Apify é o provider principal desta implementação.
  if (apify) chain.push(createApifyInstagramProvider(apify, fetchImpl));
  // 2) Meta Graph permanece como legado OPCIONAL: só entra na cadeia quando
  //    as credenciais existem. A ausência delas nunca gera erro.
  if (token && account) {
    chain.push(
      createGraphInstagramProvider(
        token,
        account,
        fetchImpl,
        20,
        resolveGraphApiVersion(env as Record<string, string | undefined>),
      ),
    );
  }
  if (env.INSTAGRAM_PUBLIC_READ_DISABLED !== "1") {
    chain.push(createPublicInstagramProvider(fetchImpl));
  }
  return createInstagramProviderChain(chain);
}

// ------------------------------------------------------------ health check
export interface InstagramProviderHealth {
  graph: { configured: boolean; status: InstagramDiagnosticCode };
  managed: { configured: boolean; status: InstagramDiagnosticCode };
  publicRead: { enabled: boolean; status: InstagramDiagnosticCode };
  graphApiVersion: string;
  chain: string[];
  checkedAt: string;
}

/**
 * Diagnóstico do provider sem expor secrets: apenas `configured` e um código
 * de status. Nunca devolve token, URL com token ou resposta bruta.
 */
export async function checkInstagramProviderHealth(
  env: InstagramProviderEnv = {},
  fetchImpl: typeof fetch = fetch,
  probeHandle = "instagram",
): Promise<InstagramProviderHealth> {
  const token = env.INSTAGRAM_GRAPH_ACCESS_TOKEN?.trim();
  const account = env.INSTAGRAM_BUSINESS_ACCOUNT_ID?.trim();
  const apify = resolveApifyAuth(env);
  const version = resolveGraphApiVersion(env as Record<string, string | undefined>);
  const publicEnabled = env.INSTAGRAM_PUBLIC_READ_DISABLED !== "1";

  let graphStatus: InstagramDiagnosticCode = "graph_unconfigured";
  if (token && account) {
    graphStatus = "graph_configured";
    const url =
      `https://graph.facebook.com/${version}/${encodeURIComponent(account)}` +
      `?fields=${encodeURIComponent(buildBusinessDiscoveryFields(probeHandle, 1))}` +
      `&access_token=${encodeURIComponent(token)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SOCIAL_FETCH_TIMEOUT_MS);
    try {
      const res = await fetchImpl(url, { signal: controller.signal });
      let json: unknown = null;
      try {
        json = await res.json();
      } catch {
        json = null;
      }
      graphStatus = res.ok ? "graph_available" : classifyGraphError(res.status, json);
    } catch (err) {
      graphStatus =
        ((err as { name?: string } | null)?.name ?? "") === "AbortError" ? "timeout" : "graph_error";
    } finally {
      clearTimeout(timer);
    }
  }

  let managedStatus: InstagramDiagnosticCode = "managed_unconfigured";
  if (apify) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SOCIAL_FETCH_TIMEOUT_MS);
    try {
      const res =
        apify.mode === "gateway"
          ? await fetchImpl(`${APIFY_GATEWAY_URL}/users/me`, {
              signal: controller.signal,
              headers: {
                Authorization: `Bearer ${apify.lovableApiKey}`,
                "X-Connection-Api-Key": apify.connectionApiKey,
              },
            })
          : await fetchImpl(
              `https://api.apify.com/v2/users/me?token=${encodeURIComponent(apify.token)}`,
              { signal: controller.signal },
            );
      if (res.ok) managedStatus = "managed_available";
      else if (res.status === 401 || res.status === 403) managedStatus = "managed_invalid_token";
      else if (res.status === 429) managedStatus = "managed_rate_limited";
      else managedStatus = "managed_error";
    } catch (err) {
      managedStatus =
        ((err as { name?: string } | null)?.name ?? "") === "AbortError"
          ? "managed_timeout"
          : "managed_error";
    } finally {
      clearTimeout(timer);
    }
  }

  const chain: string[] = [];
  if (apify) chain.push("instagram_apify");
  if (token && account) chain.push("instagram_graph");
  if (publicEnabled) chain.push("instagram_public");

  return {
    graph: { configured: Boolean(token && account), status: graphStatus },
    managed: { configured: Boolean(apify), status: managedStatus },
    publicRead: { enabled: publicEnabled, status: publicEnabled ? "public_enabled" : "public_disabled" },
    graphApiVersion: version,
    chain,
    checkedAt: new Date().toISOString(),
  };
}

// ------------------------------------------------------------------ helpers
function toContext(
  provider: SocialBusinessContext["provider"],
  raw: {
    handle: unknown;
    displayName?: unknown;
    bio?: unknown;
    category?: unknown;
    website?: unknown;
    followersCount?: unknown;
    followsCount?: unknown;
    mediaCount?: unknown;
    profilePictureUrl?: unknown;
    recentMedia?: unknown;
  },
): SocialBusinessContext | null {
  const media = Array.isArray(raw.recentMedia) ? raw.recentMedia : [];
  const text = [
    typeof raw.displayName === "string" ? raw.displayName : "",
    typeof raw.category === "string" ? raw.category : "",
    typeof raw.bio === "string" ? raw.bio : "",
    ...media.map((m) => (m as { caption?: string })?.caption ?? ""),
  ]
    .filter(Boolean)
    .join(". ");
  return sanitizeSocialBusinessContext({
    ...raw,
    provider,
    keywords: extractKeywords(text),
    signals: extractSignals(text),
    fetchedAt: new Date().toISOString(),
    truncated: false,
  });
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
