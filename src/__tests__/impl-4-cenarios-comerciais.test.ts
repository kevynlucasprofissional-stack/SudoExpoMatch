import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Implementação 4/12 — cenários comerciais reais + revisão transversal da Fase 1.
 *
 * A prova COMPORTAMENTAL completa (restaurante, agência de marketing, empresa
 * de tecnologia, contabilidade, empresa de eventos + pares de complementaridade,
 * direção errada, relação inativa e falsos positivos por substring) roda como
 * migration transacional, porque `EXECUTE` em `_recompute_matches_for_profile`
 * segue restrito a `service_role` e NÃO foi ampliado.
 *
 * Aqui validamos: (a) a correção mínima em `taxonomy_match` (contenção só em
 * limite de palavra), (b) a presença e a cobertura dos 15 cenários na prova,
 * (c) a limpeza total dos dados de prova e (d) o encadeamento da Fase 1.
 */

function psql(sql: string): string {
  return execSync(`psql -Atc ${JSON.stringify(sql.replace(/\s+/g, " ").trim())}`, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function fnDef(name: string): string {
  return psql(`
    SELECT pg_get_functiondef(p.oid) FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public' AND p.proname='${name}'
  `);
}

const MIG_DIR = "supabase/migrations";
const proof = readdirSync(MIG_DIR)
  .sort()
  .map((f) => readFileSync(join(MIG_DIR, f), "utf8"))
  .find((sql) => sql.includes("IMPL4 FAIL 1:"));

const taxonomyMatchDef = fnDef("taxonomy_match");
const matcherDef = fnDef("_recompute_matches_for_profile");

describe("taxonomy_match — correção de falso positivo por substring", () => {
  it("mantém igualdade de item, label e sinônimos", () => {
    expect(taxonomyMatchDef).toContain("_a_tax = _b_tax");
    expect(taxonomyMatchDef).toContain("a_syn");
    expect(taxonomyMatchDef).toContain("b_syn");
  });

  it("substituiu position() permissivo por contenção em limite de palavra", () => {
    expect(taxonomyMatchDef).not.toMatch(/position\(\(SELECT lbl FROM a\) in/);
    expect(taxonomyMatchDef).toContain("(^| )");
    expect(taxonomyMatchDef).toContain("( |$)");
  });

  it("preserva o piso de 4 caracteres nos dois lados", () => {
    expect(taxonomyMatchDef).toMatch(/length\(\(SELECT lbl FROM a\)\) >= 4/);
    expect(taxonomyMatchDef).toMatch(/length\(\(SELECT lbl FROM b\)\) >= 4/);
  });

  it("escapa metacaracteres antes de montar o regex", () => {
    expect(taxonomyMatchDef).toContain("regexp_replace");
    expect(taxonomyMatchDef).toContain("[^a-z0-9 ]");
  });

  it("continua IMMUTABLE e com search_path fixo", () => {
    expect(taxonomyMatchDef).toMatch(/IMMUTABLE/);
    expect(taxonomyMatchDef).toMatch(/SET search_path TO 'public'/);
  });
});

describe("prova transacional — cenários comerciais reais", () => {
  it("a migration da prova existe", () => {
    expect(proof).toBeTruthy();
  });

  it("cadastra os cinco perfis empresariais do enunciado", () => {
    for (const nome of [
      "Restaurante Sabor",
      "Agência Pulse",
      "TechFlow Sistemas",
      "Contábil Prisma",
      "Eventos Vértice",
    ]) {
      expect(proof).toContain(nome);
    }
  });

  it("usa taxonomia comercial plausível", () => {
    for (const slug of [
      "p4-buffet",
      "p4-mkt-digital",
      "p4-contabilidade",
      "p4-sistema-gestao",
      "p4-embalagens",
      "p4-logistica",
      "p4-fotografia",
      "p4-estrutura",
      "p4-org-eventos",
    ]) {
      expect(proof).toContain(slug);
    }
  });

  it("cadastra relações complementares com rationale claro", () => {
    expect(proof).toContain(
      "Quem contrata catering corporativo costuma fechar buffet gourmet completo no mesmo evento.",
    );
    expect(proof).toMatch(/'complements', 90/);
    expect(proof).toMatch(/'complements', 30/);
  });

  const cenarios: Array<[number, string]> = [
    [1, "match direto real"],
    [2, "match inverso real"],
    [3, "bidirecional real"],
    [4, "complementar puro forte"],
    [5, "complementar fraco não cria match"],
    [7, "múltiplos reasons sem double count"],
    [8, "assimetria e label por perspectiva"],
    [9, "direção errada não cria match"],
    [10, "relação inativa não cria match"],
    [13, "rastreio need/offer/relation/rationale"],
    [14, "algorithm_version v2.3"],
    [15, "recompute automático e manual compartilham a lógica central"],
  ];

  it.each(cenarios)("cobre o cenário %i (%s)", (n) => {
    expect(proof).toContain(`IMPL4 FAIL ${n}:`);
  });

  it("cobre ausência de relação e cross-segment puro (6 e 12)", () => {
    expect(proof).toContain("IMPL4 FAIL 6/12:");
    expect(proof).toContain("IMPL4 FAIL 12:");
  });

  it("tenta deliberadamente falsos positivos por substring (11)", () => {
    expect(proof).toContain('IMPL4 FAIL 11: "Bala" casou com "Embalagens"');
    expect(proof).toContain('IMPL4 FAIL 11: "Porta" casou com "Transportadora"');
    expect(proof).toContain("IMPL4 FAIL 11-regressao");
  });

  it("prova idempotência do recompute", () => {
    expect(proof).toContain("recompute nao idempotente");
  });

  it("limpa todos os dados temporários", () => {
    for (const t of [
      "match_reasons",
      "matches",
      "profile_needs",
      "profile_offers",
      "profiles",
      "taxonomy_relations",
      "taxonomy_items",
      "events",
      "audit_logs",
    ]) {
      expect(proof).toMatch(new RegExp(`DELETE FROM public\\.${t}\\b`));
    }
  });
});

describe("banco não retém resíduo da prova", () => {
  it("evento temporário removido", () => {
    expect(psql(`SELECT count(*) FROM public.events WHERE id='proof-impl4'`)).toBe("0");
  });

  it("taxonomia temporária removida", () => {
    expect(psql(`SELECT count(*) FROM public.taxonomy_items WHERE slug LIKE 'p4-%'`)).toBe("0");
  });

  it("perfis e matches temporários removidos", () => {
    expect(psql(`SELECT count(*) FROM public.profiles WHERE event_id='proof-impl4'`)).toBe("0");
    expect(psql(`SELECT count(*) FROM public.matches WHERE event_id='proof-impl4'`)).toBe("0");
    expect(psql(`SELECT count(*) FROM public.audit_logs WHERE event_id='proof-impl4'`)).toBe("0");
  });
});

describe("revisão transversal da Fase 1", () => {
  it("save_own_profile_v2 normaliza offers/needs e dispara o recompute central", () => {
    const def = fnDef("save_own_profile_v2");
    expect(def).toContain("profile_offers");
    expect(def).toContain("profile_needs");
    expect(def).toContain("_recompute_matches_for_profile");
  });

  it("recompute manual usa a mesma função interna", () => {
    expect(fnDef("recompute_own_matches")).toContain("_recompute_matches_for_profile");
    expect(fnDef("recompute_matches_for_profile_id")).toContain("_recompute_matches_for_profile");
  });

  it("o matcher produz direto/inverso/bidirecional/complementar e persiste reasons", () => {
    for (const k of ["'bidirecional'", "'direto'", "'inverso'", "'complementar'"]) {
      expect(matcherDef).toContain(k);
    }
    expect(matcherDef).toContain("INSERT INTO public.match_reasons");
    expect(matcherDef).toContain("score_for_a");
    expect(matcherDef).toContain("score_for_b");
    expect(matcherDef).toContain("v2.3");
  });

  it("list_own_matches_v2 classifica por perspectiva", () => {
    const def = fnDef("list_own_matches_v2");
    expect(def).toContain("match_label_for_score");
    expect(def).toMatch(/label_me/);
  });

  it("thresholds de label seguem 75 / 40", () => {
    const def = fnDef("match_label_for_score");
    expect(def).toContain("75");
    expect(def).toContain("40");
  });
});
