-- Prova comportamental da rastreabilidade do reason complementar. Cria dados temporarios, valida e limpa tudo.
CREATE FUNCTION pg_temp.tid(_slug text) RETURNS uuid LANGUAGE sql AS
$$ SELECT id FROM public.taxonomy_items WHERE slug = _slug $$;

CREATE FUNCTION pg_temp.mkprofile(_nick text, _city text DEFAULT 'CidadeUm') RETURNS uuid LANGUAGE sql AS $$
  INSERT INTO public.profiles (event_id, name, company, city, whatsapp, segment_id,
    summary, offers, needs, consent, is_demo, recovery_code)
  VALUES ('tmp-v23b-evt', _nick, _nick, _city, '55999' || floor(random()*1000000)::text,
    'tmp-v23b-s1', 'tmp', '[]'::jsonb, '[]'::jsonb, true, true, 'tmp')
  RETURNING id;
$$;

CREATE FUNCTION pg_temp.addneed(_p uuid, _slug text) RETURNS uuid LANGUAGE sql AS $$
  INSERT INTO public.profile_needs (profile_id, event_id, taxonomy_item_id, label, text, need_kind)
  SELECT _p, 'tmp-v23b-evt', ti.id, ti.label, ti.label, 'produtos'
    FROM public.taxonomy_items ti WHERE ti.slug = _slug
  RETURNING id;
$$;

CREATE FUNCTION pg_temp.addoffer(_p uuid, _slug text) RETURNS uuid LANGUAGE sql AS $$
  INSERT INTO public.profile_offers (profile_id, event_id, taxonomy_item_id, label, text)
  SELECT _p, 'tmp-v23b-evt', ti.id, ti.label, ti.label
    FROM public.taxonomy_items ti WHERE ti.slug = _slug
  RETURNING id;
$$;

CREATE FUNCTION pg_temp.rel(_from text, _to text, _w int, _rationale text DEFAULT NULL)
RETURNS uuid LANGUAGE sql AS $$
  INSERT INTO public.taxonomy_relations (from_taxonomy_item_id, to_taxonomy_item_id,
    relation_type, weight, active, rationale)
  VALUES (pg_temp.tid(_from), pg_temp.tid(_to), 'complements', _w, true, _rationale)
  RETURNING id;
$$;

CREATE FUNCTION pg_temp.reset() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM public.match_reasons WHERE match_id IN
    (SELECT id FROM public.matches WHERE event_id='tmp-v23b-evt');
  DELETE FROM public.matches WHERE event_id='tmp-v23b-evt';
  DELETE FROM public.profile_needs WHERE event_id='tmp-v23b-evt';
  DELETE FROM public.profile_offers WHERE event_id='tmp-v23b-evt';
  DELETE FROM public.profiles WHERE event_id='tmp-v23b-evt';
  DELETE FROM public.audit_logs WHERE event_id='tmp-v23b-evt';
  DELETE FROM public.taxonomy_relations WHERE from_taxonomy_item_id IN
    (SELECT id FROM public.taxonomy_items WHERE slug LIKE 'tmp-v23b-%');
END $$;

CREATE FUNCTION pg_temp.matchid(_me uuid, _other uuid) RETURNS uuid LANGUAGE sql AS $$
  SELECT m.id FROM public.matches m
   WHERE m.event_id='tmp-v23b-evt' AND m.is_active
     AND ((m.a_profile_id=_me AND m.b_profile_id=_other) OR (m.a_profile_id=_other AND m.b_profile_id=_me));
$$;

CREATE FUNCTION pg_temp.comp(_me uuid, _other uuid) RETURNS public.match_reasons LANGUAGE sql AS $$
  SELECT mr.* FROM public.match_reasons mr
   WHERE mr.match_id = pg_temp.matchid(_me,_other)
     AND mr.perspective_profile_id = _me
     AND mr.code = 'relacao_complementar';
$$;

CREATE FUNCTION pg_temp.jcomp(_me uuid, _other uuid) RETURNS jsonb LANGUAGE sql AS $$
  SELECT r FROM public.matches m,
    LATERAL jsonb_array_elements(CASE WHEN m.a_profile_id=_me THEN m.reasons_for_a ELSE m.reasons_for_b END) r
   WHERE m.id = pg_temp.matchid(_me,_other) AND r->>'code' = 'relacao_complementar';
$$;

