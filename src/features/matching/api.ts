import { supabase } from "@/integrations/supabase/client";
import { ensureParticipantSession } from "@/features/participant/session";
import { ApiError, extractErrorCode } from "@/features/participant/api";
import type {
  DecideMatchResult,
  OwnMatchDTO,
  RevealedContactDTO,
} from "@/features/participant/types";
import type { Decision } from "@/lib/types";
import {
  decideMatchResultSchema,
  ownMatchesSchema,
  recomputeResultSchema,
  revealedContactListSchema,
} from "./schemas";

export async function listOwnMatches(eventId: string): Promise<OwnMatchDTO[]> {
  await ensureParticipantSession();
  const { data, error } = await supabase.rpc("list_own_matches_v2", {
    _event_id: eventId,
  });
  if (error) throw new ApiError(extractErrorCode(error.message));
  const parsed = ownMatchesSchema.safeParse(data ?? []);
  if (!parsed.success) throw new ApiError("invalid_response");
  return parsed.data;
}

export async function recordMatchDecision(
  matchId: string,
  decision: Decision,
): Promise<DecideMatchResult> {
  await ensureParticipantSession();
  const { data, error } = await supabase.rpc("record_match_decision_v2", {
    _match_id: matchId,
    _decision: decision,
  });
  if (error) throw new ApiError(extractErrorCode(error.message));
  const parsed = decideMatchResultSchema.safeParse(data);
  if (!parsed.success) throw new ApiError("invalid_response");
  return parsed.data;
}

export async function recomputeOwnMatches(eventId: string): Promise<number> {
  await ensureParticipantSession();
  const { data, error } = await supabase.rpc("recompute_own_matches", {
    _event_id: eventId,
  });
  if (error) throw new ApiError(extractErrorCode(error.message));
  const parsed = recomputeResultSchema.safeParse(data);
  if (!parsed.success) throw new ApiError("invalid_response");
  return parsed.data;
}

export async function revealContactForMatch(matchId: string): Promise<RevealedContactDTO> {
  await ensureParticipantSession();
  const { data, error } = await supabase.rpc("reveal_contact_for_match", {
    _match_id: matchId,
  });
  if (error) throw new ApiError(extractErrorCode(error.message, "reveal_forbidden"));
  const parsed = revealedContactListSchema.safeParse(data ?? []);
  if (!parsed.success || parsed.data.length === 0) {
    throw new ApiError("invalid_response");
  }
  return parsed.data[0];
}
