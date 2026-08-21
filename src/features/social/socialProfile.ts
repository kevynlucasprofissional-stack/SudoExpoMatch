import { z } from "zod";
import {
  normalizeInstagramInput,
  socialBusinessContextSchema,
  socialContextFingerprint,
  type SocialBusinessContext,
} from "@/lib/social-context";

/**
 * Persistência do contexto social (Instagram) do participante.
 *
 * Regra de ouro: só trafega dado ESTRUTURADO e curto. Nada de HTML bruto,
 * cookie, token ou resposta ilimitada do provider — a construção do payload
 * é feita exclusivamente a partir do `SocialBusinessContext` já saneado.
 */

/** Chaves proibidas em qualquer payload persistido/consumido. */
export const FORBIDDEN_SOCIAL_KEYS = [
  "html",
  "raw",
  "cookie",
  "token",
  "access_token",
  "secret",
  "authorization",
  "apikey",
  "api_key",
] as const;

export function hasForbiddenSocialKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasForbiddenSocialKey);
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const key = k.toLowerCase();
      if (FORBIDDEN_SOCIAL_KEYS.some((f) => key === f || key.includes(f))) return true;
      if (hasForbiddenSocialKey(v)) return true;
    }
  }
  return false;
}

export const socialLinkPayloadSchema = z.object({
  event_id: z.string().min(1),
  network: z.literal("instagram"),
  /** `null` = remover o vínculo atual. */
  handle: z.string().min(1).max(30).nullable(),
  original_input: z.string().max(300).nullable(),
  last_status: z.enum(["ok", "informed"]),
});
export type SocialLinkPayload = z.infer<typeof socialLinkPayloadSchema>;

/**
 * Monta o payload da RPC `link_own_social_profile`.
 *
 * REGRA DE OURO (correção da CAUSA A): o cliente NÃO envia snapshot de
 * contexto. O cache global (`private.social_profile_cache`) é autoridade do
 * SERVIDOR/PROVIDER. Aqui só informamos QUAL handle o participante quer
 * associar; o servidor liga o perfil ao cache canônico já existente.
 *
 * - Instagram vazio/inválido → payload de remoção (`handle: null`).
 * - Instagram informado sem análise → `informed`.
 * - Contexto disponível para o MESMO handle → `ok` (apenas sinaliza que o
 *   servidor já tem contexto para esse @; nenhum dado é reenviado).
 */
export function buildSocialLinkPayload(args: {
  eventId: string;
  instagram: string | null | undefined;
  context?: SocialBusinessContext | null;
}): SocialLinkPayload {
  const raw = (args.instagram ?? "").trim();
  const norm = normalizeInstagramInput(raw);
  if (!norm.ok) {
    return socialLinkPayloadSchema.parse({
      event_id: args.eventId,
      network: "instagram",
      handle: null,
      original_input: raw ? raw.slice(0, 300) : null,
      last_status: "informed",
    });
  }

  const ctxParsed = args.context ? socialBusinessContextSchema.safeParse(args.context) : null;
  const ctx = ctxParsed?.success && ctxParsed.data.handle === norm.handle ? ctxParsed.data : null;

  return socialLinkPayloadSchema.parse({
    event_id: args.eventId,
    network: "instagram",
    handle: norm.handle,
    original_input: raw.slice(0, 300),
    last_status: ctx ? "ok" : "informed",
  });
}


// ------------------------------------------------------------- leitura
const jsonRecord = z.record(z.string(), z.unknown()).nullable().default(null);

export const socialCacheViewSchema = z.object({
  network: z.string(),
  handle: z.string(),
  canonical_url: z.string().nullable().default(null),
  provider: z.string().nullable().default(null),
  provider_version: z.string().nullable().default(null),
  public_profile: jsonRecord,
  extracted_context: jsonRecord,
  ai_analysis: jsonRecord,
  ai_prompt_version: z.string().nullable().default(null),
  ai_model: z.string().nullable().default(null),
  content_fingerprint: z.string().nullable().default(null),
  fetched_at: z.string().nullable().default(null),
  analyzed_at: z.string().nullable().default(null),
  expires_at: z.string().nullable().default(null),
  last_status: z.string().nullable().default(null),
  last_error_code: z.string().nullable().default(null),
  updated_at: z.string().nullable().default(null),
  // Métricas do patrimônio bruto guardado no backend (nunca o JSON completo).
  provider_posts_received: z.number().int().nullable().default(null).optional(),
  provider_posts_persisted: z.number().int().nullable().default(null).optional(),
  ai_posts_used: z.number().int().nullable().default(null).optional(),
  provider_payload_version: z.string().nullable().default(null).optional(),
  provider_payload_bytes: z.number().int().nullable().default(null).optional(),
  provider_payload_truncated: z.boolean().nullable().default(null).optional(),
  context_schema_version: z.string().nullable().default(null).optional(),
});


export const socialLinkViewSchema = z.object({
  network: z.string(),
  handle: z.string(),
  original_input: z.string().nullable().default(null),
  canonical_url: z.string().nullable().default(null),
  context_snapshot: jsonRecord,
  analysis_snapshot: jsonRecord.optional(),
  linked_at: z.string().nullable().default(null),
  updated_at: z.string().nullable().default(null),
  cache: socialCacheViewSchema.nullable().default(null),
});

export const participantSocialSchema = z.object({
  profile: z.object({
    id: z.string().uuid(),
    event_id: z.string(),
    business_size: z.string().nullable().default(null),
    business_type: z.string().nullable().default(null),
    niche: z.string().nullable().default(null),
    segment_id: z.string().nullable().default(null),
    summary: z.string().nullable().default(null),
  }),
  social: socialLinkViewSchema.nullable().default(null),
});
export type ParticipantSocial = z.infer<typeof participantSocialSchema>;

export const ownSocialProfileSchema = z
  .object({
    network: z.string(),
    handle: z.string(),
    original_input: z.string().nullable().default(null),
    canonical_url: z.string().nullable().default(null),
    context_snapshot: jsonRecord,
    linked_at: z.string().nullable().default(null),
    updated_at: z.string().nullable().default(null),
  })
  .nullable();

/** Lê uma lista de strings de um JSONB estruturado, com teto defensivo. */
export function readStringList(source: unknown, key: string, max = 20): string[] {
  if (!source || typeof source !== "object") return [];
  const value = (source as Record<string, unknown>)[key];
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.trim().length > 0).slice(0, max);
}

export function readText(source: unknown, key: string): string | null {
  if (!source || typeof source !== "object") return null;
  const value = (source as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value : null;
}

