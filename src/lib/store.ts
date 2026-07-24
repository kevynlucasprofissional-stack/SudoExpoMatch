// Repositório híbrido: cache em memória/localStorage + persistência real no Supabase.
// Mantém a API síncrona que os componentes usam via useSyncExternalStore,
// mas hidrata do banco na primeira leitura e espelha escritas para o backend.

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

const KEY = "sudoexpo:v2";
const SESSION_KEY = "sudoexpo:session";

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

function shortCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

const EMPTY: DB = { profiles: [], matches: [], connections: [] };

let cache: DB | null = null;
let hydrated = false;
let hydrating: Promise<void> | null = null;

// Version counters — increment ONLY on real data changes.
// Snapshots consumed by useSyncExternalStore are plain numbers,
// giving a stable identity between mutations.
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
  if (json === lastDbSignature) return; // dedup: nothing actually changed
  lastDbSignature = json;
  window.localStorage.setItem(KEY, json);
  dbVersion++;
  window.dispatchEvent(new CustomEvent("sudoexpo:db"));
}


// -------- Mapping between DB rows and domain types --------
type DBProfile = Database["public"]["Tables"]["profiles"]["Row"];
type DBMatch = Database["public"]["Tables"]["matches"]["Row"];
type DBConnection = Database["public"]["Tables"]["connections"]["Row"];

function fromDBProfile(r: DBProfile): Profile {
  return {
    id: r.id,
    eventId: r.event_id,
    name: r.name,
    company: r.company,
    city: r.city,
    neighborhood: r.neighborhood ?? undefined,
    whatsapp: r.whatsapp,
    segmentId: r.segment_id,
    summary: r.summary,
    offers: (r.offers as unknown as OfferItem[]) ?? [],
    needs: (r.needs as unknown as NeedItem[]) ?? [],
    consent: r.consent,
    isDemo: r.is_demo,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    recoveryCode: r.recovery_code,
  };
}

function toDBProfileInsert(p: Profile): Database["public"]["Tables"]["profiles"]["Insert"] {
  return {
    id: p.id,
    event_id: p.eventId,
    name: p.name,
    company: p.company,
    city: p.city,
    neighborhood: p.neighborhood ?? null,
    whatsapp: p.whatsapp,
    segment_id: p.segmentId,
    summary: p.summary,
    offers: p.offers as unknown as Database["public"]["Tables"]["profiles"]["Insert"]["offers"],
    needs: p.needs as unknown as Database["public"]["Tables"]["profiles"]["Insert"]["needs"],
    consent: p.consent,
    is_demo: p.isDemo ?? false,
    recovery_code: p.recoveryCode,
  };
}

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

// Ensures a match row exists with normalized (a<b) ordering to satisfy CHECK.
function orderedPair(aId: string, bId: string): [string, string, boolean] {
  return aId < bId ? [aId, bId, false] : [bId, aId, true];
}

async function hydrate() {
  if (!isBrowser() || hydrated) return;
  if (hydrating) return hydrating;
  hydrating = (async () => {
    try {
      const [profilesRes, matchesRes, connsRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("event_id", EVENT_ID),
        supabase.from("matches").select("*").eq("event_id", EVENT_ID),
        supabase.from("connections").select("*").eq("event_id", EVENT_ID),
      ]);
      const db = loadCache();
      const remoteProfiles = (profilesRes.data ?? []).map(fromDBProfile);
      const localOnly = db.profiles.filter(
        (p) => !remoteProfiles.some((r) => r.id === p.id),
      );
      db.profiles = [...remoteProfiles, ...localOnly];
      db.matches = (matchesRes.data ?? []).map(fromDBMatch);
      db.connections = (connsRes.data ?? []).map(fromDBConnection);
      hydrated = true;
      persist();
      subscribeRealtime();
    } catch (err) {
      // Falha de rede: mantém cache local; próxima operação retentará.
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
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "profiles" },
      () => refreshFromDB("profiles"),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "matches" },
      () => refreshFromDB("matches"),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "connections" },
      () => refreshFromDB("connections"),
    )
    .subscribe();
}

async function refreshFromDB(table: "profiles" | "matches" | "connections") {
  const db = loadCache();
  if (table === "profiles") {
    const { data } = await supabase.from("profiles").select("*").eq("event_id", EVENT_ID);
    db.profiles = (data ?? []).map(fromDBProfile);
  } else if (table === "matches") {
    const { data } = await supabase.from("matches").select("*").eq("event_id", EVENT_ID);
    db.matches = (data ?? []).map(fromDBMatch);
  } else {
    const { data } = await supabase.from("connections").select("*").eq("event_id", EVENT_ID);
    db.connections = (data ?? []).map(fromDBConnection);
  }
  persist();
}

// Kick off hydration on module load (browser only).
if (isBrowser()) {
  loadCache();
  hydrate();
}

async function upsertMatchRemote(m: Match) {
  const [a, b, swapped] = orderedPair(m.aProfileId, m.bProfileId);
  const row = {
    id: m.id,
    event_id: m.eventId,
    a_profile_id: a,
    b_profile_id: b,
    kind: m.kind,
    score_for_a: swapped ? m.scoreForB : m.scoreForA,
    score_for_b: swapped ? m.scoreForA : m.scoreForB,
    label: m.label,
    reasons_for_a: (swapped ? m.reasonsForB : m.reasonsForA) as unknown as Database["public"]["Tables"]["matches"]["Insert"]["reasons_for_a"],
    reasons_for_b: (swapped ? m.reasonsForA : m.reasonsForB) as unknown as Database["public"]["Tables"]["matches"]["Insert"]["reasons_for_b"],
    decision_a: swapped ? m.decisionB : m.decisionA,
    decision_b: swapped ? m.decisionA : m.decisionB,
  };
  await supabase.from("matches").upsert(row, { onConflict: "a_profile_id,b_profile_id" });
}

