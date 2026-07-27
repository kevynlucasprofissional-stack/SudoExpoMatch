import { supabase } from "@/integrations/supabase/client";
import { ensureParticipantSession } from "./session";
import {
  ownProfileOrNullSchema,
  saveOwnProfilePayloadSchema,
} from "./schemas";
import type {
  OwnProfileDTO,
  SaveOwnProfileInput,
  ErrorCode,
} from "./types";

/**
 * Extrai um código sanitizado a partir da mensagem retornada pelo Postgres.
 * Nunca devolve payload/mensagem original.
 */
export function extractErrorCode(
  message: string | undefined,
  fallback: ErrorCode = "unknown",
): ErrorCode {
  if (!message) return fallback;
  const codes: ErrorCode[] = [
    "not_authenticated",
    "consent_required",
    "event_not_active",
    "missing_fields",
    "field_too_long",
    "invalid_segment",
    "invalid_offers_count",
    "invalid_needs_count",
    "invalid_input",
    "invalid_code",
    "not_found",
    "no_recovery",
    "recovery_not_configured",
    "demo_not_recoverable",
    "current_user_already_has_profile",
    "locked",
    "rate_limited",
    "match_not_found",
    "match_inactive",
    "not_a_participant",
    "decision_locked_by_connection",
    "profile_not_found",
    "reveal_forbidden",
    "not_mutual",
    "not_yet_introduced",
    "contact_sharing_disabled",
    "contact_unavailable",
  ];
  for (const c of codes) if (message.includes(c)) return c;
  if (/network|fetch|Failed to fetch/i.test(message)) return "network";
  return fallback;
}

export class ApiError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode) {
    super(code);
    this.code = code;
    this.name = "ApiError";
  }
}

export async function getOwnProfile(eventId: string): Promise<OwnProfileDTO | null> {
  await ensureParticipantSession();
  const { data, error } = await supabase.rpc("get_own_profile_v2", {
    _event_id: eventId,
  });
  if (error) throw new ApiError(extractErrorCode(error.message));
  const parsed = ownProfileOrNullSchema.safeParse(data);
  if (!parsed.success) throw new ApiError("invalid_response");
  return parsed.data;
}

export async function saveOwnProfile(
  input: SaveOwnProfileInput,
): Promise<string> {
  await ensureParticipantSession();
  const payload = saveOwnProfilePayloadSchema.parse({
    event_id: input.eventId,
    name: input.name,
    company: input.company,
    city: input.city,
    neighborhood: input.neighborhood ?? null,
    segment_id: input.segmentId,
    summary: input.summary,
    consent: input.consent as true,
    policy_version: "1",
    offers: input.offers.map((o) => ({
      label: o.label,
      detail: o.detail ?? null,
      segment_id: o.segment_id,
      taxonomy_item_id: o.taxonomy_item_id,
      source: o.source ?? "user",
    })),
    needs: input.needs.map((n) => ({
      label: n.label,
      detail: n.detail ?? null,
      segment_id: n.segment_id,
      taxonomy_item_id: n.taxonomy_item_id,
      need_kind: n.need_kind,
      is_priority: n.is_priority ?? false,
      source: n.source ?? "user",
    })),
  });
  const { data, error } = await supabase.rpc("save_own_profile_v2", {
    _payload: payload,
  });
  if (error) throw new ApiError(extractErrorCode(error.message));
  if (typeof data !== "string") throw new ApiError("invalid_response");
  return data;
}

export async function setOwnContact(input: {
  phone_e164: string;
  email?: string | null;
  sharing?: boolean;
}): Promise<void> {
  await ensureParticipantSession();
  const { error } = await supabase.rpc("set_own_contact", {
    _phone_e164: input.phone_e164,
    _email: input.email ?? undefined,
    _sharing: input.sharing ?? true,
  });
  if (error) throw new ApiError(extractErrorCode(error.message));
}

export async function rotateOwnRecoveryCode(): Promise<string> {
  await ensureParticipantSession();
  const { data, error } = await supabase.rpc("rotate_own_recovery_code");
  if (error) throw new ApiError(extractErrorCode(error.message));
  if (typeof data !== "string" || data.length < 4) {
    throw new ApiError("invalid_response");
  }
  return data;
}
