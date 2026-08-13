-- Prova comportamental do Matcher v2.3. Cria dados temporarios, valida e limpa tudo.
CREATE FUNCTION pg_temp.tid(_slug text) RETURNS uuid LANGUAGE sql AS
$$ SELECT id FROM public.taxonomy_items WHERE slug = _slug $$;

CREATE FUNCTION pg_temp.mkprofile(_nick text, _city text DEFAULT 'CidadeUm') RETURNS uuid LANGUAGE sql AS $$
  INSERT INTO public.profiles (event_id, name, company, city, whatsapp, segment_id,
    summary, offers, needs, consent, is_demo, recovery_code)
  VALUES ('tmp-v23-evt', _nick, _nick, _city, '55999' || floor(random()*1000000)::text,
    'tmp-v23-s1', 'tmp', '[]'::jsonb, '[]'::jsonb, true, true, 'tmp')
  RETURNING id;
$$;

CREATE FUNCTION pg_temp.addneed(_p uuid, _slug text) RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.profile_needs (profile_id, event_id, taxonomy_item_id, label, text, need_kind)
  SELECT _p, 'tmp-v23-evt', ti.id, ti.label, ti.label, 'produtos'
    FROM public.taxonomy_items ti WHERE ti.slug = _slug;
$$;

CREATE FUNCTION pg_temp.addoffer(_p uuid, _slug text) RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.profile_offers (profile_id, event_id, taxonomy_item_id, label, text)
  SELECT _p, 'tmp-v23-evt', ti.id, ti.label, ti.label
    FROM public.taxonomy_items ti WHERE ti.slug = _slug;
$$;

CREATE FUNCTION pg_temp.rel(_from text, _to text, _w int, _active bool DEFAULT true)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.taxonomy_relations (from_taxonomy_item_id, to_taxonomy_item_id,
    relation_type, weight, active)
  VALUES (pg_temp.tid(_from), pg_temp.tid(_to), 'complements', _w, _active);
$$;

CREATE FUNCTION pg_temp.reset() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM public.match_reasons WHERE match_id IN
    (SELECT id FROM public.matches WHERE event_id='tmp-v23-evt');
  DELETE FROM public.matches WHERE event_id='tmp-v23-evt';
  DELETE FROM public.profile_needs WHERE event_id='tmp-v23-evt';
  DELETE FROM public.profile_offers WHERE event_id='tmp-v23-evt';
  DELETE FROM public.profiles WHERE event_id='tmp-v23-evt';
  DELETE FROM public.audit_logs WHERE event_id='tmp-v23-evt';
  DELETE FROM public.taxonomy_relations WHERE from_taxonomy_item_id IN
    (SELECT id FROM public.taxonomy_items WHERE slug LIKE 'tmp-v23-%');
END $$;

CREATE FUNCTION pg_temp.res(_me uuid, _other uuid) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE r RECORD; v jsonb;
BEGIN
  SELECT m.id, m.kind::text AS kind, m.algorithm_version AS algo,
         CASE WHEN m.a_profile_id=_me THEN m.score_for_a ELSE m.score_for_b END AS s_me,
         CASE WHEN m.a_profile_id=_me THEN m.score_for_b ELSE m.score_for_a END AS s_other
    INTO r FROM public.matches m
   WHERE m.event_id='tmp-v23-evt' AND m.is_active
     AND ((m.a_profile_id=_me AND m.b_profile_id=_other) OR (m.a_profile_id=_other AND m.b_profile_id=_me));
  IF r.id IS NULL THEN RETURN jsonb_build_object('match', false); END IF;
  v := jsonb_build_object('match', true, 'kind', r.kind, 'algo', r.algo,
        's_me', r.s_me, 's_other', r.s_other,
        'r_me', (SELECT coalesce(string_agg(code||':'||weight, ',' ORDER BY code),'')
                   FROM public.match_reasons WHERE match_id=r.id AND perspective_profile_id=_me),
        'r_other', (SELECT coalesce(string_agg(code||':'||weight, ',' ORDER BY code),'')
                   FROM public.match_reasons WHERE match_id=r.id AND perspective_profile_id=_other),
        'n_comp_me', (SELECT count(*) FROM public.match_reasons
                        WHERE match_id=r.id AND perspective_profile_id=_me
                          AND code='relacao_complementar'));
  RETURN v;
END $$;

