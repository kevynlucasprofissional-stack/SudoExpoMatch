import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Implementação 3/12 — Matcher v2.3 (complementaridade via taxonomy_relations).
 *
 * O papel de banco disponível para a suíte é somente leitura de funções
 * (EXECUTE em `_recompute_matches_for_profile` é restrito a service_role e NÃO
 * foi ampliado). Por isso a prova COMPORTAMENTAL dos 14 cenários roda como
 * migration transacional (arquivo em supabase/migrations, ver PROOF abaixo):
 * ela cria evento/perfis/itens/relações temporários, valida cada cenário com
 * RAISE EXCEPTION e apaga tudo ao final — qualquer divergência aborta a
 * transação inteira. Aqui validamos a definição instalada da função, os
 * invariantes de score/kind e a ausência de resíduos.
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
const proofFile = readdirSync(MIG_DIR)
  .sort()
  .map((f) => readFileSync(join(MIG_DIR, f), "utf8"))
  .find((sql) => sql.includes("PROVA v2.3"));

describe("Implementação 3 — Matcher v2.3 (definição instalada)", () => {
  it("usa algorithm_version v2.3", () => {
    expect(def).toContain("v_algo text := 'v2.3'");
  });

  it("preserva os pesos literais 55/25/10/5/3/2", () => {
    for (const [code, w] of [
      ["outro_oferece_o_que_procuro", 55],
      ["outro_procura_o_que_ofereco", 25],
      ["prioridade", 10],
      ["complementaridade", 5],
      ["atualidade", 3],
      ["proximidade", 2],
    ] as const) {
      expect(def).toContain(`'code','${code}','weight',${w}`);
    }
  });

  it("consome taxonomy_relations apenas quando ativa e do tipo complements", () => {
    expect(def).toContain("FROM public.taxonomy_relations r");
    expect(def).toContain("WHERE r.active");
    expect(def).toContain("r.relation_type = 'complements'");
  });

  it("respeita a direção from -> to nas duas perspectivas (sem simetria)", () => {
    // perspectiva "me": minha necessidade é o from, oferta do outro é o to
    expect(def).toMatch(
      /profile_needs mn[\s\S]*?mn\.profile_id = v_me[\s\S]*?mn\.taxonomy_item_id = r\.from_taxonomy_item_id[\s\S]*?profile_offers oo[\s\S]*?oo\.profile_id = v_other\.id[\s\S]*?oo\.taxonomy_item_id = r\.to_taxonomy_item_id/,
    );
    // perspectiva do outro: necessidade dele é o from, minha oferta é o to
    expect(def).toMatch(
      /profile_needs no_[\s\S]*?no_\.profile_id = v_other\.id[\s\S]*?no_\.taxonomy_item_id = r\.from_taxonomy_item_id[\s\S]*?profile_offers mo[\s\S]*?mo\.profile_id = v_me[\s\S]*?mo\.taxonomy_item_id = r\.to_taxonomy_item_id/,
    );
  });

  it("agrega por MAX(weight): uma relação nunca pontua duas vezes", () => {
    expect(def.match(/COALESCE\(MAX\(r\.weight\), 0\)/g)).toHaveLength(2);
    expect(def).not.toContain("SUM(r.weight)");
  });

  it("aplica threshold de 40 e teto de 30 pontos", () => {
    expect(def).toContain("v_comp_min_weight CONSTANT int := 40");
    expect(def).toContain("v_comp_max_pts CONSTANT int := 30");
    expect(def).toContain("LEAST(v_comp_max_pts, round(v_comp_me * 0.30)::int)");
    expect(def).toContain("LEAST(v_comp_max_pts, round(v_comp_other * 0.30)::int)");
  });

  it("grava reason de complementaridade por perspectiva, com rationale auditável", () => {
    expect(def.match(/'code','relacao_complementar'/g)).toHaveLength(2);
    expect(def.match(/relacao complementar de taxonomia \(forca %s\/100\)/g)).toHaveLength(2);
    expect(def).toContain("public.match_reasons (match_id, perspective_profile_id, code, label, weight)");
  });

  it("complementaridade sozinha é sinal suficiente nas duas perspectivas", () => {
    expect(def).toContain("IF v_comp_pts_me > 0 THEN");
    expect(def).toContain("IF v_comp_pts_other > 0 THEN\n      v_signal := true;");
  });

  it("preserva a precedência de kinds literais e usa complementar como fallback", () => {
    const kindBlock = def.slice(def.indexOf("v_kind := 'bidirecional'"));
    expect(kindBlock).toMatch(
      /v_kind := 'bidirecional'[\s\S]*?v_kind := 'hibrido'[\s\S]*?v_kind := 'direto'[\s\S]*?v_kind := 'inverso'[\s\S]*?ELSE v_kind := 'complementar'/,
    );
  });

  it("mantém idempotência (upsert por par) e preserva conexões", () => {
    expect(def).toContain("ON CONFLICT (event_id, a_profile_id, b_profile_id) DO UPDATE");
    expect(def).toContain(
      "AND NOT EXISTS (SELECT 1 FROM public.connections c WHERE c.match_id = m.id)",
    );
  });

  it("continua SECURITY DEFINER com search_path fixo e sem ampliar grants", () => {
    expect(def).toContain("SECURITY DEFINER");
    expect(def).toContain("SET search_path TO 'public'");
    const priv = psql(`
      SELECT coalesce(string_agg(DISTINCT grantee, ','), 'none')
        FROM information_schema.routine_privileges
       WHERE specific_schema='public'
         AND routine_name='_recompute_matches_for_profile'
         AND privilege_type='EXECUTE'
         AND grantee IN ('PUBLIC','anon','authenticated')
    `);
    expect(priv).toBe("none");
  });

  it("documenta fórmula e threshold no COMMENT da função", () => {
    const comment = psql(`
      SELECT obj_description(p.oid, 'pg_proc') FROM pg_proc p
        JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public' AND p.proname='_recompute_matches_for_profile'
    `);
    expect(comment).toContain("v2.3");
    expect(comment).toContain("weight >= 40");
    expect(comment).toContain("LEAST(30, round(weight*0.30))");
  });
});

