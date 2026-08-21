import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";

/**
 * Fase Seg-2 — inspeção automatizada da matriz de EXECUTE em funções
 * privilegiadas do schema `public`. Roda via psql com as credenciais
 * padrão (PG* env vars).
 */

function psql(sql: string): string {
  const oneLine = sql.replace(/\s+/g, " ").trim();
  return execSync(`psql -Atc ${JSON.stringify(oneLine)}`, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function execs(fn: string): string[] {
  const out = psql(
    `SELECT string_agg(r.rolname, ',' ORDER BY r.rolname)
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       CROSS JOIN (VALUES ('anon'),('authenticated'),('service_role'),('public')) r(rolname)
      WHERE n.nspname = 'public'
        AND p.oid = '${fn}'::regprocedure
        AND has_function_privilege(r.rolname, p.oid, 'EXECUTE');`,
  );
  return out ? out.split(",") : [];
}

function exists(fn: string): boolean {
  const out = psql(
    `SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.oid = to_regprocedure('${fn}');`,
  );
  return out === "1";
}

// Grupos:
const PARTICIPANT_RPCS = [
  "public.get_own_profile_v2(text)",
  "public.save_own_profile_v2(jsonb)",
  "public.set_own_contact(text,text,boolean)",
  "public.list_own_matches_v2(text)",
  "public.record_match_decision_v2(uuid,public.decision)",
  "public.recompute_own_matches(text)",
  "public.reveal_contact_for_match(uuid)",
  "public.list_event_segments_and_taxonomy(text)",
];

const STAFF_RPCS = [
  "public.event_operational_stats(text)",
  "public.staff_list_connection_detail(uuid)",
  "public.staff_assume_connection(uuid)",
  "public.staff_release_connection(uuid,text)",
  "public.staff_advance_connection(uuid,public.connection_status,text)",
  "public.staff_add_connection_note(uuid,text)",
  "public.staff_reveal_contact_for_match(uuid,text)",
  "public.admin_list_event_staff(text)",
  "public.admin_add_event_staff_by_email(text,text,public.app_role)",
  "public.admin_change_event_staff_role(text,uuid,public.app_role)",
  "public.admin_remove_event_staff(text,uuid,uuid,boolean)",
  "public.admin_reassign_connection(uuid,uuid,text)",
];

const INTERNAL_ONLY = [
  "public._recompute_matches_for_profile(uuid,text)",
  "public.recompute_matches_for_profile_id(uuid)",
];

const TRIGGER_FUNCTIONS = [
  "public.set_updated_at()",
  "public.analytics_events_set_actor()",
];

const LEGACY_DROPPED = [
  "public.record_match_decision(uuid,public.decision)",
  "public.recover_profile(text,text,text)",
  "public.upsert_own_profile(text,text,text,text,text,text,text,boolean,jsonb,jsonb)",
  "public.admin_remove_event_staff(text,uuid)",
  "public.list_event_profile_cards(text)",
  "public.segment_distribution(text)",
  "public.store_computed_matches(jsonb)",
  "public.list_staff_connections(text)",
  "public.auto_create_connection()",
];

describe("seg-2: matriz de EXECUTE de RPCs privilegiadas", () => {
  it("participante: RPCs v2 acessíveis a authenticated, nunca a anon/PUBLIC", () => {
    for (const fn of PARTICIPANT_RPCS) {
      const roles = execs(fn);
      expect(roles, `${fn} deve incluir authenticated`).toContain("authenticated");
      expect(roles, `${fn} não pode incluir anon`).not.toContain("anon");
      expect(roles, `${fn} não pode incluir public`).not.toContain("public");
    }
  });

  it("staff/admin: RPCs acessíveis a authenticated, nunca a anon/PUBLIC", () => {
    for (const fn of STAFF_RPCS) {
      const roles = execs(fn);
      expect(roles, `${fn} deve incluir authenticated`).toContain("authenticated");
      expect(roles, `${fn} não pode incluir anon`).not.toContain("anon");
      expect(roles, `${fn} não pode incluir public`).not.toContain("public");
    }
  });

  it("internas de recomputação: apenas service_role", () => {
    for (const fn of INTERNAL_ONLY) {
      const roles = execs(fn);
      expect(roles, `${fn} deve ser exclusivo do service_role`).toEqual(["service_role"]);
    }
  });

  it("trigger functions: não invocáveis por clientes", () => {
    for (const fn of TRIGGER_FUNCTIONS) {
      const roles = execs(fn);
      expect(roles, `${fn} não pode ser executável por anon`).not.toContain("anon");
      expect(roles, `${fn} não pode ser executável por authenticated`).not.toContain(
        "authenticated",
      );
      expect(roles, `${fn} não pode ser executável por PUBLIC`).not.toContain("public");
    }
  });

  it("funções legadas foram removidas", () => {
    for (const fn of LEGACY_DROPPED) {
      expect(exists(fn), `${fn} deveria ter sido removida`).toBe(false);
    }
  });

  it("event_stats (agregado público) permanece acessível a anon/authenticated", () => {
    const roles = execs("public.event_stats(text)");
    expect(roles).toContain("anon");
    expect(roles).toContain("authenticated");
  });

  it("helpers de RLS acessíveis apenas por sessões autenticadas", () => {
    for (const fn of [
      "public.has_role(uuid,public.app_role)",
      "public.is_staff(uuid)",
      "public.has_event_role(text,uuid,public.app_role)",
      "public.has_any_event_role(text,uuid)",
    ]) {
      const roles = execs(fn);
      expect(roles, `${fn} deve incluir authenticated`).toContain("authenticated");
      expect(roles, `${fn} não pode incluir anon`).not.toContain("anon");
    }
  });
});
