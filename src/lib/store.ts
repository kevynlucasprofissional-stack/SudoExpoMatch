// Repositório híbrido: cache em memória/localStorage + persistência real via RPCs Supabase.
// Fase 1: leitura/escrita passam por RPCs SECURITY DEFINER; anon sign-in garante auth.uid().
// Colunas whatsapp/recovery_code em public.profiles estão deprecated e não são mais lidas do cliente.

import { useMemo, useRef, useSyncExternalStore } from "react";

import { EVENT_ID, SEGMENTS, TAXONOMY } from "./mock-data";
import { computeMatchesFor } from "@/domains/matching/score";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type {
  Connection,
  Decision,
  Match,
  MatchKind,
  MatchLabel,
  MatchReason,
  NeedItem,
  OfferItem,
  Profile,
} from "./types";

const KEY = "sudoexpo:v3";

interface DB {
  profiles: Profile[];
  matches: Match[];
  connections: Connection[];
}

function isBrowser() {
  return typeof window !== "undefined";
}
function uid() {
  if (isBrowser() && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const EMPTY: DB = { profiles: [], matches: [], connections: [] };

let cache: DB | null = null;
let hydrated = false;
let hydrating: Promise<void> | null = null;
let ownProfileId: string | null = null;

let dbVersion = 0;
let sessionVersion = 0;
let lastDbSignature = "";

function loadCache(): DB {
  if (cache) return cache;
  if (!isBrowser()) return EMPTY;
  try {
    const raw = window.localStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as DB) : { ...EMPTY };
    lastDbSignature = raw ?? "";
  } catch {
    cache = { ...EMPTY };
    lastDbSignature = "";
  }
  return cache!;
}
function persist() {
  if (!isBrowser() || !cache) return;
  const json = JSON.stringify(cache);
  if (json === lastDbSignature) return;
  lastDbSignature = json;
  window.localStorage.setItem(KEY, json);
  dbVersion++;
  window.dispatchEvent(new CustomEvent("sudoexpo:db"));
}

// -------- Auth: sessão anônima ----------
let ensuringAuth: Promise<void> | null = null;
async function ensureAnonSession() {
  if (!isBrowser()) return;
  if (ensuringAuth) return ensuringAuth;
  ensuringAuth = (async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) return;
    try {
      await supabase.auth.signInAnonymously();
    } catch (err) {
      console.warn("[sudoexpo] anon sign-in falhou:", err);
    }
  })();
  return ensuringAuth;
}

// -------- Mapping --------
type CardRow = {
  id: string;
  event_id: string;
  name: string;
  company: string;
  city: string;
  neighborhood: string | null;
  segment_id: string;
  summary: string;
  offers: unknown;
  needs: unknown;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
};
function fromCard(r: CardRow): Profile {
  return {
    id: r.id,
    eventId: r.event_id,
    name: r.name,
    company: r.company,
    city: r.city,
    neighborhood: r.neighborhood ?? undefined,
    whatsapp: "", // não exposto pelo Data API na Fase 1
    segmentId: r.segment_id,
    summary: r.summary,
    offers: (r.offers as OfferItem[]) ?? [],
    needs: (r.needs as NeedItem[]) ?? [],
    consent: true,
    isDemo: r.is_demo,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    recoveryCode: "", // só é exposto uma vez após rotate
  };
}

type DBMatch = Database["public"]["Tables"]["matches"]["Row"];
type DBConnection = Database["public"]["Tables"]["connections"]["Row"];