describe("Implementação 3 — prova transacional dos cenários", () => {
  it("existe migration de prova com os 14 cenários", () => {
    expect(proofFile).toBeTruthy();
    const sql = proofFile as string;
    for (const marker of [
      "kind direto",
      "kind inverso",
      "kind bidirecional",
      "complementar puro gera match",
      "threshold 40 => 12 pts",
      "relacao fraca nao gera match",
      "relacao inativa nao gera match",
      "sem simetria implicita",
      "reason complementar do outro",
      "MAX(weight) sem soma de relacoes",
      "uma unica reason complementar",
      "direto+complementar => direto",
      "bidirecional+complementar",
      "sem sinal nao gera match",
      "idempotente (count)",
      "algorithm_version v2.3",
      "dados temporarios removidos",
    ]) {
      expect(sql).toContain(marker);
    }
  });

  it("a prova falha em bloco (RAISE EXCEPTION) e limpa os dados temporários", () => {
    const sql = proofFile as string;
    expect(sql).toContain("RAISE EXCEPTION 'PROVA v2.3 FALHOU: %'");
    expect(sql).toContain("DELETE FROM public.events WHERE id = 'tmp-v23-evt'");
  });

  it("nenhum dado temporário sobrou no banco", () => {
    const leftovers = psql(`
      SELECT (SELECT count(*) FROM public.events WHERE id='tmp-v23-evt')
           + (SELECT count(*) FROM public.taxonomy_items WHERE slug LIKE 'tmp-v23-%')
           + (SELECT count(*) FROM public.segments WHERE id LIKE 'tmp-v23-%')
           + (SELECT count(*) FROM public.profiles WHERE event_id='tmp-v23-evt')
           + (SELECT count(*) FROM public.taxonomy_relations)
    `);
    expect(leftovers).toBe("0");
  });
});
