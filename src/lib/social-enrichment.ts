import { DEFAULT_SOCIAL_CONFIG, type SocialConfig } from "@/config/social";
import {
  SOCIAL_CONTEXT_SCHEMA_VERSION,
  isLegacySocialContextShape,
  normalizeInstagramInput,
  sanitizeSocialBusinessContext,
  socialContextFingerprint,
  type RateLimiter,
  type SocialBusinessContext,
  type SocialLookupFailure,
  type SocialProvider,
  type TtlCache,
} from "./social-context";
import {
  SOCIAL_ANALYSIS_PROMPT_VERSION,
  sanitizeSocialAnalysis,
  type SocialBusinessAnalysis,
} from "./social-analysis";


/**
 * Pipeline cache-first do enriquecimento social.
 *
 *   L1 (memória) → L2 (banco) → provider
 *
 * Frescor de COLETA e frescor de ANÁLISE são independentes:
 * mesmo depois de reconsultar o Instagram, se o `content_fingerprint` não
 * mudou (e a versão do prompt/modelo continua a mesma), a análise de IA
 * anterior é reaproveitada — zero tokens gastos.
 */

// ------------------------------------------------------------------- tipos
export interface SocialCacheRecord {
  network: string;
  normalized_handle: string;
  canonical_url: string | null;
  provider: string | null;
  provider_version: string | null;
  public_profile: Record<string, unknown> | null;
  extracted_context: Record<string, unknown> | null;
  ai_analysis: Record<string, unknown> | null;
  content_fingerprint: string | null;
  ai_prompt_version: string | null;
  ai_model: string | null;
  fetched_at: string | null;
  analyzed_at: string | null;
  expires_at: string | null;
  last_status: string | null;
  last_error_code: string | null;
  /** Payload bruto saneado do provider (só é enviado quando há coleta nova). */
  provider_payload?: Record<string, unknown> | null;
  provider_payload_version?: string | null;
  provider_payload_bytes?: number | null;
  provider_payload_truncated?: boolean | null;
  provider_posts_received?: number | null;
  provider_posts_persisted?: number | null;
  ai_posts_used?: number | null;
  context_schema_version?: string | null;
}

/** L2 — armazenamento persistente (Supabase, injetável em teste). */
export interface SocialCacheStore {
  read(network: string, handle: string): Promise<SocialCacheRecord | null>;
  write(record: SocialCacheRecord): Promise<void>;
}

/** Metadados do snapshot bruto do provider associado a esta entrada. */
export interface SocialEntryPayloadMeta {
  payload?: Record<string, unknown> | null;
  version: string | null;
  bytes: number | null;
  truncated: boolean;
  postsReceived: number | null;
  postsPersisted: number | null;
}

export interface SocialEntry {
  context: SocialBusinessContext;
  analysis: SocialBusinessAnalysis | null;
  fingerprint: string;
  fetchedAt: string;
  analyzedAt: string | null;
  promptVersion: string | null;
  model: string | null;
  provider: string;
  /** Shape do registro lido do cache (v1 = legado snake_case). */
  schemaVersion?: number;
  /** Snapshot bruto do provider (patrimônio do backend). */
  providerPayload?: SocialEntryPayloadMeta;
  /** Quantas publicações efetivamente alimentaram a IA. */
  aiPostsUsed?: number | null;
}



export type SocialEnrichmentSource = "memory" | "database" | "provider";

export interface SocialEnrichmentOk {
  status: "ok";
  handle: string;
  context: SocialBusinessContext;
  analysis: SocialBusinessAnalysis | null;
  /** De onde veio o CONTEXTO nesta execução. */
  source: SocialEnrichmentSource;
  /** `true` quando a análise veio de cache (nenhum token gasto). */
  analysisReused: boolean;
  providerCalls: 0 | 1;
  aiCalls: 0 | 1;
  fetchedAt: string;
  analyzedAt: string | null;
}

