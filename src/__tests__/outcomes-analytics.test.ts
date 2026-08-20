import { beforeEach, describe, expect, it, vi } from "vitest";
import { execSync } from "node:child_process";

import {
  ALLOWED_PAYLOAD_KEYS,
  ANALYTICS_KINDS,
  PII_KEYS,
  isAnalyticsKind,
  resetAnalyticsDedupe,
  sanitizePayload,
  trackEvent,
} from "@/features/analytics/track";
import { OUTCOME_KINDS, OUTCOME_LABEL } from "@/features/staff/outcomes";

// ---------------------------------------------------------------- supabase mock
const insert = vi.fn(async (_row: Record<string, unknown>) => ({ error: null }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ insert }) },
}));

// ---------------------------------------------------------------- psql helpers
function psqlAvailable(): boolean {
  try {
    execSync("psql -Atc 'select 1'", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return true;
  } catch {
    return false;
  }
}

function psql(sql: string): string {
  return execSync(`psql -Atc ${JSON.stringify(sql.replace(/\s+/g, " ").trim())}`, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

const dbIt = psqlAvailable() ? it : it.skip;

// ================================================================= PARTE B — track()
describe("analytics/track — allowlist e sanitização", () => {
  beforeEach(() => {
    insert.mockClear();
    resetAnalyticsDedupe();
  });

  it("expõe apenas os eventos reais do funil", () => {
    expect([...ANALYTICS_KINDS].sort()).toEqual(
      [
        "ai_suggestion_accepted",
        "ai_suggestion_requested",
        "connection_created",
        "connection_viewed",
        "match_decided",
        "match_viewed",
        "onboarding_completed",
        "onboarding_started",
      ].filter((k) => (ANALYTICS_KINDS as readonly string[]).includes(k)),
    );
    expect(isAnalyticsKind("onboarding_started")).toBe(true);
    expect(isAnalyticsKind("qualquer_coisa")).toBe(false);
  });

  it("bloqueia kinds fora da allowlist antes de tocar no banco", async () => {
    const r = await trackEvent({ kind: "hack_event", eventId: "e1" });
    expect(r).toEqual({ sent: false, reason: "invalid_kind" });
    expect(insert).not.toHaveBeenCalled();
  });

  it("remove PII e chaves não autorizadas do payload", () => {
    const dirty: Record<string, unknown> = {
      match_id: "m-1",
      score: 82,
      accepted: true,
    };
    for (const k of PII_KEYS) dirty[k] = "João da Silva 55999999999";
    dirty["arbitrario"] = "x";
    dirty["objeto"] = { a: 1 };

    const clean = sanitizePayload(dirty);
    expect(clean).toEqual({ match_id: "m-1", score: 82, accepted: true });
    for (const k of PII_KEYS) expect(clean).not.toHaveProperty(k);
    for (const k of Object.keys(clean)) {
      expect(ALLOWED_PAYLOAD_KEYS as readonly string[]).toContain(k);
    }
  });

  it("trunca strings longas e descarta valores não primitivos", () => {
    const clean = sanitizePayload({
      label: "x".repeat(500),
      source: "  ai  ",
      count: Number.NaN,
      step: null,
    });
    expect(clean["label"]).toHaveLength(64);
    expect(clean["source"]).toBe("ai");
    expect(clean).not.toHaveProperty("count");
    expect(clean).not.toHaveProperty("step");
  });

  it("nunca envia actor_user_id (o ator é definido pelo banco)", async () => {
    await trackEvent({
      kind: "match_viewed",
      eventId: "e1",
      profileId: "p1",
      payload: { match_id: "m1" },
    });
    expect(insert).toHaveBeenCalledTimes(1);
    const arg = insert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(arg).not.toHaveProperty("actor_user_id");
    expect(arg["payload"]).toEqual({ match_id: "m1" });
  });

  it("dedupa eventos repetidos e permite repeatable", async () => {
    const a = await trackEvent({ kind: "match_viewed", eventId: "e1", payload: { match_id: "m1" } });
    const b = await trackEvent({ kind: "match_viewed", eventId: "e1", payload: { match_id: "m1" } });
    expect(a.sent).toBe(true);
    expect(b).toEqual({ sent: false, reason: "duplicate" });

    const c = await trackEvent({ kind: "match_decided", eventId: "e1", repeatable: true });
    const d = await trackEvent({ kind: "match_decided", eventId: "e1", repeatable: true });
    expect(c.sent && d.sent).toBe(true);
  });

  it("nunca lança e libera o dedupe quando o insert falha", async () => {
    insert.mockImplementationOnce(async (_row: Record<string, unknown>) => {
      throw new Error("offline");
    });
    const fail = await trackEvent({ kind: "match_viewed", eventId: "e1", payload: { match_id: "z" } });
    expect(fail).toEqual({ sent: false, reason: "error" });
    const retry = await trackEvent({ kind: "match_viewed", eventId: "e1", payload: { match_id: "z" } });
    expect(retry.sent).toBe(true);
  });
});

// ================================================================= PARTE A — outcomes
describe("outcomes comerciais — contrato", () => {
  it("separa resultado comercial de status operacional", () => {
    expect([...OUTCOME_KINDS].sort()).toEqual([
      "conversa_realizada",
      "negocio_reportado",
      "proposta_solicitada",
      "reuniao_agendada",
    ]);
    for (const k of OUTCOME_KINDS) expect(OUTCOME_LABEL[k]).toBeTruthy();
  });
});

// ================================================================= Banco
describe("banco — RLS, grants e agregação", () => {
  dbIt("analytics_events aceita INSERT autenticado e nega leitura ao cliente", () => {
const insertAuth = psql(
      `SELECT has_table_privilege('authenticated', 'public.analytics_events', 'INSERT');`,
    );
    const selectAuth = psql(
      `SELECT has_table_privilege('authenticated', 'public.analytics_events', 'SELECT');`,
    );
    const insertAnon = psql(
      `SELECT has_table_privilege('anon', 'public.analytics_events', 'INSERT');`,
    );
    expect(insertAuth).toBe("t");
    expect(selectAuth).toBe("f");
    expect(insertAnon).toBe("f");
  });

  dbIt("a política de INSERT restringe kind à allowlist do cliente", () => {
    const check = psql(`
      SELECT pg_get_expr(polwithcheck, polrelid) FROM pg_policy
       WHERE polrelid='public.analytics_events'::regclass;`);
    for (const kind of ANALYTICS_KINDS) expect(check).toContain(kind);
    expect(check).toContain("actor_user_id = auth.uid()");
  });

  dbIt("RPCs de outcome e analytics existem e não são executáveis por anon", () => {
    const fns = [
      "public.staff_record_connection_outcome(uuid,text,text)",
      "public.staff_remove_connection_outcome(uuid,text)",
      "public.admin_experience_analytics(text)",
    ];
    for (const fn of fns) {
      const exists = psql(
        `SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname='public' AND p.oid = to_regprocedure('${fn}');`,
      );
      expect(exists, `${fn} deve existir`).toBe("1");
      const anon = psql(
        `SELECT has_function_privilege('anon', '${fn}'::regprocedure, 'EXECUTE');`,
      );
      expect(anon, `${fn} não pode ser executável por anon`).toBe("f");
      const auth = psql(
        `SELECT has_function_privilege('authenticated', '${fn}'::regprocedure, 'EXECUTE');`,
      );
      expect(auth).toBe("t");
    }
  });

  dbIt("outcome é único por conexão e tipo", () => {
    const idx = psql(`
      SELECT count(*) FROM pg_indexes
       WHERE schemaname='public' AND tablename='connection_events'
         AND indexdef ILIKE '%outcome%';`);
    expect(Number(idx)).toBeGreaterThan(0);
  });

  dbIt("admin_experience_analytics agrega sem N+1 (uma única função SQL/plpgsql)", () => {
    const def = psql(`
      SELECT prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public' AND p.oid='public.admin_experience_analytics(text)'::regprocedure;`);
    expect(def).toContain("_admin_require_event_admin");
    expect(def.toLowerCase()).not.toContain("loop");
  });
});
