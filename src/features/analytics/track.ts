/**
 * Camada mínima de analytics de produto.
 *
 * Regras (endurecidas também no banco, via RLS de `analytics_events`):
 *  - lista fixa de eventos (`ANALYTICS_KINDS`), nada fora dela é enviado;
 *  - payload sanitizado: somente chaves permitidas e valores primitivos curtos;
 *  - nenhum dado pessoal (nome, empresa, e-mail, whatsapp, texto livre);
 *  - `actor_user_id` é definido pelo banco (trigger), nunca pelo cliente;
 *  - dedupe em memória para evitar duplicatas de re-render/retry.
 */
import { supabase } from "@/integrations/supabase/client";

export const ANALYTICS_KINDS = [
  "onboarding_started",
  "onboarding_completed",
  "ai_suggestion_requested",
  "ai_suggestion_accepted",
  "match_viewed",
  "match_decided",
  "connection_viewed",
] as const;

export type AnalyticsKind = (typeof ANALYTICS_KINDS)[number];

/** Chaves não sensíveis autorizadas no payload. */
export const ALLOWED_PAYLOAD_KEYS = [
  "match_id",
  "connection_id",
  "segment_id",
  "decision",
  "label",
  "score",
  "step",
  "source",
  "count",
  "accepted",
  "kind",
] as const;

/** Chaves explicitamente bloqueadas mesmo se alguém tentar enviá-las. */
export const PII_KEYS = [
  "name",
  "nome",
  "email",
  "e_mail",
  "whatsapp",
  "phone",
  "telefone",
  "company",
  "empresa",
  "summary",
  "resumo",
  "text",
  "texto",
  "note",
  "city",
  "cidade",
  "neighborhood",
  "recovery_code",
] as const;

export type AnalyticsPrimitive = string | number | boolean;
export type AnalyticsPayload = Record<string, unknown>;
export type SanitizedPayload = Record<string, AnalyticsPrimitive>;

const allowed = new Set<string>(ALLOWED_PAYLOAD_KEYS);
const blocked = new Set<string>(PII_KEYS);

const MAX_STRING = 64;
const MAX_KEYS = 8;

export function isAnalyticsKind(kind: string): kind is AnalyticsKind {
  return (ANALYTICS_KINDS as readonly string[]).includes(kind);
}

/** Mantém apenas chaves permitidas com valores primitivos curtos. */
export function sanitizePayload(payload: AnalyticsPayload | undefined): SanitizedPayload {
  if (!payload || typeof payload !== "object") return {};
  const out: SanitizedPayload = {};
  for (const [key, value] of Object.entries(payload)) {
    if (Object.keys(out).length >= MAX_KEYS) break;
    if (blocked.has(key) || !allowed.has(key)) continue;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) continue;
      out[key] = trimmed.slice(0, MAX_STRING);
    } else if (typeof value === "number" && Number.isFinite(value)) {
      out[key] = value;
    } else if (typeof value === "boolean") {
      out[key] = value;
    }
  }
  return out;
}

export interface TrackInput {
  kind: string;
  eventId: string;
  profileId?: string | null;
  payload?: AnalyticsPayload;
  /** Chave de dedupe; por padrão kind + payload serializado. */
  dedupeKey?: string;
  /** Ignora o dedupe (eventos repetíveis por natureza). */
  repeatable?: boolean;
}

export interface TrackResult {
  sent: boolean;
  reason?: "invalid_kind" | "duplicate" | "error" | "no_event";
}

const seen = new Set<string>();

/** Uso em testes. */
export function resetAnalyticsDedupe() {
  seen.clear();
}

/**
 * Registra um evento de produto. Nunca lança: analytics jamais deve quebrar o
 * fluxo do usuário.
 */
export async function trackEvent(input: TrackInput): Promise<TrackResult> {
  if (!isAnalyticsKind(input.kind)) return { sent: false, reason: "invalid_kind" };
  if (!input.eventId) return { sent: false, reason: "no_event" };

  const payload = sanitizePayload(input.payload);
  const dedupeKey = input.dedupeKey ?? `${input.kind}:${JSON.stringify(payload)}`;

  if (!input.repeatable) {
    if (seen.has(dedupeKey)) return { sent: false, reason: "duplicate" };
    seen.add(dedupeKey);
  }

  try {
    const { error } = await supabase.from("analytics_events").insert({
      kind: input.kind,
      event_id: input.eventId,
      profile_id: input.profileId ?? null,
      payload,
    });
    if (error) {
      if (!input.repeatable) seen.delete(dedupeKey);
      return { sent: false, reason: "error" };
    }
    return { sent: true };
  } catch {
    if (!input.repeatable) seen.delete(dedupeKey);
    return { sent: false, reason: "error" };
  }
}

/** Versão fire-and-forget para handlers de UI. */
export function track(input: TrackInput): void {
  void trackEvent(input);
}