export type SocialEnrichmentResult = SocialEnrichmentOk | SocialLookupFailure;

export interface SocialAnalyzer {
  model: string;
  promptVersion: string;
  analyze(ctx: SocialBusinessContext): Promise<SocialBusinessAnalysis | null>;
}

export interface SocialEnrichmentDeps {
  provider: SocialProvider;
  memory?: TtlCache<SocialEntry>;
  store?: SocialCacheStore;
  analyzer?: SocialAnalyzer;
  rateLimiter?: RateLimiter;
  config?: SocialConfig;
  now?: () => number;
}

// ------------------------------------------------------------- serialização
export function entryToRecord(entry: SocialEntry, expiresAt: string | null): SocialCacheRecord {
  const ctx = entry.context;
  return {
    network: "instagram",
    normalized_handle: ctx.handle,
    canonical_url: `https://www.instagram.com/${ctx.handle}/`,
    provider: entry.provider,
    provider_version: null,
    public_profile: {
      handle: ctx.handle,
      display_name: ctx.displayName ?? null,
      category: ctx.category ?? null,
      bio: ctx.bio ?? null,
      website: ctx.website ?? null,
      followers_count: ctx.followersCount ?? null,
      media_count: ctx.mediaCount ?? null,
      profile_picture_url: ctx.profilePictureUrl ?? null,
    },
    extracted_context: {
      ...(ctx as unknown as Record<string, unknown>),
      schemaVersion: SOCIAL_CONTEXT_SCHEMA_VERSION,
    },
    ai_analysis: (entry.analysis as unknown as Record<string, unknown>) ?? null,
    content_fingerprint: entry.fingerprint,
    ai_prompt_version: entry.promptVersion,
    ai_model: entry.model,
    fetched_at: entry.fetchedAt,
    analyzed_at: entry.analyzedAt,
    expires_at: expiresAt,
    last_status: "ok",
    last_error_code: null,
  };
}

export function recordToEntry(record: SocialCacheRecord | null): SocialEntry | null {
  if (!record) return null;
  // Leitura tolerante: registros legados em snake_case são normalizados
  // para o contrato canônico camelCase antes de qualquer uso.
  const ctx = sanitizeSocialBusinessContext(record.extracted_context);
  if (!ctx) return null;
  const legacy = isLegacySocialContextShape(record.extracted_context);
  return {
    context: ctx,
    analysis: sanitizeSocialAnalysis(record.ai_analysis),
    fingerprint: record.content_fingerprint ?? socialContextFingerprint(ctx),
    fetchedAt: record.fetched_at ?? ctx.fetchedAt,
    analyzedAt: record.analyzed_at,
    promptVersion: record.ai_prompt_version,
    model: record.ai_model,
    provider: record.provider ?? ctx.provider,
    schemaVersion: legacy ? 1 : SOCIAL_CONTEXT_SCHEMA_VERSION,
  };
}

function ageMs(iso: string | null | undefined, now: number): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? now - t : Number.POSITIVE_INFINITY;
}

/**
 * A coleta ainda está fresca?
 * Registro em shape legado NUNCA é considerado fresco: ele é candidato
 * obrigatório a refresh (item 8 do plano de correção).
 */
export function isFetchFresh(entry: SocialEntry, cfg: SocialConfig, now: number): boolean {
  if ((entry.schemaVersion ?? SOCIAL_CONTEXT_SCHEMA_VERSION) < SOCIAL_CONTEXT_SCHEMA_VERSION) {
    return false;
  }
  return ageMs(entry.fetchedAt, now) < cfg.fetchTtlMs;
}

/**
 * A análise de IA continua válida? Depende de conteúdo (fingerprint),
 * versão do prompt e modelo — e só então de tempo.
 * Análise mais VELHA que a coleta é sempre stale.
 */
