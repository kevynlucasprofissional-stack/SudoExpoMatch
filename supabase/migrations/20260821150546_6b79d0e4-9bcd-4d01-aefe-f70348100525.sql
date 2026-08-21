-- PROVA v2.4 — prova comportamental transacional do Matcher v2.4 (quem eu procuro x quem o outro e).
-- Cria evento/segmentos/perfis/itens temporarios, valida cada cenario com RAISE EXCEPTION
-- e apaga tudo ao final. Qualquer divergencia aborta a migration inteira.

CREATE FUNCTION pg_temp.expect(_cond boolean, _msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF NOT coalesce(_cond,false) THEN
    RAISE EXCEPTION 'PROVA v2.4 FALHOU: %', _msg USING ERRCODE='P0001';
  END IF;
END $$;

CREATE FUNCTION pg_temp.tid(_slug text) RETURNS uuid LANGUAGE sql AS
$$ SELECT id FROM public.taxonomy_items WHERE slug = _slug $$;

CREATE FUNCTION pg_temp.mkprofile(
  _nick text, _seg text, _size text, _type text,
  _t_size text DEFAULT NULL, _t_type text DEFAULT NULL, _t_seg text DEFAULT NULL,
  _city text DEFAULT 'CidadeUm'
) RETURNS uuid LANGUAGE sql AS $$
  INSERT INTO public.profiles (event_id, name, company, city, segment_id, summary,
    business_size, business_type, target_business_size, target_business_type, target_segment_id, is_demo)
  VALUES ('tmp-v24-evt', _nick, _nick, _city, _seg, 'tmp',
    _size, _type, _t_size, _t_type, _t_seg, true)
  RETURNING id;
$$;

CREATE FUNCTION pg_temp.addneed(_p uuid, _slug text, _prio boolean DEFAULT false) RETURNS uuid LANGUAGE sql AS $$
  INSERT INTO public.profile_needs (profile_id, event_id, taxonomy_item_id, label, text, need_kind, is_priority)
  SELECT _p, 'tmp-v24-evt', ti.id, ti.label, ti.label, 'produtos', _prio
    FROM public.taxonomy_items ti WHERE ti.slug = _slug
  RETURNING id;
$$;

CREATE FUNCTION pg_temp.addoffer(_p uuid, _slug text) RETURNS uuid LANGUAGE sql AS $$
  INSERT INTO public.profile_offers (profile_id, event_id, taxonomy_item_id, label, text)
  SELECT _p, 'tmp-v24-evt', ti.id, ti.label, ti.label
    FROM public.taxonomy_items ti WHERE ti.slug = _slug
  RETURNING id;
$$;

CREATE FUNCTION pg_temp.rel(_from text, _to text, _w int) RETURNS uuid LANGUAGE sql AS $$
  INSERT INTO public.taxonomy_relations (from_taxonomy_item_id, to_taxonomy_item_id,
    relation_type, weight, active)
  VALUES (pg_temp.tid(_from), pg_temp.tid(_to), 'complements', _w, true)
  RETURNING id;
$$;

CREATE FUNCTION pg_temp.reset() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM public.connection_events WHERE event_id='tmp-v24-evt';
  DELETE FROM public.connection_status_history WHERE connection_id IN
    (SELECT id FROM public.connections WHERE event_id='tmp-v24-evt');
  DELETE FROM public.connections WHERE event_id='tmp-v24-evt';
  DELETE FROM public.match_reasons WHERE match_id IN
    (SELECT id FROM public.matches WHERE event_id='tmp-v24-evt');
  DELETE FROM public.matches WHERE event_id='tmp-v24-evt';
  DELETE FROM public.profile_needs WHERE event_id='tmp-v24-evt';
  DELETE FROM public.profile_offers WHERE event_id='tmp-v24-evt';
  DELETE FROM public.profiles WHERE event_id='tmp-v24-evt';
  DELETE FROM public.audit_logs WHERE event_id='tmp-v24-evt';
  DELETE FROM public.taxonomy_relations WHERE from_taxonomy_item_id IN
    (SELECT id FROM public.taxonomy_items WHERE slug LIKE 'tmp-v24-%');
END $$;

CREATE FUNCTION pg_temp.res(_me uuid, _other uuid) RETURNS jsonb LANGUAGE sql AS $$
  SELECT COALESCE((
    SELECT jsonb_build_object(
      'match', true,
      'kind', m.kind::text,
      'algo', m.algorithm_version,
      'label', m.label::text,
      's_me', CASE WHEN m.a_profile_id=_me THEN m.score_for_a ELSE m.score_for_b END,
      's_other', CASE WHEN m.a_profile_id=_me THEN m.score_for_b ELSE m.score_for_a END,
      'r_me', (SELECT string_agg((r->>'code')||':'||(r->>'weight'), '|' ORDER BY r->>'code')
                 FROM jsonb_array_elements(CASE WHEN m.a_profile_id=_me THEN m.reasons_for_a ELSE m.reasons_for_b END) r),
      'r_other', (SELECT string_agg((r->>'code')||':'||(r->>'weight'), '|' ORDER BY r->>'code')
                 FROM jsonb_array_elements(CASE WHEN m.a_profile_id=_me THEN m.reasons_for_b ELSE m.reasons_for_a END) r),
      'l_me', (SELECT string_agg(r->>'label', ' ;; ' ORDER BY r->>'code')
                 FROM jsonb_array_elements(CASE WHEN m.a_profile_id=_me THEN m.reasons_for_a ELSE m.reasons_for_b END) r),
      'mr_me', (SELECT string_agg(mr.code||':'||mr.weight, '|' ORDER BY mr.code)
                  FROM public.match_reasons mr WHERE mr.match_id=m.id AND mr.perspective_profile_id=_me)
    )
    FROM public.matches m
     WHERE m.event_id='tmp-v24-evt' AND m.is_active
       AND ((m.a_profile_id=_me AND m.b_profile_id=_other) OR (m.a_profile_id=_other AND m.b_profile_id=_me))
     LIMIT 1
  ), jsonb_build_object('match', false));
$$;

DO $prova$
DECLARE a uuid; b uuid; b2 uuid; n int; r jsonb; leftovers int; mid uuid;
BEGIN
  INSERT INTO public.events (id, name, city, is_active)
  VALUES ('tmp-v24-evt', 'Tmp V24', 'CidadeUm', false);
  INSERT INTO public.segments (id, label, sort_order, profile_selectable) VALUES
    ('tmp-v24-ali', 'TmpAlimentacao', 910, true),
    ('tmp-v24-mkt', 'TmpMarketing', 911, true),
    ('tmp-v24-tec', 'TmpTecnologia', 912, true),
    ('tmp-v24-cont','TmpContabilidade', 913, true),
    ('tmp-v24-evt2','TmpEventos', 914, true);
  INSERT INTO public.taxonomy_items (slug, label, kind) VALUES
    ('tmp-v24-i1','Zetauno24','offer'), ('tmp-v24-i2','Kappados24','offer'),
    ('tmp-v24-i3','Omegatres24','offer'), ('tmp-v24-i4','Sigmaquatro24','offer');

  -- 0) versionamento
  PERFORM pg_temp.reset();
  a := pg_temp.mkprofile('a0','tmp-v24-ali','pequeno','comercio','medio','servico','tmp-v24-mkt');
  b := pg_temp.mkprofile('b0','tmp-v24-mkt','medio','servico', NULL, NULL, NULL, 'CidadeDois');
  n := public._recompute_matches_for_profile(a,'tmp-v24-evt');
  r := pg_temp.res(a,b);
  PERFORM pg_temp.expect(r->>'algo'='v2.4', 'algorithm_version v2.4');

  -- CENARIO CENTRAL DO CLIENTE (+ A: target full sem overlap comercial)
  PERFORM pg_temp.expect(n=1 AND (r->>'match')::bool, 'central: target full cria a dupla sem overlap');
  PERFORM pg_temp.expect(r->>'kind'='perfil_desejado', 'central: kind perfil_desejado');
  PERFORM pg_temp.expect((r->>'r_me') LIKE '%perfil_desejado:40%', 'central: 3 criterios => 40 pontos');
  PERFORM pg_temp.expect((r->>'l_me') LIKE '%Corresponde ao porte, tipo e segmento que você procura%', 'central: label explicavel');
  PERFORM pg_temp.expect((r->>'l_me') NOT LIKE '%tmp-v24%', 'central: nenhum id tecnico no label');
  PERFORM pg_temp.expect((r->>'s_me')::int = 43, 'central: 40 target + 3 atualidade');
  PERFORM pg_temp.expect((r->>'r_other') NOT LIKE '%perfil_desejado%', 'central: sem reciprocidade artificial');
  PERFORM pg_temp.expect((r->>'mr_me') LIKE '%perfil_desejado:40%', 'central: reason persistido em match_reasons');
  PERFORM pg_temp.expect(r->>'label'='boa_oportunidade', 'central: label boa_oportunidade');

  -- B) target parcial (2 de 3) sem sinal comercial => nao cria match
  PERFORM pg_temp.reset();
  a := pg_temp.mkprofile('a1','tmp-v24-ali','pequeno','comercio','medio','servico','tmp-v24-mkt');
  b2 := pg_temp.mkprofile('b1','tmp-v24-tec','medio','servico', NULL, NULL, NULL, 'CidadeDois');
  n := public._recompute_matches_for_profile(a,'tmp-v24-evt');
  PERFORM pg_temp.expect(n=0 AND NOT (pg_temp.res(a,b2)->>'match')::bool, 'B: 2 de 3 nao e full fit');

  -- H/I/J) criterio errado isolado => sem full target fit
  PERFORM pg_temp.reset();
  a := pg_temp.mkprofile('a2','tmp-v24-ali','pequeno','comercio','medio','servico','tmp-v24-mkt');
  b := pg_temp.mkprofile('b2s','tmp-v24-mkt','grande','servico', NULL,NULL,NULL,'CidadeDois');
  b2 := pg_temp.mkprofile('b2t','tmp-v24-mkt','medio','comercio', NULL,NULL,NULL,'CidadeDois');
  n := public._recompute_matches_for_profile(a,'tmp-v24-evt');
  PERFORM pg_temp.expect(n=0, 'H/I/J: porte, tipo ou segmento errado nao gera target fit');

  -- K) 1 criterio especifico + dois Qualquer => 20 pontos e label especifico
  PERFORM pg_temp.reset();
  a := pg_temp.mkprofile('a3','tmp-v24-ali','pequeno','comercio','medio',NULL,NULL);
  b := pg_temp.mkprofile('b3','tmp-v24-tec','medio','comercio', NULL,NULL,NULL,'CidadeDois');
  n := public._recompute_matches_for_profile(a,'tmp-v24-evt');
  r := pg_temp.res(a,b);
  PERFORM pg_temp.expect(n=1 AND (r->>'r_me') LIKE '%perfil_desejado:20%', 'K: 1 criterio => 20 pontos');
  PERFORM pg_temp.expect((r->>'l_me') LIKE '%Corresponde ao porte que você procura%', 'K: label so do criterio especifico');

  -- 2 criterios especificos => 30 pontos
  PERFORM pg_temp.reset();
  a := pg_temp.mkprofile('a3b','tmp-v24-ali','pequeno','comercio','medio','servico',NULL);
  b := pg_temp.mkprofile('b3b','tmp-v24-tec','medio','servico', NULL,NULL,NULL,'CidadeDois');
  n := public._recompute_matches_for_profile(a,'tmp-v24-evt');
  PERFORM pg_temp.expect((pg_temp.res(a,b)->>'r_me') LIKE '%perfil_desejado:30%', '2 criterios => 30 pontos');

  -- E) todos os target NULL => comportamento legado v2.3
  PERFORM pg_temp.reset();
  a := pg_temp.mkprofile('a4','tmp-v24-ali','pequeno','comercio');
  b := pg_temp.mkprofile('b4','tmp-v24-mkt','medio','servico',NULL,NULL,NULL,'CidadeDois');
  n := public._recompute_matches_for_profile(a,'tmp-v24-evt');
  PERFORM pg_temp.expect(n=0, 'E: sem target e sem sinal comercial nao cria match');
  PERFORM pg_temp.addneed(a,'tmp-v24-i1'); PERFORM pg_temp.addoffer(b,'tmp-v24-i1');
  n := public._recompute_matches_for_profile(a,'tmp-v24-evt');
  r := pg_temp.res(a,b);
  PERFORM pg_temp.expect(n=1 AND r->>'kind'='hibrido', 'E: legado direto/hibrido preservado');
  PERFORM pg_temp.expect((r->>'r_me') LIKE '%outro_oferece_o_que_procuro:55%', 'E: peso 55 preservado');
  PERFORM pg_temp.expect((r->>'r_me') NOT LIKE '%perfil_desejado%', 'E: nenhum reason de target em perfil legado');

  -- C) target completo + overlap direto => os dois reasons coexistem
  PERFORM pg_temp.reset();
  a := pg_temp.mkprofile('a5','tmp-v24-ali','pequeno','comercio','medio','servico','tmp-v24-mkt');
  b := pg_temp.mkprofile('b5','tmp-v24-mkt','medio','servico',NULL,NULL,NULL,'CidadeDois');
  PERFORM pg_temp.addneed(a,'tmp-v24-i1',true); PERFORM pg_temp.addoffer(b,'tmp-v24-i1');
  n := public._recompute_matches_for_profile(a,'tmp-v24-evt');
  r := pg_temp.res(a,b);
  PERFORM pg_temp.expect(r->>'kind'='hibrido', 'C: kind comercial tem precedencia sobre target');
  PERFORM pg_temp.expect((r->>'r_me') LIKE '%outro_oferece_o_que_procuro:55%'
                     AND (r->>'r_me') LIKE '%perfil_desejado:40%'
                     AND (r->>'r_me') LIKE '%prioridade:10%', 'C: reasons coexistem');
  PERFORM pg_temp.expect((r->>'s_me')::int = 55+40+10+5+3, 'C: soma 113 sem double count');
  PERFORM pg_temp.expect(r->>'label'='alta_compatibilidade', 'C: alta compatibilidade');

  -- D) target completo + complementaridade de taxonomia => coexistem sem double count
  PERFORM pg_temp.reset();
  a := pg_temp.mkprofile('a6','tmp-v24-ali','pequeno','comercio','medio','servico','tmp-v24-mkt');
  b := pg_temp.mkprofile('b6','tmp-v24-mkt','medio','servico',NULL,NULL,NULL,'CidadeDois');
  PERFORM pg_temp.rel('tmp-v24-i1','tmp-v24-i2',100);
  PERFORM pg_temp.addneed(a,'tmp-v24-i1'); PERFORM pg_temp.addoffer(b,'tmp-v24-i2');
  n := public._recompute_matches_for_profile(a,'tmp-v24-evt');
  r := pg_temp.res(a,b);
  PERFORM pg_temp.expect(r->>'kind'='complementar', 'D: kind complementar preservado');
  PERFORM pg_temp.expect((r->>'r_me') LIKE '%relacao_complementar:30%'
                     AND (r->>'r_me') LIKE '%perfil_desejado:40%', 'D: dois reasons distintos');
  PERFORM pg_temp.expect((r->>'s_me')::int = 30+40+3, 'D: 73 sem double count');
  PERFORM pg_temp.expect((SELECT count(*) FROM public.match_reasons mr
                            WHERE mr.perspective_profile_id=a AND mr.code='perfil_desejado')=1,
                         'D: reason de target aparece uma unica vez');

  -- F) A quer B, B nao quer A => assimetria intencional
  PERFORM pg_temp.reset();
  a := pg_temp.mkprofile('a7','tmp-v24-ali','pequeno','comercio','medio','servico','tmp-v24-mkt');
  b := pg_temp.mkprofile('b7','tmp-v24-mkt','medio','servico','grande','industria','tmp-v24-tec','CidadeDois');
  n := public._recompute_matches_for_profile(a,'tmp-v24-evt');
  r := pg_temp.res(a,b);
  PERFORM pg_temp.expect(n=1 AND (r->>'r_me') LIKE '%perfil_desejado:40%', 'F: A recebe target reason');
  PERFORM pg_temp.expect((r->>'r_other') NOT LIKE '%perfil_desejado%', 'F: B nao recebe reason falso');
  PERFORM pg_temp.expect((r->>'r_me') NOT LIKE '%mutuo%', 'F: sem mutuo em preferencia unilateral');

  -- G) A quer B e B quer A => reason mutuo nas duas perspectivas
  PERFORM pg_temp.reset();
  a := pg_temp.mkprofile('a8','tmp-v24-ali','pequeno','comercio','medio','servico','tmp-v24-mkt');
  b := pg_temp.mkprofile('b8','tmp-v24-mkt','medio','servico','pequeno','comercio','tmp-v24-ali','CidadeDois');
  n := public._recompute_matches_for_profile(a,'tmp-v24-evt');
  r := pg_temp.res(a,b);
  PERFORM pg_temp.expect((r->>'r_me') LIKE '%perfil_desejado:40%' AND (r->>'r_me') LIKE '%perfil_desejado_mutuo:10%', 'G: mutuo para A');
  PERFORM pg_temp.expect((r->>'r_other') LIKE '%perfil_desejado:40%' AND (r->>'r_other') LIKE '%perfil_desejado_mutuo:10%', 'G: mutuo para B');
  PERFORM pg_temp.expect((r->>'s_me')::int = 53 AND (r->>'s_other')::int = 53, 'G: 40+10+3 por perspectiva');
  PERFORM pg_temp.expect((SELECT count(*) FROM public.match_reasons mr
                            WHERE mr.code='perfil_desejado_mutuo')=2, 'G: mutuo sem double count');

  -- 6) target nao e hard gate: oportunidade comercial forte sobrevive a target incompativel
  PERFORM pg_temp.reset();
  a := pg_temp.mkprofile('a9','tmp-v24-ali','pequeno','comercio','medio','servico','tmp-v24-mkt');
  b := pg_temp.mkprofile('b9','tmp-v24-cont','grande','industria',NULL,NULL,NULL,'CidadeDois');
  PERFORM pg_temp.addneed(a,'tmp-v24-i3',true); PERFORM pg_temp.addoffer(b,'tmp-v24-i3');
  n := public._recompute_matches_for_profile(a,'tmp-v24-evt');
  r := pg_temp.res(a,b);
  PERFORM pg_temp.expect(n=1 AND (r->>'r_me') LIKE '%outro_oferece_o_que_procuro:55%', 'target nao destroi oportunidade comercial');
  PERFORM pg_temp.expect((r->>'r_me') NOT LIKE '%perfil_desejado%', 'sem target reason quando incompativel');

  -- M) direto / inverso / bidirecional continuam passando
  PERFORM pg_temp.reset();
  a := pg_temp.mkprofile('a10','tmp-v24-ali','pequeno','comercio');
  b := pg_temp.mkprofile('b10','tmp-v24-ali','medio','servico',NULL,NULL,NULL,'CidadeDois');
  PERFORM pg_temp.addneed(a,'tmp-v24-i1'); PERFORM pg_temp.addoffer(b,'tmp-v24-i1');
  PERFORM public._recompute_matches_for_profile(a,'tmp-v24-evt');
  PERFORM pg_temp.expect(pg_temp.res(a,b)->>'kind'='direto', 'M: direto');
  PERFORM pg_temp.reset();
  a := pg_temp.mkprofile('a11','tmp-v24-ali','pequeno','comercio');
  b := pg_temp.mkprofile('b11','tmp-v24-ali','medio','servico',NULL,NULL,NULL,'CidadeDois');
  PERFORM pg_temp.addoffer(a,'tmp-v24-i1'); PERFORM pg_temp.addneed(b,'tmp-v24-i1');
  PERFORM public._recompute_matches_for_profile(a,'tmp-v24-evt');
  PERFORM pg_temp.expect(pg_temp.res(a,b)->>'kind'='inverso', 'M: inverso');
  PERFORM pg_temp.reset();
  a := pg_temp.mkprofile('a12','tmp-v24-ali','pequeno','comercio');
  b := pg_temp.mkprofile('b12','tmp-v24-ali','medio','servico',NULL,NULL,NULL,'CidadeDois');
  PERFORM pg_temp.addneed(a,'tmp-v24-i1'); PERFORM pg_temp.addoffer(b,'tmp-v24-i1');
  PERFORM pg_temp.addoffer(a,'tmp-v24-i3'); PERFORM pg_temp.addneed(b,'tmp-v24-i3');
  PERFORM public._recompute_matches_for_profile(a,'tmp-v24-evt');
  PERFORM pg_temp.expect(pg_temp.res(a,b)->>'kind'='bidirecional', 'M: bidirecional');

  -- L) relacoes de taxonomia continuam direcionais
  PERFORM pg_temp.reset();
  a := pg_temp.mkprofile('a13','tmp-v24-ali','pequeno','comercio');
  b := pg_temp.mkprofile('b13','tmp-v24-mkt','medio','servico',NULL,NULL,NULL,'CidadeDois');
  PERFORM pg_temp.rel('tmp-v24-i1','tmp-v24-i2',100);
  PERFORM pg_temp.addneed(a,'tmp-v24-i2'); PERFORM pg_temp.addoffer(b,'tmp-v24-i1');
  n := public._recompute_matches_for_profile(a,'tmp-v24-evt');
  PERFORM pg_temp.expect(n=0, 'L: direcao inversa da relacao nao pontua');

  -- N) historico de connection nao e desativado indevidamente
  PERFORM pg_temp.reset();
  a := pg_temp.mkprofile('a14','tmp-v24-ali','pequeno','comercio','medio','servico','tmp-v24-mkt');
  b := pg_temp.mkprofile('b14','tmp-v24-mkt','medio','servico',NULL,NULL,NULL,'CidadeDois');
  PERFORM public._recompute_matches_for_profile(a,'tmp-v24-evt');
  SELECT id INTO mid FROM public.matches WHERE event_id='tmp-v24-evt' LIMIT 1;
  INSERT INTO public.connections (match_id, event_id, a_profile_id, b_profile_id, status)
  VALUES (mid, 'tmp-v24-evt', a, b, 'aguardando');
  UPDATE public.profiles SET target_segment_id='tmp-v24-tec' WHERE id=a;
  PERFORM public._recompute_matches_for_profile(a,'tmp-v24-evt');
  PERFORM pg_temp.expect((SELECT is_active FROM public.matches WHERE id=mid), 'N: match com connection permanece ativo');

  -- REGRESSAO COMERCIAL: 5 cenarios empresariais, sem explosao de matches
  PERFORM pg_temp.reset();
  a := pg_temp.mkprofile('restaurante','tmp-v24-ali','pequeno','comercio','pequeno','servico','tmp-v24-mkt');
  PERFORM pg_temp.addneed(a,'tmp-v24-i1',true);
  b := pg_temp.mkprofile('marketing','tmp-v24-mkt','pequeno','servico',NULL,NULL,NULL,'CidadeDois');
  PERFORM pg_temp.addoffer(b,'tmp-v24-i1');
  PERFORM pg_temp.mkprofile('marketing2','tmp-v24-mkt','pequeno','servico',NULL,NULL,NULL,'CidadeDois');
  PERFORM pg_temp.mkprofile('tecnologia','tmp-v24-tec','grande','servico',NULL,NULL,NULL,'CidadeDois');
  PERFORM pg_temp.mkprofile('contabilidade','tmp-v24-cont','medio','servico',NULL,NULL,NULL,'CidadeDois');
  PERFORM pg_temp.mkprofile('eventos','tmp-v24-evt2','pequeno','servico',NULL,NULL,NULL,'CidadeDois');
  n := public._recompute_matches_for_profile(a,'tmp-v24-evt');
  PERFORM pg_temp.expect(n=2, 'regressao: 1 comercial+target e 1 target-only entre 5 candidatos (sem explosao)');
  r := pg_temp.res(a,b);
  PERFORM pg_temp.expect((r->>'r_me') LIKE '%outro_oferece_o_que_procuro:55%'
                     AND (r->>'r_me') LIKE '%perfil_desejado:40%', 'regressao: melhor par mantem os dois sinais');
  PERFORM pg_temp.expect((SELECT max(score_for_a) FROM public.matches WHERE event_id='tmp-v24-evt') <= 150,
                         'regressao: score nao inflaciona acima do teto conceitual');

  -- limpeza total
  PERFORM pg_temp.reset();
  DELETE FROM public.taxonomy_items WHERE slug LIKE 'tmp-v24-%';
  DELETE FROM public.events WHERE id='tmp-v24-evt';
  DELETE FROM public.segments WHERE id LIKE 'tmp-v24-%';

  SELECT count(*)::int INTO leftovers FROM (
    SELECT 1 FROM public.profiles WHERE event_id='tmp-v24-evt'
    UNION ALL SELECT 1 FROM public.matches WHERE event_id='tmp-v24-evt'
    UNION ALL SELECT 1 FROM public.events WHERE id='tmp-v24-evt'
    UNION ALL SELECT 1 FROM public.segments WHERE id LIKE 'tmp-v24-%'
    UNION ALL SELECT 1 FROM public.taxonomy_items WHERE slug LIKE 'tmp-v24-%'
  ) x;
  PERFORM pg_temp.expect(leftovers=0, 'residuo de dados temporarios');

  RAISE NOTICE 'PROVA v2.4: cenarios OK';
END $prova$;