CREATE FUNCTION pg_temp.expect(_cond boolean, _msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF NOT coalesce(_cond,false) THEN
    RAISE EXCEPTION 'PROVA v2.3 FALHOU: %', _msg USING ERRCODE='P0001';
  END IF;
END $$;

DO $prova$
DECLARE me uuid; other uuid; n int; r jsonb; leftovers int;
BEGIN
  INSERT INTO public.events (id, name, city, is_active)
  VALUES ('tmp-v23-evt', 'Tmp V23', 'CidadeUm', false);
  INSERT INTO public.segments (id, label, sort_order)
  VALUES ('tmp-v23-s1', 'TmpSeg1', 900);
  INSERT INTO public.taxonomy_items (slug, label, kind) VALUES
    ('tmp-v23-i1','Zetauno','offer'), ('tmp-v23-i2','Kappados','offer'),
    ('tmp-v23-i3','Omegatres','offer'), ('tmp-v23-i4','Sigmaquatro','offer');

  -- 1) direto
  PERFORM pg_temp.reset();
  me := pg_temp.mkprofile('me1'); other := pg_temp.mkprofile('ot1','CidadeDois');
  PERFORM pg_temp.addneed(me,'tmp-v23-i1'); PERFORM pg_temp.addoffer(other,'tmp-v23-i1');
  n := public._recompute_matches_for_profile(me,'tmp-v23-evt');
  r := pg_temp.res(me,other);
  PERFORM pg_temp.expect(n=1 AND r->>'kind'='direto', 'kind direto');
  PERFORM pg_temp.expect(r->>'algo'='v2.3', 'algorithm_version v2.3');
  PERFORM pg_temp.expect((r->>'r_me') LIKE '%outro_oferece_o_que_procuro:55%', 'reason A');
  PERFORM pg_temp.expect((r->>'r_other') LIKE '%outro_procura_o_que_ofereco:25%', 'reason B');

  -- 2) inverso
  PERFORM pg_temp.reset();
  me := pg_temp.mkprofile('me2'); other := pg_temp.mkprofile('ot2','CidadeDois');
  PERFORM pg_temp.addoffer(me,'tmp-v23-i1'); PERFORM pg_temp.addneed(other,'tmp-v23-i1');
  PERFORM public._recompute_matches_for_profile(me,'tmp-v23-evt');
  PERFORM pg_temp.expect(pg_temp.res(me,other)->>'kind'='inverso', 'kind inverso');

  -- 3) bidirecional
  PERFORM pg_temp.reset();
  me := pg_temp.mkprofile('me3'); other := pg_temp.mkprofile('ot3','CidadeDois');
  PERFORM pg_temp.addneed(me,'tmp-v23-i1'); PERFORM pg_temp.addoffer(other,'tmp-v23-i1');
  PERFORM pg_temp.addoffer(me,'tmp-v23-i3'); PERFORM pg_temp.addneed(other,'tmp-v23-i3');
  PERFORM public._recompute_matches_for_profile(me,'tmp-v23-evt');
  PERFORM pg_temp.expect(pg_temp.res(me,other)->>'kind'='bidirecional', 'kind bidirecional');

  -- 4) complementar puro forte (weight 100 => teto 30 pts)
  PERFORM pg_temp.reset();
  me := pg_temp.mkprofile('me4'); other := pg_temp.mkprofile('ot4','CidadeDois');
  PERFORM pg_temp.rel('tmp-v23-i1','tmp-v23-i2',100);
  PERFORM pg_temp.addneed(me,'tmp-v23-i1'); PERFORM pg_temp.addoffer(other,'tmp-v23-i2');
  n := public._recompute_matches_for_profile(me,'tmp-v23-evt');
  r := pg_temp.res(me,other);
  PERFORM pg_temp.expect(n=1 AND (r->>'match')::bool, 'complementar puro gera match');
  PERFORM pg_temp.expect(r->>'kind'='complementar', 'kind complementar');
  PERFORM pg_temp.expect((r->>'r_me') LIKE '%relacao_complementar:30%', 'reason complementar 30');
  PERFORM pg_temp.expect((r->>'s_me')::int = 33, 'score complementar = 30+3 atualidade');
  PERFORM pg_temp.expect((r->>'r_other') NOT LIKE '%relacao_complementar%', 'sem complementar para o outro');

  -- 5) threshold exato (weight 40 => 12 pts)
  PERFORM pg_temp.reset();
  me := pg_temp.mkprofile('me5'); other := pg_temp.mkprofile('ot5','CidadeDois');
  PERFORM pg_temp.rel('tmp-v23-i1','tmp-v23-i2',40);
  PERFORM pg_temp.addneed(me,'tmp-v23-i1'); PERFORM pg_temp.addoffer(other,'tmp-v23-i2');
  n := public._recompute_matches_for_profile(me,'tmp-v23-evt');
  r := pg_temp.res(me,other);
  PERFORM pg_temp.expect(n=1 AND (r->>'r_me') LIKE '%relacao_complementar:12%', 'threshold 40 => 12 pts');
  PERFORM pg_temp.expect((r->>'s_me')::int = 15, 'score 12+3');

  -- 6) relacao fraca (39) ignorada
  PERFORM pg_temp.reset();
  me := pg_temp.mkprofile('me6'); other := pg_temp.mkprofile('ot6','CidadeDois');
  PERFORM pg_temp.rel('tmp-v23-i1','tmp-v23-i2',39);
  PERFORM pg_temp.addneed(me,'tmp-v23-i1'); PERFORM pg_temp.addoffer(other,'tmp-v23-i2');
  n := public._recompute_matches_for_profile(me,'tmp-v23-evt');
  PERFORM pg_temp.expect(n=0 AND NOT (pg_temp.res(me,other)->>'match')::bool, 'relacao fraca nao gera match');

  -- 7) relacao inativa
  PERFORM pg_temp.reset();
  me := pg_temp.mkprofile('me7'); other := pg_temp.mkprofile('ot7','CidadeDois');
  PERFORM pg_temp.rel('tmp-v23-i1','tmp-v23-i2',100,false);
  PERFORM pg_temp.addneed(me,'tmp-v23-i1'); PERFORM pg_temp.addoffer(other,'tmp-v23-i2');
  n := public._recompute_matches_for_profile(me,'tmp-v23-evt');
  PERFORM pg_temp.expect(n=0, 'relacao inativa nao gera match');

  -- 8) direcao errada (i2->i1 nao serve)
  PERFORM pg_temp.reset();
  me := pg_temp.mkprofile('me8'); other := pg_temp.mkprofile('ot8','CidadeDois');
  PERFORM pg_temp.rel('tmp-v23-i2','tmp-v23-i1',100);
  PERFORM pg_temp.addneed(me,'tmp-v23-i1'); PERFORM pg_temp.addoffer(other,'tmp-v23-i2');
  n := public._recompute_matches_for_profile(me,'tmp-v23-evt');
  PERFORM pg_temp.expect(n=0, 'sem simetria implicita');

  -- 9) perspectiva do outro (simetria de descoberta)
  PERFORM pg_temp.reset();
  me := pg_temp.mkprofile('me9'); other := pg_temp.mkprofile('ot9','CidadeDois');
  PERFORM pg_temp.rel('tmp-v23-i1','tmp-v23-i2',100);
  PERFORM pg_temp.addneed(other,'tmp-v23-i1'); PERFORM pg_temp.addoffer(me,'tmp-v23-i2');
  PERFORM public._recompute_matches_for_profile(me,'tmp-v23-evt');
  r := pg_temp.res(me,other);
  PERFORM pg_temp.expect(r->>'kind'='complementar', 'kind complementar (outro)');
  PERFORM pg_temp.expect((r->>'r_other') LIKE '%relacao_complementar:30%', 'reason complementar do outro');
  PERFORM pg_temp.expect((r->>'s_other')::int = 33, 'score do outro = 33');
  PERFORM pg_temp.expect((r->>'r_me') NOT LIKE '%relacao_complementar%', 'me sem complementar');

  -- 10) sem double count
  PERFORM pg_temp.reset();
  me := pg_temp.mkprofile('me10'); other := pg_temp.mkprofile('ot10','CidadeDois');
  PERFORM pg_temp.rel('tmp-v23-i1','tmp-v23-i2',100);
  PERFORM pg_temp.rel('tmp-v23-i3','tmp-v23-i4',60);
  PERFORM pg_temp.addneed(me,'tmp-v23-i1');
  PERFORM pg_temp.addneed(me,'tmp-v23-i3');
  PERFORM pg_temp.addoffer(other,'tmp-v23-i2');
  PERFORM pg_temp.addoffer(other,'tmp-v23-i4');
  PERFORM public._recompute_matches_for_profile(me,'tmp-v23-evt');
  r := pg_temp.res(me,other);
  PERFORM pg_temp.expect((r->>'s_me')::int = 33, 'MAX(weight) sem soma de relacoes');
  PERFORM pg_temp.expect((r->>'n_comp_me')::int = 1, 'uma unica reason complementar');

  -- 11) direto + complementar preserva kind direto
  PERFORM pg_temp.reset();
  me := pg_temp.mkprofile('me11'); other := pg_temp.mkprofile('ot11','CidadeDois');
  PERFORM pg_temp.rel('tmp-v23-i1','tmp-v23-i2',100);
  PERFORM pg_temp.addneed(me,'tmp-v23-i1');
  PERFORM pg_temp.addoffer(other,'tmp-v23-i1'); PERFORM pg_temp.addoffer(other,'tmp-v23-i2');
  PERFORM public._recompute_matches_for_profile(me,'tmp-v23-evt');
  r := pg_temp.res(me,other);
  PERFORM pg_temp.expect(r->>'kind'='direto', 'direto+complementar => direto');
  PERFORM pg_temp.expect((r->>'s_me')::int = 88, 'score 55+30+3');

  -- 12) bidirecional + complementar preserva kind bidirecional
  PERFORM pg_temp.reset();
  me := pg_temp.mkprofile('me12'); other := pg_temp.mkprofile('ot12','CidadeDois');
  PERFORM pg_temp.rel('tmp-v23-i1','tmp-v23-i2',100);
  PERFORM pg_temp.addneed(me,'tmp-v23-i1');
  PERFORM pg_temp.addoffer(other,'tmp-v23-i1'); PERFORM pg_temp.addoffer(other,'tmp-v23-i2');
  PERFORM pg_temp.addoffer(me,'tmp-v23-i3'); PERFORM pg_temp.addneed(other,'tmp-v23-i3');
  PERFORM public._recompute_matches_for_profile(me,'tmp-v23-evt');
  PERFORM pg_temp.expect(pg_temp.res(me,other)->>'kind'='bidirecional', 'bidirecional+complementar');

  -- 13) sem sinal algum
  PERFORM pg_temp.reset();
  me := pg_temp.mkprofile('me13'); other := pg_temp.mkprofile('ot13','CidadeDois');
  PERFORM pg_temp.addneed(me,'tmp-v23-i1'); PERFORM pg_temp.addoffer(other,'tmp-v23-i2');
  n := public._recompute_matches_for_profile(me,'tmp-v23-evt');
  PERFORM pg_temp.expect(n=0, 'sem sinal nao gera match');

  -- 14) idempotencia
  PERFORM pg_temp.reset();
  me := pg_temp.mkprofile('me14'); other := pg_temp.mkprofile('ot14','CidadeDois');
  PERFORM pg_temp.rel('tmp-v23-i1','tmp-v23-i2',100);
  PERFORM pg_temp.addneed(me,'tmp-v23-i1'); PERFORM pg_temp.addoffer(other,'tmp-v23-i2');
  n := public._recompute_matches_for_profile(me,'tmp-v23-evt');
  PERFORM pg_temp.expect(n = public._recompute_matches_for_profile(me,'tmp-v23-evt'), 'idempotente (count)');
  PERFORM pg_temp.expect((SELECT count(*) FROM public.matches WHERE event_id='tmp-v23-evt')=1, 'sem duplicidade de match');
  r := pg_temp.res(me,other);
  PERFORM pg_temp.expect((r->>'s_me')::int = 33 AND (r->>'n_comp_me')::int = 1, 'idempotente (score/reasons)');

  -- limpeza total
  PERFORM pg_temp.reset();
  DELETE FROM public.taxonomy_items WHERE slug LIKE 'tmp-v23-%';
  DELETE FROM public.segments WHERE id LIKE 'tmp-v23-%';
  DELETE FROM public.events WHERE id = 'tmp-v23-evt';

  SELECT (SELECT count(*) FROM public.events WHERE id='tmp-v23-evt')
       + (SELECT count(*) FROM public.taxonomy_items WHERE slug LIKE 'tmp-v23-%')
       + (SELECT count(*) FROM public.segments WHERE id LIKE 'tmp-v23-%')
       + (SELECT count(*) FROM public.profiles WHERE event_id='tmp-v23-evt')
    INTO leftovers;
  PERFORM pg_temp.expect(leftovers = 0, 'dados temporarios removidos');

  RAISE NOTICE 'PROVA v2.3: 14 cenarios OK';
END $prova$;