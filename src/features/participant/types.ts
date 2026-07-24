import type {
  NeedKind,
  MatchKind,
  MatchLabel,
  Decision,
  ConnectionStatus,
} from "@/lib/types";

// ---------- Perfil próprio ----------
export interface OwnProfileOffer {
  id: string;
  label: string;
  detail: string | null;
  segment_id: string;
  taxonomy_item_id: string | null;
}
export interface OwnProfileNeed extends OwnProfileOffer {
  need_kind: NeedKind;
  is_priority: boolean;
}
export interface OwnProfileDTO {
  id: string;
  event_id: string;
  name: string;
  company: string;
  city: string;
  neighborhood: string | null;
  segment_id: string;
  summary: string;
  consent: boolean;
  created_at: string;
  updated_at: string;
  offers: OwnProfileOffer[];
  needs: OwnProfileNeed[];
}

// ---------- Matches ----------
export interface OwnMatchReason {
  code: string;
  label: string;
  weight: number;
}
export interface OwnMatchOffer {
  label: string;
  detail: string | null;
}
export interface OwnMatchNeed extends OwnMatchOffer {
  need_kind: NeedKind;
  is_priority: boolean;
}
export interface OwnMatchOther {
  name: string;
  company: string;
  city: string;
  neighborhood: string | null;
  segment_id: string;
  summary: string;
}
export interface OwnMatchConnection {
  id: string;
  status: ConnectionStatus;
  notes: string | null;
}
export interface OwnMatchDTO {
  match_id: string;
  my_profile_id: string;
  other_profile_id: string;
  kind: MatchKind;
  label: MatchLabel;
  score_me: number;
  score_other: number;
  created_at: string;
  updated_at: string;
  generated_at: string;
  other: OwnMatchOther;
  other_offers: OwnMatchOffer[];
  other_needs: OwnMatchNeed[];
  reasons: OwnMatchReason[];
  my_decision: Decision;
  other_decision: Decision;
  connection: OwnMatchConnection | null;
}

export interface DecideMatchResult {
  my_decision: Decision;
  other_decision: Decision;
  mutual: boolean;
  connection_id: string | null;
  connection_status: ConnectionStatus | null;
  connection_created: boolean;
}

// ---------- Salvamento ----------
export interface SaveOfferInput {
  label: string;
  detail?: string | null;
  segment_id: string;
  taxonomy_item_id: string | null;
}
export interface SaveNeedInput extends SaveOfferInput {
  need_kind: NeedKind;
  is_priority?: boolean;
}
export interface SaveOwnProfileInput {
  eventId: string;
  name: string;
  company: string;
  city: string;
  neighborhood?: string | null;
  segmentId: string;
  summary: string;
  consent: boolean;
  offers: SaveOfferInput[];
  needs: SaveNeedInput[];
}

// ---------- Catálogo ----------
export interface CatalogSegment {
  id: string;
  label: string;
  emoji: string | null;
}
export interface CatalogTaxonomyItem {
  id: string;
  segment_id: string;
  label: string;
  kind: "offer" | "need" | "both";
  synonyms: string[];
}
export interface EventCatalog {
  segments: CatalogSegment[];
  taxonomy: CatalogTaxonomyItem[];
}

// ---------- Recuperação ----------
export interface RecoverProfileInput {
  eventId: string;
  whatsapp: string;
  code: string;
}
export interface RecoverProfileResult {
  profileId: string;
  newRecoveryCode: string;
}

// ---------- Contato revelado ----------
export interface RevealedContactDTO {
  phone_e164: string;
  email: string | null;
  name: string;
  company: string;
}

/** Códigos sanitizados de erro que a UI pode traduzir sem vazar payload. */
export type ErrorCode =
  | "not_authenticated"
  | "sign_in_failed"
  | "consent_required"
  | "event_not_active"
  | "missing_fields"
  | "field_too_long"
  | "invalid_segment"
  | "invalid_offers_count"
  | "invalid_needs_count"
  | "invalid_input"
  | "invalid_code"
  | "not_found"
  | "no_recovery"
  | "recovery_not_configured"
  | "demo_not_recoverable"
  | "current_user_already_has_profile"
  | "locked"
  | "rate_limited"
  | "match_not_found"
  | "match_inactive"
  | "not_a_participant"
  | "decision_locked_by_connection"
  | "profile_not_found"
  | "reveal_forbidden"
  | "not_mutual"
  | "not_yet_introduced"
  | "contact_sharing_disabled"
  | "contact_unavailable"
  | "invalid_response"
  | "network"
  | "unknown";
