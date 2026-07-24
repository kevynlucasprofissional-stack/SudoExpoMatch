// Repositório em memória + localStorage.
// Espelha o schema Supabase para que a troca por queries reais seja mecânica.
// Nunca use isto em produção — perfis são visíveis em outras abas.

import { EVENT_ID, SEGMENTS, TAXONOMY } from "./mock-data";
import { computeMatchesFor } from "@/domains/matching/score";
import type {
  Connection,
  Decision,
  Match,
  Profile,
} from "./types";

const KEY = "sudoexpo:v1";
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

function seed(): DB {
  const now = new Date().toISOString();
  const mk = (
    id: string,
    name: string,
    company: string,
    city: string,
    segmentId: string,
    summary: string,
    offers: string[],
    needs: { kind: Profile["needs"][number]["kind"]; label: string; priority?: boolean }[],
  ): Profile => ({
    id,
    eventId: EVENT_ID,
    name,
    company,
    city,
    whatsapp: "(00) 00000-0000",
    segmentId,
    summary,
    offers: offers.map((label) => ({ id: uid(), label })),
    needs: needs.map((n) => ({
      id: uid(),
      kind: n.kind,
      label: n.label,
      isPriority: n.priority,
    })),
    consent: true,
    isDemo: true,
    createdAt: now,
    updatedAt: now,
    recoveryCode: "DEMO" + id.slice(-3),
  });

  const profiles: Profile[] = [
    mk(
      "demo-001",
      "Marina Alves (demo)",
      "Alves Design",
      "Rio Verde",
      "marketing",
      "Estúdio de design e comunicação para pequenas indústrias.",
      ["Design gráfico", "Produção audiovisual", "Gestão de redes sociais"],
      [
        { kind: "compradores", label: "Compradores para meus produtos/serviços", priority: true },
        { kind: "parceiro", label: "Parceiros locais" },
      ],
    ),
    mk(
      "demo-002",
      "Rafael Souza (demo)",
      "Metal RV",
      "Rio Verde",
      "industria",
      "Fabricação de peças metálicas sob medida para agroindústria.",
      ["Fabricação sob demanda", "Metalurgia"],
      [
        { kind: "servico", label: "Design gráfico para catálogo", priority: true },
        { kind: "distribuidores", label: "Distribuidores regionais" },
      ],
    ),
    mk(
      "demo-003",
      "Camila Rocha (demo)",
      "Rocha TI",
      "Goiânia",
      "tecnologia",
      "Desenvolvimento de software sob medida e automação de processos.",
      ["Desenvolvimento de software", "Automação", "Suporte técnico"],
      [
        { kind: "compradores", label: "Compradores de sistemas de gestão" },
        { kind: "parceiro", label: "Parceiros de marketing digital", priority: true },
      ],
    ),
    mk(
      "demo-004",
      "João Pereira (demo)",
      "Pereira Logística",
      "Rio Verde",
      "logistica",
      "Transporte de cargas fracionadas na região centro-oeste.",
      ["Transporte de cargas", "Última milha"],
      [
        { kind: "servico", label: "Automação de rotas e frota", priority: true },
        { kind: "compradores", label: "Compradores de frete recorrente" },
      ],
    ),
    mk(
      "demo-005",
      "Beatriz Lima (demo)",
      "Nutre+",
      "Rio Verde",
      "alimentacao",
      "Fornecimento de refeições coletivas para empresas.",
      ["Fornecimento de refeições", "Insumos alimentícios"],
      [
        { kind: "fornecedor", label: "Fornecedores de hortifruti" },
        { kind: "compradores", label: "Empresas com refeitório próprio", priority: true },
      ],
    ),
  ];

  return { profiles, matches: [], connections: [] };
}

function read(): DB {
  if (!isBrowser()) return { profiles: [], matches: [], connections: [] };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) {
      const s = seed();
      window.localStorage.setItem(KEY, JSON.stringify(s));
      return s;
    }
    return JSON.parse(raw) as DB;
  } catch {
    return { profiles: [], matches: [], connections: [] };
  }
}

function write(db: DB) {
  if (!isBrowser()) return;
  window.localStorage.setItem(KEY, JSON.stringify(db));
  window.dispatchEvent(new CustomEvent("sudoexpo:db"));
}

