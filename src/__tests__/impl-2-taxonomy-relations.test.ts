import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

/**
 * Implementação 2/12 — public.taxonomy_relations
 * Provas de schema/constraints/RLS. Toda escrita acontece dentro de
 * BEGIN ... ROLLBACK, com SAVEPOINTs para os casos que devem falhar.
 */

function psql(sql: string): string {
  const oneLine = sql.replace(/\s+/g, " ").trim();
  return execSync(`psql -Atc ${JSON.stringify(oneLine)}`, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

/**
 * Executa um bloco dentro de uma transação sempre revertida.
 * Cada statement roda num SAVEPOINT; o retorno diz OK|<código do erro>.
 */
function inRollback(statements: string[]): string[] {
  const body = statements
    .map(
      (s, i) => `SAVEPOINT sp${i};
DO $prf$ BEGIN
  ${s.replace(/\s+$/, "").replace(/;$/, "")};
  RAISE NOTICE 'RESULT ${i} OK';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'RESULT ${i} %', SQLSTATE;
END $prf$;
ROLLBACK TO SAVEPOINT sp${i};`,
    )
    .join("\n");

  const sql = `BEGIN;
INSERT INTO public.taxonomy_items (slug, label, kind)
VALUES ('tmp-rel-a-test', 'TmpA', 'offer'), ('tmp-rel-b-test', 'TmpB', 'need');
${body}
ROLLBACK;`;

  const out = execSync(`psql -v ON_ERROR_STOP=1 -Atq -f -`, {
    input: sql,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  const results: string[] = [];
  for (const line of out.split("\n")) {
    const m = line.match(/RESULT (\d+) (\S+)/);
    if (m) results[Number(m[1])] = m[2];
  }
  return results;
}

const A = `(SELECT id FROM public.taxonomy_items WHERE slug='tmp-rel-a-test')`;
const B = `(SELECT id FROM public.taxonomy_items WHERE slug='tmp-rel-b-test')`;
const ins = (cols: string, vals: string) =>
  `INSERT INTO public.taxonomy_relations (${cols}) VALUES (${vals})`;

describe("taxonomy_relations — estrutura", () => {
  it("tabela existe com as colunas exigidas", () => {
    const cols = psql(
      `SELECT string_agg(column_name, ',' ORDER BY column_name)
         FROM information_schema.columns
        WHERE table_schema='public' AND table_name='taxonomy_relations';`,
    ).split(",");
    for (const c of [
      "id",
      "from_taxonomy_item_id",
      "to_taxonomy_item_id",
      "relation_type",
      "weight",
      "rationale",
      "active",
      "created_at",
      "updated_at",
    ]) {
      expect(cols).toContain(c);
    }
  });

  it("FKs apontam para taxonomy_items nas duas pontas", () => {
    const fks = psql(
      `SELECT string_agg(conname, ',' ORDER BY conname) FROM pg_constraint
        WHERE conrelid='public.taxonomy_relations'::regclass AND contype='f'
          AND confrelid='public.taxonomy_items'::regclass;`,
    );
    expect(fks).toContain("from_taxonomy_item_id_fkey");
    expect(fks).toContain("to_taxonomy_item_id_fkey");
  });

  it("índice único cobre (from, to, relation_type) — direção + tipo", () => {
    const def = psql(
      `SELECT indexdef FROM pg_indexes WHERE schemaname='public'
        AND indexname='taxonomy_relations_unique_direction_type';`,
    );
    expect(def).toContain("UNIQUE");
    expect(def).toContain("from_taxonomy_item_id");
    expect(def).toContain("to_taxonomy_item_id");
    expect(def).toContain("relation_type");
  });

  it("trigger de updated_at usa o helper existente set_updated_at", () => {
    const t = psql(
      `SELECT p.proname FROM pg_trigger tg
         JOIN pg_proc p ON p.oid = tg.tgfoid
        WHERE tg.tgrelid='public.taxonomy_relations'::regclass AND NOT tg.tgisinternal;`,
    );
    expect(t).toBe("set_updated_at");
  });
});

describe("taxonomy_relations — constraints (transacional, com ROLLBACK)", () => {
  const results = inRollback([
    // 0 — inserção conceitualmente válida
    ins("from_taxonomy_item_id, to_taxonomy_item_id, rationale", `${A}, ${B}, 'ok'`),
    // 1 — origem = destino
    ins("from_taxonomy_item_id, to_taxonomy_item_id", `${A}, ${A}`),
    // 2 — peso acima da faixa
    ins("from_taxonomy_item_id, to_taxonomy_item_id, weight", `${A}, ${B}, 101`),
    // 3 — peso abaixo da faixa
    ins("from_taxonomy_item_id, to_taxonomy_item_id, weight", `${A}, ${B}, 0`),
    // 4 — limites válidos da faixa
    `${ins("from_taxonomy_item_id, to_taxonomy_item_id, weight", `${A}, ${B}, 1`)};
     ${ins("from_taxonomy_item_id, to_taxonomy_item_id, weight, relation_type", `${B}, ${A}, 100, 'complements'`)}`,
    // 5 — duplicata mesma direção/tipo
    `${ins("from_taxonomy_item_id, to_taxonomy_item_id", `${A}, ${B}`)};
     ${ins("from_taxonomy_item_id, to_taxonomy_item_id", `${A}, ${B}`)}`,
    // 6 — direcionalidade: A->B não implica B->A e ambos coexistem
    `${ins("from_taxonomy_item_id, to_taxonomy_item_id", `${A}, ${B}`)};
     IF EXISTS (SELECT 1 FROM public.taxonomy_relations
                 WHERE from_taxonomy_item_id = ${B} AND to_taxonomy_item_id = ${A})
     THEN RAISE EXCEPTION 'simetria implícita detectada'; END IF;
     ${ins("from_taxonomy_item_id, to_taxonomy_item_id", `${B}, ${A}`)};
     IF (SELECT count(*) FROM public.taxonomy_relations
          WHERE from_taxonomy_item_id IN (${A}, ${B})) <> 2
     THEN RAISE EXCEPTION 'direcoes nao coexistem'; END IF`,
    // 7 — FK inválida
    ins(
      "from_taxonomy_item_id, to_taxonomy_item_id",
      `'00000000-0000-0000-0000-000000000000'::uuid, ${A}`,
    ),
    // 8 — relation_type inválido
    ins(
      "from_taxonomy_item_id, to_taxonomy_item_id, relation_type",
      `${A}, ${B}, 'substitutes'`,
    ),
    // 9 — defaults: relation_type/weight/active
    `${ins("from_taxonomy_item_id, to_taxonomy_item_id", `${A}, ${B}`)};
     IF NOT EXISTS (SELECT 1 FROM public.taxonomy_relations
                     WHERE from_taxonomy_item_id = ${A} AND to_taxonomy_item_id = ${B}
                       AND relation_type = 'complements' AND weight = 50 AND active IS TRUE)
     THEN RAISE EXCEPTION 'defaults incorretos'; END IF`,
  ]);

  it("aceita relação válida entre itens distintos", () => {
    expect(results[0]).toBe("OK");
  });
  it("rejeita origem = destino", () => {
    expect(results[1]).toBe("23514");
  });
  it("rejeita peso fora da faixa [1,100]", () => {
    expect(results[2]).toBe("23514");
    expect(results[3]).toBe("23514");
  });
  it("aceita os limites 1 e 100", () => {
    expect(results[4]).toBe("OK");
  });
  it("rejeita duplicata da mesma direção e tipo", () => {
    expect(results[5]).toBe("23505");
  });
  it("A→B não implica B→A e ambas as direções coexistem", () => {
    expect(results[6]).toBe("OK");
  });
  it("rejeita FK inexistente", () => {
    expect(results[7]).toBe("23503");
  });
  it("rejeita relation_type fora do conjunto permitido", () => {
    expect(results[8]).toBe("23514");
  });
  it("defaults: complements / 50 / active=true", () => {
    expect(results[9]).toBe("OK");
  });

  it("não deixou dados de teste no banco", () => {
    expect(psql(`SELECT count(*) FROM public.taxonomy_relations;`)).toBe("0");
    expect(
      psql(
        `SELECT count(*) FROM public.taxonomy_items WHERE slug LIKE 'tmp-rel-%-test';`,
      ),
    ).toBe("0");
  });
});

describe("taxonomy_relations — RLS e grants", () => {
  it("RLS habilitada", () => {
    expect(
      psql(
        `SELECT relrowsecurity FROM pg_class WHERE oid='public.taxonomy_relations'::regclass;`,
      ),
    ).toBe("t");
  });

  it("anon não tem privilégio algum", () => {
    for (const priv of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
      expect(
        psql(
          `SELECT has_table_privilege('anon','public.taxonomy_relations','${priv}');`,
        ),
      ).toBe("f");
    }
  });

  it("authenticated só tem SELECT (mutação negada no nível de grant)", () => {
    expect(
      psql(
        `SELECT has_table_privilege('authenticated','public.taxonomy_relations','SELECT');`,
      ),
    ).toBe("t");
    for (const priv of ["INSERT", "UPDATE", "DELETE"]) {
      expect(
        psql(
          `SELECT has_table_privilege('authenticated','public.taxonomy_relations','${priv}');`,
        ),
      ).toBe("f");
    }
  });

  it("service_role mantém acesso total (uso interno/servidor)", () => {
    for (const priv of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
      expect(
        psql(
          `SELECT has_table_privilege('service_role','public.taxonomy_relations','${priv}');`,
        ),
      ).toBe("t");
    }
  });

  it("existe apenas policy de leitura, restrita a staff não anônimo", () => {
    const rows = psql(
      `SELECT string_agg(polcmd::text || ':' || polname, ',' ORDER BY polname)
         FROM pg_policy WHERE polrelid='public.taxonomy_relations'::regclass;`,
    ).split(",");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatch(/^r:/);

    const qual = psql(
      `SELECT pg_get_expr(polqual, polrelid) FROM pg_policy
        WHERE polrelid='public.taxonomy_relations'::regclass;`,
    );
    expect(qual).toContain("is_staff");
    expect(qual).toContain("is_anonymous");
    expect(qual).not.toBe("true");
  });

  it("nenhuma policy ampla FOR ALL", () => {
    expect(
      psql(
        `SELECT count(*) FROM pg_policy
          WHERE polrelid='public.taxonomy_relations'::regclass AND polcmd='*';`,
      ),
    ).toBe("0");
  });

  it("não está publicada em realtime", () => {
    expect(
      psql(
        `SELECT count(*) FROM pg_publication_tables
          WHERE schemaname='public' AND tablename='taxonomy_relations';`,
      ),
    ).toBe("0");
  });
});

describe("taxonomy_relations — tipos gerados", () => {
  it("types.ts expõe a tabela e suas colunas", () => {
    const src = readFileSync("src/integrations/supabase/types.ts", "utf8");
    expect(src).toContain("taxonomy_relations: {");
    expect(src).toContain("from_taxonomy_item_id");
    expect(src).toContain("to_taxonomy_item_id");
    expect(src).toContain("relation_type");
  });
});
