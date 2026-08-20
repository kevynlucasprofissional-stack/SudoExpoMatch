import type { BusinessSize, BusinessType, WizardDraft, WizardNeed, WizardOffer } from "./types";
import { persistedDraftSchema, wizardDraftSchema } from "./schemas";
import { normalizeInstagramInput } from "@/lib/social-context";

export const WIZARD_DRAFT_KEY = "sudoexpo:wizard-draft:v2";
export const LEGACY_DRAFT_KEY = "sudoexpo:draft";
export const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** Número de etapas do wizard (0..MAX_STEP). */
export const MAX_STEP = 4;

const BUSINESS_SIZES = new Set<BusinessSize>(["pequeno", "medio", "grande"]);
const BUSINESS_TYPES = new Set<BusinessType>(["comercio", "industria", "servico"]);

export function createEmptyDraft(): WizardDraft {
  return {
    step: 0,
    name: "",
    company: "",
    city: "",
    neighborhood: "",
    businessSize: "",
    businessType: "",
    segmentId: "",
    niche: "",
    summary: "",
    instagram: "",
    offers: [],
    needs: [],
    consent: false,
  };
}

function sanitizeOffer(raw: unknown): WizardOffer | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const label = typeof r.label === "string" ? r.label : "";
  const segmentId = typeof r.segmentId === "string" ? r.segmentId : "";
  if (!label || !segmentId) return null;
  return {
    localId: typeof r.localId === "string" && r.localId ? r.localId : cryptoUid(),
    label: label.slice(0, 80),
    detail: typeof r.detail === "string" && r.detail ? r.detail.slice(0, 200) : undefined,
    segmentId: segmentId.slice(0, 60),
    taxonomyItemId:
      typeof r.taxonomyItemId === "string" && r.taxonomyItemId ? r.taxonomyItemId : null,
  };
}

function sanitizeNeed(raw: unknown): WizardNeed | null {
  const base = sanitizeOffer(raw);
  if (!base) return null;
  const r = raw as Record<string, unknown>;
  const allowedKinds = new Set([
    "servico",
    "fornecedor",
    "parceiro",
    "compradores",
    "distribuidores",
    "profissionais",
    "produtos",
    "outro",
  ]);
  const needKind =
    typeof r.needKind === "string" && allowedKinds.has(r.needKind)
      ? (r.needKind as WizardNeed["needKind"])
      : "outro";
  return {
    ...base,
    needKind,
    isPriority: r.isPriority === true,
  };
}

/**
 * Filtra propriedades perigosas/legadas e mantém apenas o shape v2.
 * Ignora silenciosamente qualquer chave extra (whatsapp, email, userId,
 * profileId, code, matches, decisions, contact, tokens, error, etc.).
 */
export function sanitizeWizardDraft(raw: unknown): WizardDraft {
  const empty = createEmptyDraft();
  if (!raw || typeof raw !== "object") return empty;
  const r = raw as Record<string, unknown>;
  const stepRaw = typeof r.step === "number" ? r.step : 0;
  const step = Math.min(MAX_STEP, Math.max(0, Math.floor(stepRaw)));
  const offers = Array.isArray(r.offers)
    ? (r.offers.map(sanitizeOffer).filter(Boolean) as WizardOffer[]).slice(0, 5)
    : [];
  const needs = Array.isArray(r.needs)
    ? (r.needs.map(sanitizeNeed).filter(Boolean) as WizardNeed[]).slice(0, 5)
    : [];
  return {
    step,
    name: typeof r.name === "string" ? r.name.slice(0, 120) : "",
    company: typeof r.company === "string" ? r.company.slice(0, 120) : "",
    city: typeof r.city === "string" ? r.city.slice(0, 80) : "",
    neighborhood: typeof r.neighborhood === "string" ? r.neighborhood.slice(0, 80) : "",
    businessSize:
      typeof r.businessSize === "string" && BUSINESS_SIZES.has(r.businessSize as BusinessSize)
        ? (r.businessSize as BusinessSize)
        : "",
    businessType:
      typeof r.businessType === "string" && BUSINESS_TYPES.has(r.businessType as BusinessType)
        ? (r.businessType as BusinessType)
        : "",
    segmentId: typeof r.segmentId === "string" ? r.segmentId.slice(0, 60) : "",
    niche: typeof r.niche === "string" ? r.niche.slice(0, 120) : "",
    summary: typeof r.summary === "string" ? r.summary.slice(0, 500) : "",
    instagram: normalizeDraftInstagram(r.instagram),
    offers,
    needs,
    consent: r.consent === true,
  };
}

/** Persistimos apenas o handle normalizado — nunca conteúdo raspado. */
function normalizeDraftInstagram(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) return "";
  const norm = normalizeInstagramInput(raw);
  return norm.ok ? `@${norm.handle}` : raw.trim().slice(0, 300);
}

function safeStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Remove chave legada `sudoexpo:draft`. */
export function purgeLegacyDraft(storage: Storage | null = safeStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(LEGACY_DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

export function clearWizardDraft(storage: Storage | null = safeStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(WIZARD_DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

export function saveWizardDraft(
  draft: WizardDraft,
  now: number = Date.now(),
  storage: Storage | null = safeStorage(),
): void {
  if (!storage) return;
  const clean = sanitizeWizardDraft(draft);
  try {
    storage.setItem(
      WIZARD_DRAFT_KEY,
      JSON.stringify({
        version: 4 as const,
        savedAt: new Date(now).toISOString(),
        draft: clean,
      }),
    );
  } catch {
    /* ignore */
  }
}

export interface LoadedDraft {
  draft: WizardDraft;
  savedAt: string;
}

export function loadWizardDraft(
  now: number = Date.now(),
  storage: Storage | null = safeStorage(),
): LoadedDraft | null {
  purgeLegacyDraft(storage);
  if (!storage) return null;
  let raw: string | null = null;
  try {
    raw = storage.getItem(WIZARD_DRAFT_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    clearWizardDraft(storage);
    return null;
  }
  const envelope = persistedDraftSchema.safeParse(parsed);
  if (!envelope.success) {
    clearWizardDraft(storage);
    return null;
  }
  const savedAtMs = Date.parse(envelope.data.savedAt);
  if (!Number.isFinite(savedAtMs) || now - savedAtMs > DRAFT_MAX_AGE_MS) {
    clearWizardDraft(storage);
    return null;
  }
  return {
    draft: sanitizeWizardDraft(envelope.data.draft),
    savedAt: envelope.data.savedAt,
  };
}

export function hasValidWizardDraft(
  now: number = Date.now(),
  storage: Storage | null = safeStorage(),
): boolean {
  return loadWizardDraft(now, storage) !== null;
}

/** UUID leve tolerante a ambientes de teste. */
export function cryptoUid(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return (crypto as Crypto).randomUUID();
    }
  } catch {
    /* ignore */
  }
  return "wid-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Debug helper — usado em teste para provar que chaves extras são filtradas. */
export function draftAllowedKeys(): ReadonlyArray<keyof WizardDraft> {
  return [
    "step",
    "name",
    "company",
    "city",
    "neighborhood",
    "businessSize",
    "businessType",
    "segmentId",
    "niche",
    "summary",
    "instagram",
    "offers",
    "needs",
    "consent",
  ];
}

// Marker to keep zod schemas linked (avoids tree-shake surprises in tests).
export const __draftSchemaShape = wizardDraftSchema;