export const store = {
  hydrate,
  isHydrated: () => hydrated,
  reset() {
    if (!isBrowser()) return;
    window.localStorage.removeItem(KEY);
    window.localStorage.removeItem(SESSION_KEY);
    cache = { ...EMPTY };
    lastDbSignature = "";
    hydrated = false;
    dbVersion++;
    sessionVersion++;
    window.dispatchEvent(new CustomEvent("sudoexpo:db"));
    window.dispatchEvent(new CustomEvent("sudoexpo:session"));
    hydrate();
  },

  all(): DB {
    return loadCache();
  },
  listProfiles(): Profile[] {
    return loadCache().profiles;
  },
  getProfile(id: string): Profile | undefined {
    return loadCache().profiles.find((p) => p.id === id);
  },
  createProfile(
    input: Omit<Profile, "id" | "createdAt" | "updatedAt" | "recoveryCode" | "eventId">,
  ) {
    const db = loadCache();
    const now = new Date().toISOString();
    const profile: Profile = {
      ...input,
      id: uid(),
      eventId: EVENT_ID,
      recoveryCode: shortCode(),
      createdAt: now,
      updatedAt: now,
    };
    db.profiles.push(profile);
    persist();
    // Persistência remota (fire-and-forget) e recomputo de matches
    void (async () => {
      const { error } = await supabase.from("profiles").insert(toDBProfileInsert(profile));
      if (error) console.warn("[sudoexpo] insert profile:", error.message);
      await recomputeMatchesFor(profile.id);
    })();
    return profile;
  },
  updateProfile(id: string, patch: Partial<Profile>) {
    const db = loadCache();
    const idx = db.profiles.findIndex((p) => p.id === id);
    if (idx < 0) return undefined;
    db.profiles[idx] = {
      ...db.profiles[idx],
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    persist();
    void (async () => {
      const p = db.profiles[idx];
      await supabase.from("profiles").update(toDBProfileInsert(p)).eq("id", id);
      await recomputeMatchesFor(id);
    })();
    return db.profiles[idx];
  },
  findByRecovery(whatsapp: string, code: string): Profile | undefined {
    const clean = (s: string) => s.replace(/\D/g, "");
    return loadCache().profiles.find(
      (p) =>
        clean(p.whatsapp) === clean(whatsapp) &&
        p.recoveryCode.toUpperCase() === code.toUpperCase(),
    );
  },
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

    if (
      m.decisionA === "interesse" &&
      m.decisionB === "interesse" &&
      !db.connections.some((c) => c.matchId === m.id)
    ) {
      const now = new Date().toISOString();
      db.connections.push({
        id: uid(),
        matchId: m.id,
        eventId: m.eventId,
        aProfileId: m.aProfileId,
        bProfileId: m.bProfileId,
        status: "aguardando",
        createdAt: now,
        updatedAt: now,
      });
    }
    persist();
    void (async () => {
      const [, , swapped] = orderedPair(m.aProfileId, m.bProfileId);
      const patch: Partial<Database["public"]["Tables"]["matches"]["Update"]> = {};
      const targetDecision = decision;
      if (byProfileId === m.aProfileId) {
        if (swapped) patch.decision_b = targetDecision;
        else patch.decision_a = targetDecision;
      } else {
        if (swapped) patch.decision_a = targetDecision;
        else patch.decision_b = targetDecision;
      }
      await supabase.from("matches").update(patch).eq("id", matchId);
    })();
  },
  session: {
    set(profileId: string) {
      if (!isBrowser()) return;
      if (window.localStorage.getItem(SESSION_KEY) === profileId) return;
      window.localStorage.setItem(SESSION_KEY, profileId);
      sessionVersion++;
      window.dispatchEvent(new CustomEvent("sudoexpo:session"));
    },
    get(): string | null {
      if (!isBrowser()) return null;
      return window.localStorage.getItem(SESSION_KEY);
    },
    clear() {
      if (!isBrowser()) return;
      if (window.localStorage.getItem(SESSION_KEY) == null) return;
      window.localStorage.removeItem(SESSION_KEY);
      sessionVersion++;
      window.dispatchEvent(new CustomEvent("sudoexpo:session"));
    },
  },

  stats(eventId = EVENT_ID) {
    const db = loadCache();
    const profiles = db.profiles.filter((p) => p.eventId === eventId);
    const matches = db.matches.filter((m) => m.eventId === eventId);
    const mutual = matches.filter(
      (m) => m.decisionA === "interesse" && m.decisionB === "interesse",
    );
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
  const others = db.profiles.filter(
    (p) => p.id !== me.id && p.eventId === me.eventId,
  );
  const fresh = computeMatchesFor(me, others);

  const existing = new Map(
    db.matches
      .filter((m) => m.aProfileId === me.id || m.bProfileId === me.id)
      .map((m) => [pairKey(m.aProfileId, m.bProfileId), m]),
  );
  db.matches = db.matches.filter(
    (m) => m.aProfileId !== me.id && m.bProfileId !== me.id,
  );
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
  for (const [key, prev] of existing) {
    if (!db.matches.some((m) => pairKey(m.aProfileId, m.bProfileId) === key)) {
      db.matches.push(prev);
    }
  }
  persist();
  // Mirror to Supabase
  for (const m of toUpsert) {
    try {
      await upsertMatchRemote(m);
    } catch (err) {
      console.warn("[sudoexpo] upsert match:", err);
    }
  }
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
