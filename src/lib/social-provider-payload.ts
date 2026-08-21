/**
 * Payload BRUTO do provider (Apify) transformado em patrimônio do backend.
 *
 * Regras:
 * - guardamos TODOS os campos de dados devolvidos pelo Actor (perfil + posts),
 *   mesmo os que a IA não usa hoje;
 * - NUNCA guardamos segredo: qualquer chave equivalente a token/authorization/
 *   apiToken/api_key/cookie/set-cookie/secret/password é removida
 *   recursivamente, assim como URLs que carreguem `token=`;
 * - o payload é medido; acima do teto ele é reduzido (perfil + posts
 *   escolhidos) e marcado como `truncated`, sem nunca quebrar o cadastro.
 *
 * Este módulo é PURO (sem rede, sem env) para ser testável de forma
 * determinística.
 */

/** Versão do contrato de payload persistido — muda quando o shape muda. */
export const PROVIDER_PAYLOAD_VERSION = "apify/instagram-profile-scraper@1";

/** Chaves proibidas (comparação por igualdade OU substring, case-insensitive). */
export const SECRET_KEY_FRAGMENTS = [
  "token",
  "authorization",
  "apikey",
  "api_key",
  "cookie",
  "set-cookie",
  "secret",
  "password",
  "passwd",
  "credential",
  "session_id",
  "sessionid",
] as const;

export function isSecretKey(key: string): boolean {
  const k = key.toLowerCase().replace(/[\s-]/g, "");
  return SECRET_KEY_FRAGMENTS.some((f) => k.includes(f.replace(/[\s-]/g, "")));
}

const URL_SECRET_RE = /([?&#])(token|api_?key|access_?token|signature|sig|secret)=[^&#\s]*/gi;

function scrubUrlLike(value: string): string {
  return value.replace(URL_SECRET_RE, "$1$2=[redacted]");
}

const MAX_DEPTH = 12;

/** Remove recursivamente qualquer campo sensível do payload do Actor. */
export function stripSecrets(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return null;
  if (Array.isArray(value)) return value.map((v) => stripSecrets(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (isSecretKey(k)) continue;
      out[k] = stripSecrets(v, depth + 1);
    }
    return out;
  }
  if (typeof value === "string") return scrubUrlLike(value);
  return value;
}

export interface ProviderPayloadSnapshot {
  /** Resposta de dados do Actor, saneada. Nunca headers/cookies/credenciais. */
  payload: Record<string, unknown>;
  version: string;
  bytes: number;
  truncated: boolean;
  /** Quantos posts vieram do provider (antes de qualquer redução). */
  postsReceived: number;
  /** Quantos posts continuam no payload persistido. */
  postsPersisted: number;
  fetchedAt: string;
}

export function byteLength(value: unknown): number {
  try {
    const json = JSON.stringify(value) ?? "";
    return new TextEncoder().encode(json).length;
  } catch {
    return 0;
  }
}

export interface BuildProviderPayloadOptions {
  maxBytes: number;
  /** Posts que precisam sobreviver mesmo em truncamento (os usados pela IA). */
  keepPosts: number;
  fetchedAt?: string;
}

/**
 * Monta o snapshot persistível a partir do item bruto do Actor.
 * Nunca lança: em qualquer problema devolve um snapshot vazio truncado.
 */
export function buildProviderPayloadSnapshot(
  rawItem: unknown,
  opts: BuildProviderPayloadOptions,
): ProviderPayloadSnapshot {
  const fetchedAt = opts.fetchedAt ?? new Date().toISOString();
  const clean = stripSecrets(rawItem);
  if (!clean || typeof clean !== "object" || Array.isArray(clean)) {
    return {
      payload: {},
      version: PROVIDER_PAYLOAD_VERSION,
      bytes: 0,
      truncated: true,
      postsReceived: 0,
      postsPersisted: 0,
      fetchedAt,
    };
  }
  const item = clean as Record<string, unknown>;
  const posts = Array.isArray(item["latestPosts"]) ? (item["latestPosts"] as unknown[]) : [];
  const postsReceived = posts.length;

  let bytes = byteLength(item);
  if (bytes <= opts.maxBytes) {
    return {
      payload: item,
      version: PROVIDER_PAYLOAD_VERSION,
      bytes,
      truncated: false,
      postsReceived,
      postsPersisted: postsReceived,
      fetchedAt,
    };
  }

  // Redução progressiva: mantém o perfil íntegro e vai cortando posts, sem
  // jamais descer abaixo dos posts que alimentam a IA.
  const floor = Math.max(1, Math.min(opts.keepPosts, postsReceived));
  let kept = postsReceived;
  let reduced: Record<string, unknown> = item;
  while (kept > floor) {
    kept = Math.max(floor, Math.floor(kept / 2));
    reduced = { ...item, latestPosts: posts.slice(0, kept) };
    bytes = byteLength(reduced);
    if (bytes <= opts.maxBytes) break;
  }
  if (bytes > opts.maxBytes) {
    reduced = { ...item, latestPosts: posts.slice(0, floor) };
    kept = Math.min(floor, postsReceived);
    bytes = byteLength(reduced);
  }
  return {
    payload: reduced,
    version: PROVIDER_PAYLOAD_VERSION,
    bytes,
    truncated: true,
    postsReceived,
    postsPersisted: kept,
    fetchedAt,
  };
}