export function isAnalysisValid(
  entry: SocialEntry,
  args: { fingerprint: string; promptVersion: string; model: string; cfg: SocialConfig; now: number },
): boolean {
  if (!entry.analysis) return false;
  if (entry.fingerprint !== args.fingerprint) return false;
  if (entry.promptVersion !== args.promptVersion) return false;
  if (entry.model !== args.model) return false;
  if (!entry.analyzedAt) return false;
  const analyzed = Date.parse(entry.analyzedAt);
  const fetched = Date.parse(entry.fetchedAt);
  if (Number.isFinite(analyzed) && Number.isFinite(fetched) && analyzed < fetched) return false;
  return ageMs(entry.analyzedAt, args.now) < args.cfg.analysisTtlMs;
}



// -------------------------------------------------------------- pipeline
export async function runSocialEnrichment(args: {
  raw: string;
  actor: string;
  force?: boolean;
  /**
   * Só consulta os caches persistentes (L1/L2). Nunca chama o provider nem a
   * IA — usado quando a página é recarregada e queremos apenas reidratar o
   * contexto já persistido para aquele `@`.
   */
  cacheOnly?: boolean;
  deps: SocialEnrichmentDeps;
}): Promise<SocialEnrichmentResult> {
  const { deps } = args;
  const cfg = deps.config ?? DEFAULT_SOCIAL_CONFIG;
  const now = deps.now ?? Date.now;
  const analyzerModel = deps.analyzer?.model ?? "none";
  const analyzerVersion = deps.analyzer?.promptVersion ?? SOCIAL_ANALYSIS_PROMPT_VERSION;

  const norm = normalizeInstagramInput(args.raw);
  if (!norm.ok) return { status: "invalid", reason: norm.reason };
  const handle = norm.handle;
  const key = `instagram:${handle}`;

  // ---------------------------------------------------------------- L1
  if (!args.force) {
    const hit = deps.memory?.get(key) ?? null;
    if (
      hit &&
      isFetchFresh(hit, cfg, now()) &&
      (!deps.analyzer ||
        isAnalysisValid(hit, {
          fingerprint: hit.fingerprint,
          promptVersion: analyzerVersion,
          model: analyzerModel,
          cfg,
          now: now(),
        }))
    ) {
      return ok(hit, "memory", true, 0, 0);
    }
  }

  // ---------------------------------------------------------------- L2
  let stored: SocialEntry | null = null;
  if (deps.store) {
    try {
      stored = recordToEntry(await deps.store.read("instagram", handle));
    } catch {
      stored = null; // cache indisponível nunca bloqueia o fluxo
    }
  }

  if (stored && !args.force && isFetchFresh(stored, cfg, now())) {
    const analysisOk =
      !deps.analyzer ||
      isAnalysisValid(stored, {
        fingerprint: stored.fingerprint,
        promptVersion: analyzerVersion,
        model: analyzerModel,
        cfg,
        now: now(),
      });
    if (analysisOk) {
      deps.memory?.set(key, stored);
      return ok(stored, "database", true, 0, 0);
    }
    // Conteúdo fresco mas análise inválida (prompt/modelo mudou): reanalisa
    // SEM chamar o provider.
    const entry = await analyzeAndPersist({
      base: stored,
      context: stored.context,
      fingerprint: stored.fingerprint,
      fetchedAt: stored.fetchedAt,
      deps,
      cfg,
      now,
    });
    deps.memory?.set(key, entry);
    return ok(entry, "database", false, 0, deps.analyzer ? 1 : 0);
  }

  // Reidratação pós-reload: devolve o que já está persistido para o handle,
  // mesmo que a coleta esteja vencida, sem gastar provider nem IA.
  if (args.cacheOnly) {
    if (stored) {
      deps.memory?.set(key, stored);
      return ok(stored, "database", true, 0, 0);
    }
    return { status: "unavailable", reason: "cache_miss" };
  }

  // -------------------------------------------------------- provider (L3)
  if (deps.provider.id === "unconfigured") {
    if (stored) {
      // Provider indisponível: servir o que existe é melhor que nada.
      deps.memory?.set(key, stored);
      return ok(stored, "database", true, 0, 0);
    }
    return { status: "unavailable", reason: "provider_unconfigured" };
  }
  if (deps.rateLimiter && !deps.rateLimiter.consume(args.actor)) {
    if (stored) return ok(stored, "database", true, 0, 0);
    return { status: "rate_limited" };
  }

  let fetched;
  try {
    fetched = await deps.provider.fetchProfile(handle);
  } catch {
    if (stored) return ok(stored, "database", true, 1, 0);
    return { status: "unavailable", reason: "error" };
  }
  if (fetched.status !== "ok") {
    if (stored) return ok(stored, "database", true, 1, 0);
    return fetched;
  }
  const context = sanitizeSocialBusinessContext(fetched.context);
  if (!context) {
    if (stored) return ok(stored, "database", true, 1, 0);
    return { status: "unavailable", reason: "empty" };
  }

  const fingerprint = socialContextFingerprint(context);
  const fetchedAt = new Date(now()).toISOString();

  // Conteúdo idêntico ao já analisado → reaproveita a análise (IA = 0).
  if (
    stored &&
    isAnalysisValid(stored, {
      fingerprint,
      promptVersion: analyzerVersion,
      model: analyzerModel,
      cfg,
      now: now(),
    })
  ) {
    const entry: SocialEntry = {
      ...stored,
      context,
      fingerprint,
      fetchedAt,
      provider: context.provider,
    };
    await persist(entry, deps, cfg, now);
    deps.memory?.set(key, entry);
    return ok(entry, "provider", true, 1, 0);
  }

  const entry = await analyzeAndPersist({
    base: stored,
    context,
    fingerprint,
    fetchedAt,
    deps,
    cfg,
    now,
  });
  deps.memory?.set(key, entry);
  return ok(entry, "provider", false, 1, deps.analyzer ? 1 : 0);
}