function fromDBMatch(r: DBMatch): Match {
  return {
    id: r.id,
    eventId: r.event_id,
    aProfileId: r.a_profile_id,
    bProfileId: r.b_profile_id,
    kind: r.kind as MatchKind,
    scoreForA: r.score_for_a,
    scoreForB: r.score_for_b,
    label: r.label as MatchLabel,
    reasonsForA: (r.reasons_for_a as unknown as MatchReason[]) ?? [],
    reasonsForB: (r.reasons_for_b as unknown as MatchReason[]) ?? [],
    decisionA: r.decision_a as Decision,
    decisionB: r.decision_b as Decision,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}
function fromDBConnection(r: DBConnection): Connection {
  return {
    id: r.id,
    matchId: r.match_id,
    eventId: r.event_id,
    aProfileId: r.a_profile_id,
    bProfileId: r.b_profile_id,
    status: r.status as Connection["status"],
    notes: r.notes ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function orderedPair(a: string, b: string): [string, string, boolean] {
  return a < b ? [a, b, false] : [b, a, true];
}

async function hydrate() {
  if (!isBrowser() || hydrated) return;
  if (hydrating) return hydrating;
  hydrating = (async () => {
    try {
      await ensureAnonSession();
      const [cardsRes, matchesRes, connsRes] = await Promise.all([
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase.rpc as any)("list_event_profile_cards", { _event_id: EVENT_ID }),
        supabase.from("matches").select("*").eq("event_id", EVENT_ID),
        supabase.from("connections").select("*").eq("event_id", EVENT_ID),
      ]);
      const db = loadCache();
      db.profiles = ((cardsRes.data ?? []) as CardRow[]).map(fromCard);
      db.matches = (matchesRes.data ?? []).map(fromDBMatch);
      db.connections = (connsRes.data ?? []).map(fromDBConnection);
      hydrated = true;
      // Localiza próprio perfil pelo auth.uid()
      const { data: u } = await supabase.auth.getUser();
      if (u.user) {
        const { data: mine } = await supabase
          .from("profiles")
          .select("id")
          .eq("owner_id", u.user.id)
          .eq("event_id", EVENT_ID)
          .eq("is_demo", false)
          .maybeSingle();
        if (mine) ownProfileId = mine.id;
      }
      persist();
      subscribeRealtime();
    } catch (err) {
      console.warn("[sudoexpo] hydrate falhou:", err);
    } finally {
      hydrating = null;
    }
  })();
  return hydrating;
}

let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;
function subscribeRealtime() {
  if (!isBrowser() || realtimeChannel) return;
  realtimeChannel = supabase
    .channel("sudoexpo-live")
    .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, () => refreshTable("matches"))
    .on("postgres_changes", { event: "*", schema: "public", table: "connections" }, () => refreshTable("connections"))
    .subscribe();
}
async function refreshTable(t: "matches" | "connections") {
  const db = loadCache();
  if (t === "matches") {
    const { data } = await supabase.from("matches").select("*").eq("event_id", EVENT_ID);
    db.matches = (data ?? []).map(fromDBMatch);
  } else {
    const { data } = await supabase.from("connections").select("*").eq("event_id", EVENT_ID);
    db.connections = (data ?? []).map(fromDBConnection);
  }
  persist();
}
async function refreshCards() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase.rpc as any)("list_event_profile_cards", { _event_id: EVENT_ID });
  const db = loadCache();
  db.profiles = ((data ?? []) as CardRow[]).map(fromCard);
  persist();
}

if (isBrowser()) {
  loadCache();
  void hydrate();
}

// -------- Helpers de escrita via RPC --------
async function callUpsertOwnProfile(p: {
  eventId: string; name: string; company: string; city: string;
  neighborhood?: string; segmentId: string; summary: string; consent: boolean;
  offers: OfferItem[]; needs: NeedItem[];
}): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("upsert_own_profile", {
    _event_id: p.eventId,
    _name: p.name,
    _company: p.company,
    _city: p.city,
    _neighborhood: p.neighborhood ?? null,
    _segment_id: p.segmentId,
    _summary: p.summary,
    _consent: p.consent,
    _offers: p.offers,
    _needs: p.needs,
  });
  if (error) throw error;
  return data as string;
}
async function callSetOwnContact(phone: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.rpc as any)("set_own_contact", { _phone_e164: phone, _email: null, _sharing: true });
  if (error) throw error;
}
async function callRotateRecovery(): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("rotate_own_recovery_code");
  if (error) throw error;
  return data as string;
}
async function callStoreMatches(rows: Match[]) {
  if (rows.length === 0) return;
  const payload = rows.map((m) => {
    const [a, b, swapped] = orderedPair(m.aProfileId, m.bProfileId);
    return {
      event_id: m.eventId,
      a_profile_id: a,
      b_profile_id: b,
      kind: m.kind,
      score_for_a: swapped ? m.scoreForB : m.scoreForA,
      score_for_b: swapped ? m.scoreForA : m.scoreForB,
      label: m.label,
      reasons_for_a: swapped ? m.reasonsForB : m.reasonsForA,
      reasons_for_b: swapped ? m.reasonsForA : m.reasonsForB,
    };
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.rpc as any)("store_computed_matches", { _matches: payload });
  if (error) console.warn("[sudoexpo] store_computed_matches:", error.message);
}
async function callRecordDecision(matchId: string, decision: Decision) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.rpc as any)("record_match_decision", { _match_id: matchId, _decision: decision });
  if (error) console.warn("[sudoexpo] record_match_decision:", error.message);
}

