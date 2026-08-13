import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Correção da Implementação 3/12 — rastreabilidade do reason `relacao_complementar`.
 *
 * A prova COMPORTAMENTAL (need/offer/relation exatos, pontos, peso bruto,
 * rationale, empate determinístico, ON DELETE SET NULL e direto/inverso
 * intactos) roda como migration transacional, porque EXECUTE em
 * `_recompute_matches_for_profile` continua restrito a service_role e NÃO foi
 * ampliado. Aqui validamos o schema instalado, a definição da função e a
 * integridade/limpeza da prova.
 */

function psql(sql: string): string {
  return execSync(`psql -Atc ${JSON.stringify(sql.replace(/\s+/g, " ").trim())}`, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

const def = psql(`
  SELECT pg_get_functiondef(p.oid) FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname='_recompute_matches_for_profile'
`);

const MIG_DIR = "supabase/migrations";
const proof = readdirSync(MIG_DIR)
  .sort()
  .map((f) => readFileSync(join(MIG_DIR, f), "utf8"))
  .find((sql) => sql.includes("PROVA v2.3-rastreio"));

describe("match_reasons — colunas de rastreio (migration aditiva)", () => {
  const cols = psql(`
    SELECT string_agg(column_name || ':' || data_type || ':' || is_nullable, ',' ORDER BY column_name)
      FROM information_schema.columns
     WHERE table_schema='public' AND table_name='match_reasons'
  `);

  it("adiciona os campos nullable de rastreio", () => {
    expect(cols).toContain("profile_need_id:uuid:YES");
    expect(cols).toContain("profile_offer_id:uuid:YES");
    expect(cols).toContain("taxonomy_relation_id:uuid:YES");
    expect(cols).toContain("rationale:text:YES");
    expect(cols).toContain("relation_weight:integer:YES");
  });

  it("preserva as colunas existentes", () => {
    for (const c of [
      "id:uuid",
      "match_id:uuid",
      "perspective_profile_id:uuid",
      "code:text",
      "label:text",
      "weight:integer",
    ]) {
      expect(cols).toContain(c);
    }
  });

  it("usa ON DELETE SET NULL nas três FKs novas", () => {
    const fks = psql(`
      SELECT string_agg(kcu.column_name || '->' || ccu.table_name || ':' || rc.delete_rule, ',' ORDER BY kcu.column_name)
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
        JOIN information_schema.referential_constraints rc ON rc.constraint_name = tc.constraint_name
        JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
       WHERE tc.table_schema='public' AND tc.table_name='match_reasons' AND tc.constraint_type='FOREIGN KEY'
         AND kcu.column_name IN ('profile_need_id','profile_offer_id','taxonomy_relation_id')
    `);
    expect(fks).toContain("profile_need_id->profile_needs:SET NULL");
    expect(fks).toContain("profile_offer_id->profile_offers:SET NULL");
    expect(fks).toContain("taxonomy_relation_id->taxonomy_relations:SET NULL");
  });

  it("restringe relation_weight a 1..100 quando não nulo", () => {
    const chk = psql(`
      SELECT pg_get_constraintdef(c.oid) FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
       WHERE t.relname='match_reasons' AND c.conname='match_reasons_relation_weight_check'
    `);
    expect(chk).toContain("relation_weight IS NULL");
    expect(chk).toContain(">= 1");
    expect(chk).toContain("<= 100");
  });
});

describe("_recompute_matches_for_profile — seleção determinística e persistência", () => {
  it("mantém fórmula, threshold, teto e versão", () => {
    expect(def).toContain("v_algo text := 'v2.3'");
    expect(def).toContain("v_comp_min_weight CONSTANT int := 40");
    expect(def).toContain("v_comp_max_pts CONSTANT int := 30");
    expect(def).toContain("round(v_comp_me * 0.30)");
    expect(def).toContain("round(v_comp_other * 0.30)");
  });

  it("escolhe a melhor relação com weight DESC e tie-break estável, uma por perspectiva", () => {
    expect(def).toContain("ORDER BY r.weight DESC, r.id ASC, mn.id ASC, oo.id ASC");
    expect(def).toContain("ORDER BY r.weight DESC, r.id ASC, no_.id ASC, mo.id ASC");
    expect(def.match(/LIMIT 1/g)?.length).toBe(2);
  });

  it("preserva a direção need(from) -> offer(to)", () => {
    expect(def).toContain("mn.taxonomy_item_id = r.from_taxonomy_item_id");
    expect(def).toContain("oo.taxonomy_item_id = r.to_taxonomy_item_id");
    expect(def).toContain("no_.taxonomy_item_id = r.from_taxonomy_item_id");
    expect(def).toContain("mo.taxonomy_item_id = r.to_taxonomy_item_id");
  });

  it("inclui os ids, o peso bruto e o rationale no JSON dos reasons", () => {
    for (const key of [
      "'profile_need_id', v_rel_me.need_id",
      "'profile_offer_id', v_rel_me.offer_id",
      "'taxonomy_relation_id', v_rel_me.relation_id",
      "'relation_weight', v_comp_me",
      "'profile_need_id', v_rel_other.need_id",
      "'profile_offer_id', v_rel_other.offer_id",
      "'taxonomy_relation_id', v_rel_other.relation_id",
      "'relation_weight', v_comp_other",
    ]) {
      expect(def).toContain(key);
    }
  });

  it("usa fallback neutro quando o rationale da relação é nulo", () => {
    expect(def).toContain(
      "v_comp_fallback CONSTANT text := 'Relacao complementar de taxonomia aprovada pela curadoria.'",
    );
    expect(def).toContain("COALESCE(v_rel_me.rationale, v_comp_fallback)");
    expect(def).toContain("COALESCE(v_rel_other.rationale, v_comp_fallback)");
  });

  it("persiste os campos de rastreio em match_reasons", () => {
    expect(def).toContain(
      "profile_need_id, profile_offer_id, taxonomy_relation_id, relation_weight, rationale",
    );
    expect(def).toContain("(r->>'taxonomy_relation_id')::uuid");
    expect(def).toContain("(r->>'relation_weight')::int");
  });

  it("não soma relações: uma única seleção por perspectiva", () => {
    expect(def).not.toContain("SUM(r.weight)");
    expect(def.match(/relation_type = 'complements'/g)?.length).toBe(2);
  });
});

describe("prova transacional de rastreio", () => {
  it("existe e cobre os cenários exigidos", () => {
    expect(proof).toBeTruthy();
    for (const marker of [
      "profile_need_id exato",
      "profile_offer_id exato",
      "taxonomy_relation_id exato",
      "points = 30",
      "relation_weight bruto = 100",
      "rationale exato",
      "perspectiva sem complemento sem reason",
      "fallback neutro",
      "empate deterministico entre execucoes",
      "empate resolve pelo menor relation id",
      "reason preservado apos delete da relation",
      "taxonomy_relation_id vira null",
      "profile_need_id vira null",
      "direto intacto",
      "inverso intacto",
      "reasons nao complementares sem ids",
    ]) {
      expect(proof).toContain(marker);
    }
  });

  it("aborta a transação em qualquer divergência e limpa os dados", () => {
    expect(proof).toContain("RAISE EXCEPTION 'PROVA v2.3-rastreio FALHOU");
    expect(proof).toContain("limpeza total");
  });

  it("não deixou resíduos no banco", () => {
    const leftovers = psql(`
      SELECT (SELECT count(*) FROM public.events WHERE id='tmp-v23b-evt')
           + (SELECT count(*) FROM public.taxonomy_items WHERE slug LIKE 'tmp-v23b-%')
           + (SELECT count(*) FROM public.profiles WHERE event_id='tmp-v23b-evt')
    `);
    expect(leftovers).toBe("0");
  });
});