CREATE FUNCTION pg_temp.expect(_cond boolean, _msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF NOT coalesce(_cond,false) THEN
    RAISE EXCEPTION 'PROVA v2.3-rastreio FALHOU: %', _msg USING ERRCODE='P0001';
  END IF;
END $$;

DO $prova$
DECLARE
  me uuid; other uuid; nid uuid; oid uuid; rid uuid; rid2 uuid;
  mr public.match_reasons; j jsonb; pick1 uuid; pick2 uuid; leftovers int;
BEGIN
  INSERT INTO public.events (id, name, city, is_active)
  VALUES ('tmp-v23b-evt', 'Tmp V23b', 'CidadeUm', false);
  INSERT INTO public.segments (id, label, sort_order)
  VALUES ('tmp-v23b-s1', 'TmpSegB1', 901);
  INSERT INTO public.taxonomy_items (slug, label, kind) VALUES
    ('tmp-v23b-i1','Zetaunob','offer'), ('tmp-v23b-i2','Kappadosb','offer'),
    ('tmp-v23b-i3','Omegatresb','offer'), ('tmp-v23b-i4','Sigmaquatrob','offer');

  -- 1) relacao forte aponta exatamente para need/offer/relation, 30 pts, weight bruto 100, rationale exato
  PERFORM pg_temp.reset();
  me := pg_temp.mkprofile('meA'); other := pg_temp.mkprofile('otA','CidadeDois');
  rid := pg_temp.rel('tmp-v23b-i1','tmp-v23b-i2',100,'Quem precisa de i1 costuma comprar i2.');
  nid := pg_temp.addneed(me,'tmp-v23b-i1');
  oid := pg_temp.addoffer(other,'tmp-v23b-i2');
  PERFORM public._recompute_matches_for_profile(me,'tmp-v23b-evt');
  mr := pg_temp.comp(me,other);
  PERFORM pg_temp.expect(mr.id IS NOT NULL, 'reason complementar existe');
  PERFORM pg_temp.expect(mr.profile_need_id = nid, 'profile_need_id exato');
  PERFORM pg_temp.expect(mr.profile_offer_id = oid, 'profile_offer_id exato');
  PERFORM pg_temp.expect(mr.taxonomy_relation_id = rid, 'taxonomy_relation_id exato');
  PERFORM pg_temp.expect(mr.weight = 30, 'points = 30');
  PERFORM pg_temp.expect(mr.relation_weight = 100, 'relation_weight bruto = 100');
  PERFORM pg_temp.expect(mr.rationale = 'Quem precisa de i1 costuma comprar i2.', 'rationale exato');
  -- JSON espelha os mesmos ids
  j := pg_temp.jcomp(me,other);
  PERFORM pg_temp.expect((j->>'profile_need_id')::uuid = nid
    AND (j->>'profile_offer_id')::uuid = oid
    AND (j->>'taxonomy_relation_id')::uuid = rid
    AND (j->>'relation_weight')::int = 100
    AND j->>'rationale' = 'Quem precisa de i1 costuma comprar i2.', 'json reason completo');
  -- perspectiva sem complemento nao tem reason complementar
  PERFORM pg_temp.expect((pg_temp.comp(other,me)).id IS NULL, 'perspectiva sem complemento sem reason');
  PERFORM pg_temp.expect(pg_temp.jcomp(other,me) IS NULL, 'json da outra perspectiva sem complemento');

  -- 2) rationale null => fallback neutro; threshold 40 => 12 pts
  PERFORM pg_temp.reset();
  me := pg_temp.mkprofile('meB'); other := pg_temp.mkprofile('otB','CidadeDois');
  rid := pg_temp.rel('tmp-v23b-i1','tmp-v23b-i2',40,NULL);
  nid := pg_temp.addneed(me,'tmp-v23b-i1'); oid := pg_temp.addoffer(other,'tmp-v23b-i2');
  PERFORM public._recompute_matches_for_profile(me,'tmp-v23b-evt');
  mr := pg_temp.comp(me,other);
  PERFORM pg_temp.expect(mr.rationale = 'Relacao complementar de taxonomia aprovada pela curadoria.', 'fallback neutro');
  PERFORM pg_temp.expect(mr.relation_weight = 40 AND mr.weight = 12, 'threshold 40 => 12 pts');
  PERFORM pg_temp.expect(mr.taxonomy_relation_id = rid AND mr.profile_need_id = nid
    AND mr.profile_offer_id = oid, 'ids no caso threshold');

  -- 3) empate de weight: escolha deterministica e estavel entre execucoes
  PERFORM pg_temp.reset();
  me := pg_temp.mkprofile('meC'); other := pg_temp.mkprofile('otC','CidadeDois');
  rid := pg_temp.rel('tmp-v23b-i1','tmp-v23b-i2',80,'r1');
  rid2 := pg_temp.rel('tmp-v23b-i3','tmp-v23b-i4',80,'r2');
  PERFORM pg_temp.addneed(me,'tmp-v23b-i1'); PERFORM pg_temp.addoffer(other,'tmp-v23b-i2');
  PERFORM pg_temp.addneed(me,'tmp-v23b-i3'); PERFORM pg_temp.addoffer(other,'tmp-v23b-i4');
  PERFORM public._recompute_matches_for_profile(me,'tmp-v23b-evt');
  pick1 := (pg_temp.comp(me,other)).taxonomy_relation_id;
  PERFORM public._recompute_matches_for_profile(me,'tmp-v23b-evt');
  pick2 := (pg_temp.comp(me,other)).taxonomy_relation_id;
  PERFORM pg_temp.expect(pick1 = pick2, 'empate deterministico entre execucoes');
  PERFORM pg_temp.expect(pick1 = LEAST(rid, rid2), 'empate resolve pelo menor relation id');
  PERFORM pg_temp.expect((pg_temp.comp(me,other)).weight = 24, 'sem soma no empate (24 pts)');
  PERFORM pg_temp.expect((SELECT count(*) FROM public.match_reasons
     WHERE match_id = pg_temp.matchid(me,other) AND perspective_profile_id = me
       AND code='relacao_complementar') = 1, 'apenas um reason complementar');

  -- 4) ON DELETE SET NULL preserva o reason
  DELETE FROM public.taxonomy_relations WHERE id = pick1;
  mr := pg_temp.comp(me,other);
  PERFORM pg_temp.expect(mr.id IS NOT NULL, 'reason preservado apos delete da relation');
  PERFORM pg_temp.expect(mr.taxonomy_relation_id IS NULL, 'taxonomy_relation_id vira null');
  PERFORM pg_temp.expect(mr.relation_weight = 80 AND mr.weight = 24, 'peso historico preservado');
  DELETE FROM public.profile_needs WHERE id = mr.profile_need_id;
  PERFORM pg_temp.expect((pg_temp.comp(me,other)).profile_need_id IS NULL, 'profile_need_id vira null');

  -- 5) direto/inverso intactos e sem ids de rastreio
  PERFORM pg_temp.reset();
  me := pg_temp.mkprofile('meD'); other := pg_temp.mkprofile('otD','CidadeDois');
  PERFORM pg_temp.addneed(me,'tmp-v23b-i1'); PERFORM pg_temp.addoffer(other,'tmp-v23b-i1');
  PERFORM public._recompute_matches_for_profile(me,'tmp-v23b-evt');
  PERFORM pg_temp.expect((SELECT m.kind::text FROM public.matches m WHERE m.id=pg_temp.matchid(me,other))='direto', 'direto intacto');
  PERFORM pg_temp.expect((SELECT count(*) FROM public.match_reasons
     WHERE match_id=pg_temp.matchid(me,other)
       AND (profile_need_id IS NOT NULL OR profile_offer_id IS NOT NULL
            OR taxonomy_relation_id IS NOT NULL OR relation_weight IS NOT NULL
            OR rationale IS NOT NULL)) = 0, 'reasons nao complementares sem ids');
  PERFORM pg_temp.expect((SELECT count(*) FROM public.match_reasons
     WHERE match_id=pg_temp.matchid(me,other) AND perspective_profile_id=me
       AND code='outro_oferece_o_que_procuro' AND weight=55) = 1, 'reason direto 55 intacto');

  PERFORM pg_temp.reset();
  me := pg_temp.mkprofile('meE'); other := pg_temp.mkprofile('otE','CidadeDois');
  PERFORM pg_temp.addoffer(me,'tmp-v23b-i1'); PERFORM pg_temp.addneed(other,'tmp-v23b-i1');
  PERFORM public._recompute_matches_for_profile(me,'tmp-v23b-evt');
  PERFORM pg_temp.expect((SELECT m.kind::text FROM public.matches m WHERE m.id=pg_temp.matchid(me,other))='inverso', 'inverso intacto');

  -- limpeza total
  PERFORM pg_temp.reset();
  DELETE FROM public.taxonomy_items WHERE slug LIKE 'tmp-v23b-%';
  DELETE FROM public.segments WHERE id='tmp-v23b-s1';
  DELETE FROM public.events WHERE id='tmp-v23b-evt';

  SELECT (SELECT count(*) FROM public.profiles WHERE event_id='tmp-v23b-evt')
       + (SELECT count(*) FROM public.matches WHERE event_id='tmp-v23b-evt')
       + (SELECT count(*) FROM public.taxonomy_items WHERE slug LIKE 'tmp-v23b-%')
       + (SELECT count(*) FROM public.events WHERE id='tmp-v23b-evt') INTO leftovers;
  PERFORM pg_temp.expect(leftovers = 0, 'limpeza total');
  RAISE NOTICE 'PROVA v2.3-rastreio OK';
END $prova$;