async function analyzeAndPersist(args: {
  base: SocialEntry | null;
  context: SocialBusinessContext;
  fingerprint: string;
  fetchedAt: string;
  deps: SocialEnrichmentDeps;
  cfg: SocialConfig;
  now: () => number;
}): Promise<SocialEntry> {
  const { deps, cfg, now } = args;
  let analysis: SocialBusinessAnalysis | null = null;
  if (deps.analyzer) {
    try {
      analysis = sanitizeSocialAnalysis(await deps.analyzer.analyze(args.context));
    } catch {
      analysis = null; // análise é enriquecimento: falha nunca quebra o fluxo
    }
  }
  const entry: SocialEntry = {
    context: args.context,
    analysis,
    fingerprint: args.fingerprint,
    fetchedAt: args.fetchedAt,
    analyzedAt: analysis ? new Date(now()).toISOString() : null,
    promptVersion: analysis ? (deps.analyzer?.promptVersion ?? null) : null,
    model: analysis ? (deps.analyzer?.model ?? null) : null,
    provider: args.context.provider,
  };
  await persist(entry, deps, cfg, now);
  return entry;
}

async function persist(
  entry: SocialEntry,
  deps: SocialEnrichmentDeps,
  cfg: SocialConfig,
  now: () => number,
): Promise<void> {
  if (!deps.store) return;
  try {
    await deps.store.write(entryToRecord(entry, new Date(now() + cfg.fetchTtlMs).toISOString()));
  } catch {
    /* persistência é best-effort: nunca bloqueia o cadastro */
  }
}

function ok(
  entry: SocialEntry,
  source: SocialEnrichmentSource,
  analysisReused: boolean,
  providerCalls: 0 | 1,
  aiCalls: 0 | 1,
): SocialEnrichmentOk {
  return {
    status: "ok",
    handle: entry.context.handle,
    context: entry.context,
    analysis: entry.analysis,
    source,
    analysisReused,
    providerCalls,
    aiCalls,
    fetchedAt: entry.fetchedAt,
    analyzedAt: entry.analyzedAt,
  };
}