export const store = {
  hydrate,
  isHydrated: () => hydrated,
  ownProfileId: () => ownProfileId,
  async reset() {
    if (!isBrowser()) return;
    window.localStorage.removeItem(KEY);
    cache = { ...EMPTY };
    lastDbSignature = "";
    hydrated = false;
    ownProfileId = null;
    await supabase.auth.signOut();
    ensuringAuth = null;
    dbVersion++; sessionVersion++;
    window.dispatchEvent(new CustomEvent("sudoexpo:db"));
    window.dispatchEvent(new CustomEvent("sudoexpo:session"));
    void hydrate();
  },

  /** Retorna a conexão associada a um match, se já existir. */
  connectionForMatch(matchId: string): Connection | undefined {
    return loadCache().connections.find((c) => c.matchId === matchId);
  },

  all(): DB { return loadCache(); },
  listProfiles(): Profile[] { return loadCache().profiles; },
  getProfile(id: string): Profile | undefined {
    return loadCache().profiles.find((p) => p.id === id);
  },

  /**
   * Cria/atualiza o próprio perfil via RPC segura.
   * Retorna Profile enriquecido com recoveryCode (mostrado UMA vez).
   */
  async createProfile(
    input: Omit<Profile, "id" | "createdAt" | "updatedAt" | "recoveryCode" | "eventId">,
  ): Promise<Profile> {
    await ensureAnonSession();
    const id = await callUpsertOwnProfile({
      eventId: EVENT_ID,
      name: input.name,
      company: input.company,
      city: input.city,
      neighborhood: input.neighborhood,
      segmentId: input.segmentId,
      summary: input.summary,
      consent: input.consent,
      offers: input.offers,
      needs: input.needs,
    });
    if (input.whatsapp) {
      try { await callSetOwnContact(input.whatsapp); }
      catch (err) { console.warn("[sudoexpo] set_own_contact:", err); }
    }
    let code = "";
    try { code = await callRotateRecovery(); }
    catch (err) { console.warn("[sudoexpo] rotate_recovery:", err); }
    ownProfileId = id;
    await refreshCards();
    // Recalcula matches localmente e envia via RPC
    await recomputeMatchesFor(id);
    const p = loadCache().profiles.find((x) => x.id === id);
    // recoveryCode fica APENAS em memória, retornado uma única vez ao chamador.
    return { ...(p ?? ({} as Profile)), id, recoveryCode: code, whatsapp: input.whatsapp };
  },

  async updateProfile(id: string, patch: Partial<Profile>): Promise<Profile | undefined> {
    const cur = loadCache().profiles.find((p) => p.id === id);
    if (!cur) return undefined;
    const merged = { ...cur, ...patch };
    await callUpsertOwnProfile({
      eventId: merged.eventId,
      name: merged.name, company: merged.company, city: merged.city,
      neighborhood: merged.neighborhood, segmentId: merged.segmentId,
      summary: merged.summary, consent: merged.consent,
      offers: merged.offers, needs: merged.needs,
    });
    if (patch.whatsapp) await callSetOwnContact(patch.whatsapp).catch(console.warn);
    await refreshCards();
    await recomputeMatchesFor(id);
    return loadCache().profiles.find((p) => p.id === id);
  },

  /**
   * Recuperação segura via RPC (hash comparado no servidor + rate limit).
   */
  async recoverProfile(whatsapp: string, code: string): Promise<Profile | undefined> {
    await ensureAnonSession();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.rpc as any)("recover_profile", {
      _event_id: EVENT_ID,
      _phone_e164: whatsapp,
      _code: code,
    });
    if (error) return undefined;
    const pid = data as string;
    ownProfileId = pid;
    await refreshCards();
    return loadCache().profiles.find((p) => p.id === pid);
  },

  // Compat: caller síncrono legado — retorna undefined; use recoverProfile()
  findByRecovery(_w: string, _c: string): Profile | undefined { return undefined; },

  matchesFor(profileId: string): Match[] {
    return loadCache().matches.filter(
      (m) => m.aProfileId === profileId || m.bProfileId === profileId,
    );
  },

  decideMatch(matchId: string, byProfileId: string, decision: Decision) {
    const db = loadCache();
    const idx = db.matches.findIndex((m) => m.id === matchId);
    if (idx < 0) return;
    const m = db.matches[idx];
    if (byProfileId === m.aProfileId) m.decisionA = decision;
    else if (byProfileId === m.bProfileId) m.decisionB = decision;
    m.updatedAt = new Date().toISOString();
    db.matches[idx] = m;
    persist();
    void callRecordDecision(matchId, decision).then(() => refreshTable("matches").then(() => refreshTable("connections")));
  },




  session: {
    /** ID do próprio perfil derivado de auth.uid(); localStorage é apenas dica. */
    get(): string | null {
      if (ownProfileId) return ownProfileId;
      if (!isBrowser()) return null;
      return null;
    },
    set(_profileId: string) { /* no-op: sessão vem do Supabase Auth */ },
    clear() {
      if (!isBrowser()) return;
      ownProfileId = null;
      void supabase.auth.signOut().then(() => { ensuringAuth = null; void hydrate(); });
      sessionVersion++;
      window.dispatchEvent(new CustomEvent("sudoexpo:session"));
    },
  },

  stats(eventId = EVENT_ID) {
    const db = loadCache();
    const profiles = db.profiles.filter((p) => p.eventId === eventId);
    const matches = db.matches.filter((m) => m.eventId === eventId);
    const mutual = matches.filter((m) => m.decisionA === "interesse" && m.decisionB === "interesse");
    const connections = db.connections.filter((c) => c.eventId === eventId);
    return {
      profiles: profiles.length,
      matches: matches.length,
      mutualMatches: mutual.length,
      connections: connections.length,
      completedConnections: connections.filter((c) => c.status === "concluido").length,
      segments: SEGMENTS.length,
      taxonomySize: TAXONOMY.length,
    };
  },
};

