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

const EVENT = "sudoexpo-2026";
const MATCH = psql(`SELECT id FROM public.matches WHERE event_id='${EVENT}' LIMIT 1`);

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

describe("admin_set_match_reviewed — regras (prova comportamental na migration IMPL15)", () => {
  /**
   * A prova comportamental (marcar, desmarcar, filtros, admin-only, not_found e
   * audit_logs) roda dentro da migration IMPL15 num bloco DO $$ com RAISE: se
   * qualquer regra falhar, a migration falha e nada é persistido. O usuário do
   * sandbox não pode assumir a role `authenticated`, então aqui garantimos que a
   * superfície permanece consistente ao longo do tempo.
   */
  const SRC = psql(
    `SELECT prosrc FROM pg_proc WHERE oid='public.admin_set_match_reviewed(text,uuid,boolean)'::regprocedure`,
  );
  const LIST = psql(
    `SELECT prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='admin_list_matches'`,
  );

  it("exige admin do evento (nunca staff comum nem usuário sem papel)", () => {
    expect(SRC).toContain("_admin_require_event_admin");
  });

  it("autor vem do gate de admin (auth.uid()) e o match é validado no evento", () => {
    expect(
      psql(`SELECT prosrc FROM pg_proc WHERE oid='public._admin_require_event_admin(text)'::regprocedure`),
    ).toContain("auth.uid()");
    expect(SRC).toContain("v_uid");
    expect(SRC).toContain("not_found");
    expect(SRC).toMatch(/matches[\s\S]*event_id/);
  });

  it("registra audit_logs ao marcar e ao desmarcar, sem PII", () => {
    expect(SRC).toContain("audit_logs");
    expect(SRC).toContain("match_review_set");
    expect(SRC).toContain("match_review_cleared");
    expect(SRC).not.toMatch(/whatsapp|email|phone/i);
  });

  it("não toca em score, label, reasons nem nas decisões do participante", () => {
    expect(SRC).not.toMatch(/score_for_|algorithm_version|reasons_for_|match_decisions/);
  });

  it("admin_list_matches expõe status de revisão e o filtro _reviewed", () => {
    expect(LIST).toContain("match_admin_reviews");
    expect(LIST).toContain("_reviewed");
    expect(LIST).toContain("reviewed_at");
    expect(
      psql(`SELECT pg_get_function_arguments(p.oid) FROM pg_proc p
             JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE n.nspname='public' AND p.proname='admin_list_matches'`),
    ).toContain("_reviewed");
  });

  it("nenhuma revisão de teste ficou persistida", () => {
    // Sem matches no evento (base zerada), a checagem vale para a tabela inteira.
    expect(
      MATCH
        ? psql(`SELECT count(*)::int FROM public.match_admin_reviews WHERE match_id='${MATCH}'`)
        : psql(`SELECT count(*)::int FROM public.match_admin_reviews`),
    ).toBe("0");
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