export const store = {
  reset() {
    if (!isBrowser()) return;
    window.localStorage.removeItem(KEY);
    window.localStorage.removeItem(SESSION_KEY);
    window.dispatchEvent(new CustomEvent("sudoexpo:db"));
  },
  all(): DB {
    return read();
  },
  listProfiles(): Profile[] {
    return read().profiles;
  },
  getProfile(id: string): Profile | undefined {
    return read().profiles.find((p) => p.id === id);
  },
  createProfile(input: Omit<Profile, "id" | "createdAt" | "updatedAt" | "recoveryCode" | "eventId">) {
    const db = read();
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
    write(db);
    // Recalcula matches para este perfil
    recomputeMatchesFor(profile.id);
    return profile;
  },
  updateProfile(id: string, patch: Partial<Profile>) {
    const db = read();
    const idx = db.profiles.findIndex((p) => p.id === id);
    if (idx < 0) return undefined;
    db.profiles[idx] = {
      ...db.profiles[idx],
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    write(db);
    recomputeMatchesFor(id);
    return db.profiles[idx];
  },
  findByRecovery(whatsapp: string, code: string): Profile | undefined {
    const clean = (s: string) => s.replace(/\D/g, "");
    return read().profiles.find(
      (p) =>
        clean(p.whatsapp) === clean(whatsapp) &&
        p.recoveryCode.toUpperCase() === code.toUpperCase(),
    );
  },
  matchesFor(profileId: string): Match[] {
    return read().matches.filter(
      (m) => m.aProfileId === profileId || m.bProfileId === profileId,
    );
  },
  decideMatch(matchId: string, byProfileId: string, decision: Decision) {
    const db = read();
    const idx = db.matches.findIndex((m) => m.id === matchId);
    if (idx < 0) return;
    const m = db.matches[idx];
    if (byProfileId === m.aProfileId) m.decisionA = decision;
    else if (byProfileId === m.bProfileId) m.decisionB = decision;
    m.updatedAt = new Date().toISOString();
    db.matches[idx] = m;

    // Interesse mútuo cria connection
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
    write(db);
  },
  session: {
    set(profileId: string) {
      if (!isBrowser()) return;
      window.localStorage.setItem(SESSION_KEY, profileId);
      window.dispatchEvent(new CustomEvent("sudoexpo:session"));
    },
    get(): string | null {
      if (!isBrowser()) return null;
      return window.localStorage.getItem(SESSION_KEY);
    },
    clear() {
      if (!isBrowser()) return;
      window.localStorage.removeItem(SESSION_KEY);
      window.dispatchEvent(new CustomEvent("sudoexpo:session"));
    },
  },
  stats(eventId = EVENT_ID) {
    const db = read();
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

function recomputeMatchesFor(profileId: string) {
  const db = read();
  const me = db.profiles.find((p) => p.id === profileId);
  if (!me) return;
  const others = db.profiles.filter(
    (p) => p.id !== me.id && p.eventId === me.eventId,
  );
  const fresh = computeMatchesFor(me, others);

  // Remove matches antigos envolvendo `me` e reinsere, preservando decisões existentes
  const existing = new Map(
    db.matches
      .filter((m) => m.aProfileId === me.id || m.bProfileId === me.id)
      .map((m) => [pairKey(m.aProfileId, m.bProfileId), m]),
  );
  db.matches = db.matches.filter(
    (m) => m.aProfileId !== me.id && m.bProfileId !== me.id,
  );

  for (const f of fresh) {
    const key = pairKey(f.aProfileId, f.bProfileId);
    const prev = existing.get(key);
    db.matches.push({
      ...f,
      id: prev?.id ?? uid(),
      decisionA: prev?.decisionA ?? "sem_decisao",
      decisionB: prev?.decisionB ?? "sem_decisao",
    });
  }
  // Reinsere matches antigos que ainda existiam (pares onde `me` estava como B mas não recomputamos pelo lado deles)
  for (const [key, prev] of existing) {
    if (!db.matches.some((m) => pairKey(m.aProfileId, m.bProfileId) === key)) {
      db.matches.push(prev);
    }
  }
  write(db);
}

function pairKey(a: string, b: string) {
  return [a, b].sort().join("::");
}

// Hook helper: subscribe to db changes
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
