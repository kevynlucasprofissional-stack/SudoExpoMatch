import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import { normalizeMatchesSearch, hasActiveMatchFilters } from "@/features/admin/matchesUrlState";
import { matchRowSchema, matchesPageSchema, hasPrivateKey } from "@/features/admin/matchesSchemas";
import { matchesKey } from "@/features/admin/useAdminMatches";

/**
 * IMPL 15 — revisão manual (governança humana) de matches no admin.
 * O check NÃO é decisão do participante, nem do matcher, e o algoritmo
 * não depende dele.
 */
const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const ROUTE = read("src/routes/admin_.matches.tsx");
const API = read("src/features/admin/useAdminMatches.ts");

function psql(sql: string): string {
  return execSync(`psql -Atc ${JSON.stringify(sql.replace(/\s+/g, " ").trim())}`, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

/** Executa em transação com uma identidade simulada e faz ROLLBACK ao final. */
function asUser(uid: string, body: string): string {
  return psql(`BEGIN;
    SET LOCAL role authenticated;
    SET LOCAL request.jwt.claims = '{"sub":"${uid}","role":"authenticated"}';
    ${body}
    ROLLBACK;`);
}

const EVENT = "sudoexpo-2026";
const ADMIN = psql(
  `SELECT user_id FROM public.event_staff WHERE event_id='${EVENT}' AND role='admin' LIMIT 1`,
);
const MATCH = psql(`SELECT id FROM public.matches WHERE event_id='${EVENT}' LIMIT 1`);
const NO_MATCH = "00000000-0000-4000-8000-000000000000";

describe("estrutura administrativa separada", () => {
  it("match_admin_reviews existe com unique(match_id) e não fica em match_decisions", () => {
    expect(
      psql(`SELECT 1 FROM information_schema.tables
             WHERE table_schema='public' AND table_name='match_admin_reviews'`),
    ).toBe("1");
    const cols = psql(`SELECT string_agg(column_name, ',' ORDER BY column_name)
                         FROM information_schema.columns
                        WHERE table_schema='public' AND table_name='match_admin_reviews'`).split(
      ",",
    );
    for (const c of ["match_id", "event_id", "reviewed", "reviewed_by", "reviewed_at", "created_at", "updated_at"]) {
      expect(cols).toContain(c);
    }
    expect(
      psql(`SELECT count(*)::int FROM pg_indexes
             WHERE schemaname='public' AND tablename='match_admin_reviews'
               AND indexdef ILIKE '%UNIQUE%match_id%'`),
    ).toBe("1");
    // nada de revisão dentro das decisões do participante
    expect(
      psql(`SELECT count(*)::int FROM information_schema.columns
             WHERE table_schema='public' AND table_name='match_decisions'
               AND column_name ILIKE '%review%'`),
    ).toBe("0");
  });

  it("tabela só é acessível via RPC (sem grants a anon/authenticated) e tem RLS", () => {
    expect(
      psql(`SELECT string_agg(DISTINCT grantee, ',') FROM information_schema.role_table_grants
             WHERE table_schema='public' AND table_name='match_admin_reviews'
               AND grantee IN ('anon','authenticated')`),
    ).toBe("");
    expect(
      psql(`SELECT relrowsecurity::text FROM pg_class WHERE oid='public.match_admin_reviews'::regclass`),
    ).toBe("true");
  });

  it("grants mínimos na RPC: authenticated sim, anon/public não", () => {
    const fn = "public.admin_set_match_reviewed(text,uuid,boolean)";
    expect(psql(`SELECT has_function_privilege('authenticated','${fn}','EXECUTE')::text`)).toBe("true");
    expect(psql(`SELECT has_function_privilege('anon','${fn}','EXECUTE')::text`)).toBe("false");
    expect(psql(`SELECT prosecdef::text FROM pg_proc WHERE oid='${fn}'::regprocedure`)).toBe("true");
    expect(
      psql(`SELECT array_to_string(proconfig,',') FROM pg_proc WHERE oid='${fn}'::regprocedure`),
    ).toContain("search_path=");
  });
});

describe("admin_set_match_reviewed — autorização", () => {
  it("admin do evento marca e a listagem passa a devolver reviewed", () => {
    const out = asUser(
      ADMIN,
      `SELECT (public.admin_set_match_reviewed('${EVENT}','${MATCH}',true) ->> 'reviewed')
       || '|' || (SELECT count(*)::text FROM public.match_admin_reviews
                   WHERE match_id='${MATCH}' AND reviewed)
       || '|' || (SELECT (i ->> 'reviewed')
                    FROM jsonb_array_elements(
                      public.admin_list_matches('${EVENT}', _reviewed => true) -> 'items') i
                   WHERE i ->> 'id' = '${MATCH}');`,
    );
    expect(out).toBe("true|1|true");
  });

  it("desmarcar limpa reviewed_by/reviewed_at e some do filtro de revisados", () => {
    const out = asUser(
      ADMIN,
      `SELECT public.admin_set_match_reviewed('${EVENT}','${MATCH}',true) IS NOT NULL;
       SELECT (public.admin_set_match_reviewed('${EVENT}','${MATCH}',false) ->> 'reviewed')
       || '|' || (SELECT coalesce(reviewed_by::text,'null') || ',' || coalesce(reviewed_at::text,'null')
                    FROM public.match_admin_reviews WHERE match_id='${MATCH}')
       || '|' || (SELECT jsonb_array_length(
                    public.admin_list_matches('${EVENT}', _reviewed => true) -> 'items')::text);`,
    );
    expect(out).toBe("false|null,null|0");
  });

  it("estado persiste em nova leitura (não é estado de tela)", () => {
    const out = asUser(
      ADMIN,
      `SELECT public.admin_set_match_reviewed('${EVENT}','${MATCH}',true) IS NOT NULL;
       SELECT (SELECT (i ->> 'reviewed_at') IS NOT NULL
                 FROM jsonb_array_elements(
                   public.admin_list_matches('${EVENT}') -> 'items') i
                WHERE i ->> 'id' = '${MATCH}')::text;`,
    );
    expect(out).toBe("true");
  });

  it("staff comum é bloqueado", () => {
    const staff = psql(
      `SELECT user_id FROM public.event_staff WHERE event_id='${EVENT}' AND role='staff' LIMIT 1`,
    );
    const uid = staff || "11111111-1111-4111-8111-111111111111";
    expect(() =>
      asUser(uid, `SELECT public.admin_set_match_reviewed('${EVENT}','${MATCH}',true);`),
    ).toThrow(/forbidden|not_authenticated/);
  });

  it("usuário comum (sem papel) é bloqueado", () => {
    const uid = psql(
      `SELECT id FROM auth.users WHERE id NOT IN (SELECT user_id FROM public.event_staff) LIMIT 1`,
    );
    if (!uid) return;
    expect(() =>
      asUser(uid, `SELECT public.admin_set_match_reviewed('${EVENT}','${MATCH}',true);`),
    ).toThrow(/forbidden/);
  });

  it("admin de outro evento é bloqueado", () => {
    expect(() =>
      asUser(ADMIN, `SELECT public.admin_set_match_reviewed('outro-evento','${MATCH}',true);`),
    ).toThrow(/forbidden/);
  });

  it("match inexistente devolve not_found", () => {
    expect(() =>
      asUser(ADMIN, `SELECT public.admin_set_match_reviewed('${EVENT}','${NO_MATCH}',true);`),
    ).toThrow(/not_found/);
  });

  it("grava audit_logs sem PII", () => {
    const out = asUser(
      ADMIN,
      `SELECT public.admin_set_match_reviewed('${EVENT}','${MATCH}',true) IS NOT NULL;
       SELECT action || '|' || target_table || '|' || (after ->> 'reviewed')
         FROM public.audit_logs
        WHERE target_id = '${MATCH}' ORDER BY created_at DESC LIMIT 1;`,
    );
    expect(out).toBe("match_review_set|match_admin_reviews|true");
  });
});

describe("listagem — filtros e paginação preservados", () => {
  it("filtro não revisados devolve os demais e mantém paginação", () => {
    const out = asUser(
      ADMIN,
      `SELECT public.admin_set_match_reviewed('${EVENT}','${MATCH}',true) IS NOT NULL;
       SELECT jsonb_array_length(public.admin_list_matches('${EVENT}', _reviewed => false) -> 'items')::text
       || '|' || (public.admin_list_matches('${EVENT}', _reviewed => false) ->> 'total')
       || '|' || (public.admin_list_matches('${EVENT}', _limit => 1, _offset => 0) ->> 'limit')
       || '|' || jsonb_array_length(public.admin_list_matches('${EVENT}', _limit => 1) -> 'items')::text;`,
    );
    const [items, total, limit, paged] = out.split("|");
    expect(items).toBe(total);
    expect(limit).toBe("1");
    expect(paged).toBe("1");
  });

  it("sem filtro devolve todos (revisados + não revisados)", () => {
    const out = asUser(
      ADMIN,
      `SELECT (public.admin_list_matches('${EVENT}') ->> 'total');`,
    );
    expect(Number(out)).toBeGreaterThanOrEqual(1);
  });
});

describe("contratos do frontend", () => {
  it("schema aceita reviewed/reviewed_at/reviewed_by e o padrão é falso", () => {
    const base = {
      id: "11111111-1111-4111-8111-111111111111",
      event_id: EVENT,
      kind: "direto",
      algorithm_version: "v2.3",
      a_profile_id: "22222222-2222-4222-8222-222222222222",
      a_name: "Ana",
      a_company: "X",
      a_segment_id: "s",
      a_segment_label: "S",
      b_profile_id: "33333333-3333-4333-8333-333333333333",
      b_name: "Bruno",
      b_company: "Y",
      b_segment_id: "s",
      b_segment_label: "S",
      score_for_a: 80,
      label_a: "alta_compatibilidade",
      score_for_b: 70,
      label_b: "boa_oportunidade",
      score_gap: 10,
      decision_a: "sem_decisao",
      decision_b: "sem_decisao",
      mutual: false,
      connection_id: null,
      connection_status: null,
      generated_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    expect(matchRowSchema.parse(base).reviewed).toBe(false);
    const parsed = matchRowSchema.parse({
      ...base,
      reviewed: true,
      reviewed_at: "2026-01-02T00:00:00Z",
      reviewed_by: "44444444-4444-4444-8444-444444444444",
    });
    expect(parsed.reviewed).toBe(true);
    expect(hasPrivateKey(parsed as unknown as Record<string, unknown>)).toBe(false);
    expect(
      matchesPageSchema.parse({ items: [], total: 0, limit: 20, offset: 0, reviewed_filter: true })
        .reviewed_filter,
    ).toBe(true);
  });

  it("estado de URL suporta Todos/Revisados/Não revisados", () => {
    expect(normalizeMatchesSearch({}).reviewed).toBeNull();
    expect(normalizeMatchesSearch({ rev: "1" }).reviewed).toBe(true);
    expect(normalizeMatchesSearch({ rev: "0" }).reviewed).toBe(false);
    expect(normalizeMatchesSearch({ rev: "x" }).reviewed).toBeNull();
    expect(hasActiveMatchFilters(normalizeMatchesSearch({ rev: "1" }))).toBe(true);
    expect(hasActiveMatchFilters(normalizeMatchesSearch({}))).toBe(false);
  });

  it("cache varia com o filtro de revisão", () => {
    const f = (reviewed: boolean | null) => ({
      ...normalizeMatchesSearch({}),
      reviewed,
      offset: 0,
    });
    expect(matchesKey(EVENT, f(true))).not.toEqual(matchesKey(EVENT, f(null)));
    expect(matchesKey(EVENT, f(false))).not.toEqual(matchesKey(EVENT, f(true)));
  });

  it("API só expõe a mutation de revisão (nenhuma edição do algoritmo)", () => {
    expect(API).toContain("admin_set_match_reviewed");
    expect(API).not.toMatch(/update\(\{[^}]*score|algorithm_version:|reasons:/);
  });
});

describe("UI — duas colunas + check independente", () => {
  it("mantém Lado A / Lado B e a inteligência existente", () => {
    expect(ROUTE).toContain("Lado A");
    expect(ROUTE).toContain("Lado B");
    expect(ROUTE).toContain("sm:grid-cols-2"); // empilha no mobile
    expect(ROUTE).toContain("score_for_a");
    expect(ROUTE).toContain("MatchDetailSheet");
  });

  it("o check fica fora do botão que abre o detalhe", () => {
    const card = ROUTE.slice(ROUTE.indexOf("function MatchCardRow"), ROUTE.indexOf("function MatchesBoard"));
    const closeButton = card.indexOf("</button>");
    expect(card.indexOf("<Checkbox")).toBeGreaterThan(closeButton);
    expect(card).toContain("Match revisado");
    expect(card).toContain("onCheckedChange");
    expect(card).toContain('data-testid="reviewed-flag"');
  });

  it("expõe o filtro de revisão na barra de filtros", () => {
    expect(ROUTE).toContain("Revisão do admin");
    expect(ROUTE).toContain("Não revisados");
    expect(ROUTE).toContain("rev:");
  });
});
