import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";

/**
 * Implementação 3/12 — Matcher v2.3 (complementaridade via taxonomy_relations).
 *
 * Prova transacional: todo o cenário (evento, segmentos, itens de taxonomia,
 * perfis, ofertas/necessidades e relações) é criado dentro de BEGIN ... ROLLBACK.
 * Cada caso roda em um SAVEPOINT próprio e é revertido logo após a leitura,
 * de modo que nenhum dado de teste sobrevive à suíte.
 */

const EVT = "tmp-v23-evt";

function runScript(sql: string): Record<string, string> {
  const out = execSync(`psql -v ON_ERROR_STOP=1 -Atq -f - 2>&1`, {
    input: sql,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  const map: Record<string, string> = {};
  for (const line of out.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) map[m[1]] = m[2];
  }
  return map;
}

/** Setup comum: evento, segmentos, taxonomia e helpers temporários. */
const SETUP = `
BEGIN;
INSERT INTO public.events (id, name, city, is_active)
VALUES ('${EVT}', 'Tmp V23', 'CidadeUm', false);
INSERT INTO public.segments (id, label, sort_order)
VALUES ('tmp-v23-s1', 'TmpSeg1', 900), ('tmp-v23-s2', 'TmpSeg2', 901);
INSERT INTO public.taxonomy_items (slug, label, kind) VALUES
  ('tmp-v23-i1', 'Zetauno', 'offer'),
  ('tmp-v23-i2', 'Kappados', 'offer'),
  ('tmp-v23-i3', 'Omegatres', 'offer'),
  ('tmp-v23-i4', 'Sigmaquatro', 'offer');

CREATE FUNCTION pg_temp.tid(_slug text) RETURNS uuid LANGUAGE sql AS
$$ SELECT id FROM public.taxonomy_items WHERE slug = _slug $$;

CREATE FUNCTION pg_temp.mkprofile(_nick text, _seg text, _city text) RETURNS uuid
LANGUAGE sql AS $$
  INSERT INTO public.profiles (event_id, name, company, city, whatsapp, segment_id,
    summary, offers, needs, consent, is_demo, recovery_code)
  VALUES ('${EVT}', _nick, _nick, _city, '5199' || floor(random()*100000000)::text,
    _seg, 'tmp', '[]'::jsonb, '[]'::jsonb, true, true, 'tmp')
  RETURNING id;
$$;

CREATE FUNCTION pg_temp.addneed(_p uuid, _slug text) RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.profile_needs (profile_id, event_id, taxonomy_item_id, label, text, need_kind)
  SELECT _p, '${EVT}', ti.id, ti.label, ti.label, 'produto'
    FROM public.taxonomy_items ti WHERE ti.slug = _slug;
$$;

CREATE FUNCTION pg_temp.addoffer(_p uuid, _slug text) RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.profile_offers (profile_id, event_id, taxonomy_item_id, label, text)
  SELECT _p, '${EVT}', ti.id, ti.label, ti.label
    FROM public.taxonomy_items ti WHERE ti.slug = _slug;
$$;

CREATE FUNCTION pg_temp.rel(_from text, _to text, _w int, _active bool DEFAULT true)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.taxonomy_relations (from_taxonomy_item_id, to_taxonomy_item_id,
    relation_type, weight, active)
  VALUES (pg_temp.tid(_from), pg_temp.tid(_to), 'complements', _w, _active);
$$;

CREATE FUNCTION pg_temp.report(_tag text, _me uuid, _other uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE r RECORD; v_rm text; v_ro text;
BEGIN
  SELECT m.id, m.kind::text AS kind, m.algorithm_version,
         CASE WHEN m.a_profile_id=_me THEN m.score_for_a ELSE m.score_for_b END AS s_me,
         CASE WHEN m.a_profile_id=_me THEN m.score_for_b ELSE m.score_for_a END AS s_other
    INTO r
    FROM public.matches m
   WHERE m.event_id='${EVT}' AND m.is_active
     AND ((m.a_profile_id=_me AND m.b_profile_id=_other)
       OR (m.a_profile_id=_other AND m.b_profile_id=_me));
  IF r.id IS NULL THEN
    RAISE NOTICE '%_MATCH=none', _tag;
    RETURN;
  END IF;
  SELECT string_agg(code || ':' || weight, ',' ORDER BY code) INTO v_rm
    FROM public.match_reasons WHERE match_id=r.id AND perspective_profile_id=_me;
  SELECT string_agg(code || ':' || weight, ',' ORDER BY code) INTO v_ro
    FROM public.match_reasons WHERE match_id=r.id AND perspective_profile_id=_other;
  RAISE NOTICE '%_MATCH=yes', _tag;
  RAISE NOTICE '%_KIND=%', _tag, r.kind;
  RAISE NOTICE '%_ALGO=%', _tag, r.algorithm_version;
  RAISE NOTICE '%_SME=%', _tag, r.s_me;
  RAISE NOTICE '%_SOTHER=%', _tag, r.s_other;
  RAISE NOTICE '%_RME=%', _tag, coalesce(v_rm,'');
  RAISE NOTICE '%_ROTHER=%', _tag, coalesce(v_ro,'');
END $$;
`;

/** Um caso = SAVEPOINT + cenário + recompute + report + ROLLBACK TO. */
function useCase(tag: string, body: string) {
  return `
SAVEPOINT c_${tag};
DO $c$
DECLARE me uuid; other uuid; n int;
BEGIN
  me := pg_temp.mkprofile('me_${tag}', 'tmp-v23-s1', 'CidadeUm');
  other := pg_temp.mkprofile('ot_${tag}', 'tmp-v23-s1', 'CidadeDois');
  ${body}
  n := public._recompute_matches_for_profile(me, '${EVT}');
  RAISE NOTICE '${tag}_COUNT=%', n;
  PERFORM pg_temp.report('${tag}', me, other);
END $c$;
ROLLBACK TO SAVEPOINT c_${tag};
`;
}

const SCRIPT =
  SETUP +
  // 1. direto puro
  useCase(
    "DIRETO",
    `PERFORM pg_temp.addneed(me,'tmp-v23-i1'); PERFORM pg_temp.addoffer(other,'tmp-v23-i1');`,
  ) +
  // 2. inverso puro
  useCase(
    "INVERSO",
    `PERFORM pg_temp.addoffer(me,'tmp-v23-i1'); PERFORM pg_temp.addneed(other,'tmp-v23-i1');`,
  ) +
  // 3. bidirecional
  useCase(
    "BIDIR",
    `PERFORM pg_temp.addneed(me,'tmp-v23-i1'); PERFORM pg_temp.addoffer(other,'tmp-v23-i1');
     PERFORM pg_temp.addoffer(me,'tmp-v23-i3'); PERFORM pg_temp.addneed(other,'tmp-v23-i3');`,
  ) +
  // 4. complementar puro forte (weight 100 => 30 pts)
  useCase(
    "COMPFORTE",
    `PERFORM pg_temp.rel('tmp-v23-i1','tmp-v23-i2',100);
     PERFORM pg_temp.addneed(me,'tmp-v23-i1'); PERFORM pg_temp.addoffer(other,'tmp-v23-i2');`,
  ) +
  // 5. complementar no threshold (weight 40 => 12 pts)
  useCase(
    "COMPMIN",
    `PERFORM pg_temp.rel('tmp-v23-i1','tmp-v23-i2',40);
     PERFORM pg_temp.addneed(me,'tmp-v23-i1'); PERFORM pg_temp.addoffer(other,'tmp-v23-i2');`,
  ) +
  // 6. complementar fraco (39 => ignorado)
  useCase(
    "COMPFRACO",
    `PERFORM pg_temp.rel('tmp-v23-i1','tmp-v23-i2',39);
     PERFORM pg_temp.addneed(me,'tmp-v23-i1'); PERFORM pg_temp.addoffer(other,'tmp-v23-i2');`,
  ) +
  // 7. relação inativa
  useCase(
    "COMPINATIVA",
    `PERFORM pg_temp.rel('tmp-v23-i1','tmp-v23-i2',100,false);
     PERFORM pg_temp.addneed(me,'tmp-v23-i1'); PERFORM pg_temp.addoffer(other,'tmp-v23-i2');`,
  ) +
  // 8. direção errada (i2->i1 não serve para need i1 / offer i2)
  useCase(
    "COMPDIRECAO",
    `PERFORM pg_temp.rel('tmp-v23-i2','tmp-v23-i1',100);
     PERFORM pg_temp.addneed(me,'tmp-v23-i1'); PERFORM pg_temp.addoffer(other,'tmp-v23-i2');`,
  ) +
  // 9. perspectiva do outro (need dele -> minha oferta)
  useCase(
    "COMPOUTRO",
    `PERFORM pg_temp.rel('tmp-v23-i1','tmp-v23-i2',100);
     PERFORM pg_temp.addneed(other,'tmp-v23-i1'); PERFORM pg_temp.addoffer(me,'tmp-v23-i2');`,
  ) +
  // 10. sem double count: duas relações + itens repetidos => MAX, não soma
  useCase(
    "NODOUBLE",
    `PERFORM pg_temp.rel('tmp-v23-i1','tmp-v23-i2',100);
     PERFORM pg_temp.rel('tmp-v23-i3','tmp-v23-i4',60);
     PERFORM pg_temp.addneed(me,'tmp-v23-i1'); PERFORM pg_temp.addneed(me,'tmp-v23-i1');
     PERFORM pg_temp.addneed(me,'tmp-v23-i3');
     PERFORM pg_temp.addoffer(other,'tmp-v23-i2'); PERFORM pg_temp.addoffer(other,'tmp-v23-i2');
     PERFORM pg_temp.addoffer(other,'tmp-v23-i4');`,
  ) +
  // 11. direto + complementar preserva kind direto
  useCase(
    "DIRETOCOMP",
    `PERFORM pg_temp.rel('tmp-v23-i1','tmp-v23-i2',100);
     PERFORM pg_temp.addneed(me,'tmp-v23-i1');
     PERFORM pg_temp.addoffer(other,'tmp-v23-i1'); PERFORM pg_temp.addoffer(other,'tmp-v23-i2');`,
  ) +
  // 12. bidirecional + complementar preserva kind bidirecional
  useCase(
    "BIDIRCOMP",
    `PERFORM pg_temp.rel('tmp-v23-i1','tmp-v23-i2',100);
     PERFORM pg_temp.addneed(me,'tmp-v23-i1');
     PERFORM pg_temp.addoffer(other,'tmp-v23-i1'); PERFORM pg_temp.addoffer(other,'tmp-v23-i2');
     PERFORM pg_temp.addoffer(me,'tmp-v23-i3'); PERFORM pg_temp.addneed(other,'tmp-v23-i3');`,
  ) +
  // 13. sem sinal algum
  useCase(
    "SEMSINAL",
    `PERFORM pg_temp.addneed(me,'tmp-v23-i1'); PERFORM pg_temp.addoffer(other,'tmp-v23-i2');`,
  ) +
  // 14. idempotência: recompute duas vezes
  `
SAVEPOINT c_IDEMP;
DO $c$
DECLARE me uuid; other uuid; n1 int; n2 int; rows1 int;
BEGIN
  me := pg_temp.mkprofile('me_IDEMP', 'tmp-v23-s1', 'CidadeUm');
  other := pg_temp.mkprofile('ot_IDEMP', 'tmp-v23-s1', 'CidadeDois');
  PERFORM pg_temp.rel('tmp-v23-i1','tmp-v23-i2',100);
  PERFORM pg_temp.addneed(me,'tmp-v23-i1');
  PERFORM pg_temp.addoffer(other,'tmp-v23-i2');
  n1 := public._recompute_matches_for_profile(me, '${EVT}');
  n2 := public._recompute_matches_for_profile(me, '${EVT}');
  SELECT count(*) INTO rows1 FROM public.matches
    WHERE event_id='${EVT}' AND ((a_profile_id=me AND b_profile_id=other) OR (a_profile_id=other AND b_profile_id=me));
  RAISE NOTICE 'IDEMP_N1=%', n1;
  RAISE NOTICE 'IDEMP_N2=%', n2;
  RAISE NOTICE 'IDEMP_ROWS=%', rows1;
  PERFORM pg_temp.report('IDEMP', me, other);
END $c$;
ROLLBACK TO SAVEPOINT c_IDEMP;
ROLLBACK;
`;

const out = runScript(SCRIPT);

describe("Implementação 3 — Matcher v2.3", () => {
  it("kind direto preservado", () => {
    expect(out.DIRETO_COUNT).toBe("1");
    expect(out.DIRETO_KIND).toBe("direto");
    expect(out.DIRETO_RME).toContain("outro_oferece_o_que_procuro:55");
  });

  it("kind inverso preservado", () => {
    expect(out.INVERSO_KIND).toBe("inverso");
    expect(out.INVERSO_RME).toContain("outro_procura_o_que_ofereco:25");
  });

  it("kind bidirecional preservado", () => {
    expect(out.BIDIR_KIND).toBe("bidirecional");
  });

  it("complementar forte sozinho gera match com kind complementar e 30 pts (teto)", () => {
    expect(out.COMPFORTE_MATCH).toBe("yes");
    expect(out.COMPFORTE_KIND).toBe("complementar");
    expect(out.COMPFORTE_RME).toContain("relacao_complementar:30");
    // 30 (complementar) + 3 (atualidade). Sem 55/25/10/5/2.
    expect(out.COMPFORTE_SME).toBe("33");
  });

  it("weight 40 é o threshold efetivo e vale 12 pts", () => {
    expect(out.COMPMIN_MATCH).toBe("yes");
    expect(out.COMPMIN_RME).toContain("relacao_complementar:12");
    expect(out.COMPMIN_SME).toBe("15");
  });

  it("relação fraca (weight 39) não gera match", () => {
    expect(out.COMPFRACO_COUNT).toBe("0");
    expect(out.COMPFRACO_MATCH).toBe("none");
  });

  it("relação inativa não gera match", () => {
    expect(out.COMPINATIVA_COUNT).toBe("0");
    expect(out.COMPINATIVA_MATCH).toBe("none");
  });

  it("relação na direção errada não gera match (sem simetria implícita)", () => {
    expect(out.COMPDIRECAO_COUNT).toBe("0");
    expect(out.COMPDIRECAO_MATCH).toBe("none");
  });

  it("complementaridade da perspectiva do outro pontua só para o outro", () => {
    expect(out.COMPOUTRO_MATCH).toBe("yes");
    expect(out.COMPOUTRO_KIND).toBe("complementar");
    expect(out.COMPOUTRO_ROTHER).toContain("relacao_complementar:30");
    expect(out.COMPOUTRO_RME).not.toContain("relacao_complementar");
    expect(out.COMPOUTRO_SOTHER).toBe("33");
  });

  it("sem double count: múltiplas relações/itens usam MAX(weight)", () => {
    expect(out.NODOUBLE_RME).toContain("relacao_complementar:30");
    expect(out.NODOUBLE_SME).toBe("33");
    expect(
      (out.NODOUBLE_RME.match(/relacao_complementar/g) ?? []).length,
    ).toBe(1);
  });

  it("direto + complementar preserva kind direto e soma sem inflar", () => {
    expect(out.DIRETOCOMP_KIND).toBe("direto");
    // 55 + 30 + 3 = 88
    expect(out.DIRETOCOMP_SME).toBe("88");
  });

  it("bidirecional + complementar preserva kind bidirecional", () => {
    expect(out.BIDIRCOMP_KIND).toBe("bidirecional");
  });

  it("ausência de qualquer sinal não gera match", () => {
    expect(out.SEMSINAL_COUNT).toBe("0");
    expect(out.SEMSINAL_MATCH).toBe("none");
  });

  it("todos os matches recalculados usam algorithm_version v2.3", () => {
    for (const key of Object.keys(out).filter((k) => k.endsWith("_ALGO"))) {
      expect(out[key]).toBe("v2.3");
    }
  });

  it("reasons são gravadas por perspectiva (A e B)", () => {
    expect(out.DIRETO_RME).toContain("outro_oferece_o_que_procuro:55");
    expect(out.DIRETO_ROTHER).toContain("outro_procura_o_que_ofereco:25");
  });

  it("recompute é idempotente", () => {
    expect(out.IDEMP_N1).toBe(out.IDEMP_N2);
    expect(out.IDEMP_ROWS).toBe("1");
    expect(out.IDEMP_SME).toBe("33");
    expect(out.IDEMP_KIND).toBe("complementar");
  });

  it("não deixa dados temporários no banco", () => {
    const leftovers = execSync(
      `psql -Atc "SELECT (SELECT count(*) FROM public.events WHERE id='${EVT}') + (SELECT count(*) FROM public.taxonomy_items WHERE slug LIKE 'tmp-v23-%') + (SELECT count(*) FROM public.segments WHERE id LIKE 'tmp-v23-%')"`,
      { encoding: "utf8" },
    ).trim();
    expect(leftovers).toBe("0");
  });
});