async function recomputeMatchesFor(profileId: string) {
  const db = loadCache();
  const me = db.profiles.find((p) => p.id === profileId);
  if (!me) return;
  const others = db.profiles.filter((p) => p.id !== me.id && p.eventId === me.eventId);
  const fresh = computeMatchesFor(me, others);

  const existing = new Map(
    db.matches
      .filter((m) => m.aProfileId === me.id || m.bProfileId === me.id)
      .map((m) => [pairKey(m.aProfileId, m.bProfileId), m]),
  );
  db.matches = db.matches.filter((m) => m.aProfileId !== me.id && m.bProfileId !== me.id);
  const toUpsert: Match[] = [];
  for (const f of fresh) {
    const key = pairKey(f.aProfileId, f.bProfileId);
    const prev = existing.get(key);
    const merged: Match = {
      ...f,
      id: prev?.id ?? uid(),
      decisionA: prev?.decisionA ?? "sem_decisao",
      decisionB: prev?.decisionB ?? "sem_decisao",
    };
    db.matches.push(merged);
    toUpsert.push(merged);
  }
  persist();
  await callStoreMatches(toUpsert);
  await refreshTable("matches");
}
function pairKey(a: string, b: string) {
  return [a, b].sort().join("::");
}

export function subscribe(cb: () => void) {
  if (!isBrowser()) return () => {};
  const handler = () => cb();
  window.addEventListener("sudoexpo:db", handler);
  window.addEventListener("sudoexpo:session", handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener("sudoexpo:db", handler);
    window.removeEventListener("sudoexpo:session", handler);
    window.removeEventListener("storage", handler);
  };
}

export function getDbVersion(): number { return dbVersion; }
export function getSessionVersion(): number { return sessionVersion; }
function getCombinedVersion(): number { return dbVersion * 1_000_003 + sessionVersion; }
function getServerVersion(): number { return 0; }

export function useStoreSelector<T>(selector: () => T): T {
  const version = useSyncExternalStore(subscribe, getCombinedVersion, getServerVersion);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => selector(), [version]);
}
export function useStoreSelectorEq<T>(selector: () => T, isEqual: (a: T, b: T) => boolean): T {
  const version = useSyncExternalStore(subscribe, getCombinedVersion, getServerVersion);
  const ref = useRef<{ v: number; value: T } | null>(null);
  if (!ref.current || ref.current.v !== version) {
    const next = selector();
    if (ref.current && isEqual(ref.current.value, next)) {
      ref.current = { v: version, value: ref.current.value };
    } else {
      ref.current = { v: version, value: next };
    }
  }
  return ref.current.value;
}
