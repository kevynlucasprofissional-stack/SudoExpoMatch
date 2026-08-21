-- ============================================================================
-- PROVA FINAL v2.4 — hardening + E2E + regressao + validacao do feedback.
-- Transacional: cria evento/perfis/taxonomia temporarios, valida tudo com
-- RAISE EXCEPTION, registra evidencia em audit_logs (target_table
-- 'PROOF_FINAL_V24', event_id NULL) e apaga todo o resto no final.
-- ============================================================================

CREATE OR REPLACE FUNCTION pg_temp.expect(cond boolean, msg text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN IF cond IS NOT TRUE THEN RAISE EXCEPTION 'PROVA FINAL v2.4 FALHOU: %', msg; END IF; END $$;

CREATE OR REPLACE FUNCTION pg_temp.mkprofile(nm text, evt text, seg text, bsize text, btype text,
  tsize text, ttype text, tseg text, city text, demo boolean DEFAULT true, own uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v uuid; BEGIN
  INSERT INTO public.profiles(owner_id, event_id, name, company, city, segment_id, summary,
    business_size, business_type, target_business_size, target_business_type, target_segment_id, is_demo)
  VALUES (own, evt, nm, nm||' Ltda', city, seg, 'Resumo de teste '||nm,
    bsize, btype, tsize, ttype, tseg, demo)
  RETURNING id INTO v; RETURN v; END $$;

CREATE OR REPLACE FUNCTION pg_temp.addoffer(pid uuid, lbl text, tax uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.profile_offers(profile_id, event_id, segment_id, taxonomy_item_id, text, label, sort_order, source, user_confirmed, active)
  SELECT pid, p.event_id, p.segment_id, tax, lbl, lbl,
         (SELECT count(*) FROM public.profile_offers o WHERE o.profile_id=pid), 'user', true, true
    FROM public.profiles p WHERE p.id=pid;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.addneed(pid uuid, lbl text, prio boolean DEFAULT false, tax uuid DEFAULT NULL, seg text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.profile_needs(profile_id, event_id, segment_id, taxonomy_item_id, text, label, need_kind, is_priority, sort_order, source, user_confirmed, active)
  SELECT pid, p.event_id, COALESCE(seg, p.segment_id), tax, lbl, lbl, 'servico', prio,
         (SELECT count(*) FROM public.profile_needs n WHERE n.profile_id=pid), 'user', true, true
    FROM public.profiles p WHERE p.id=pid;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.reasons(mid uuid, persp uuid) RETURNS text
LANGUAGE sql AS $$
  SELECT COALESCE(string_agg(code||':'||weight, '|' ORDER BY code), '')
    FROM public.match_reasons WHERE match_id=mid AND perspective_profile_id=persp $$;

CREATE OR REPLACE FUNCTION pg_temp.mrow(p1 uuid, p2 uuid) RETURNS public.matches
LANGUAGE sql AS $$
  SELECT * FROM public.matches
   WHERE is_active AND ((a_profile_id=p1 AND b_profile_id=p2) OR (a_profile_id=p2 AND b_profile_id=p1))
   LIMIT 1 $$;

-- Hardening: helpers internos do matcher nao devem ser executaveis pelo cliente.
REVOKE ALL ON FUNCTION public._target_fit(text,text,text,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._target_fit_label(jsonb) FROM PUBLIC, anon, authenticated;

DO $outer$
DECLARE
  EVT  text := 'tmp-fin-evt';
  EVT2 text := 'tmp-fin-evt2';
  UID_A uuid := '90938fc4-1f10-4c4e-a279-0ab55ad701bd';
  UID_L uuid := '162c0e49-9544-423d-b058-9bc15642f92a';
  a uuid; b uuid; c uuid; l uuid; x uuid;
  t1 uuid; t2 uuid; t3 uuid; t4 uuid; t5 uuid; t6 uuid; t7 uuid; t8 uuid;
  tax_from uuid; tax_to uuid; rel uuid;
  m public.matches;
  n int; k int; err text;
  payload jsonb;
  prof RECORD;
  got jsonb;
BEGIN
  INSERT INTO public.events(id,name,city,is_active) VALUES
    (EVT,'Evento Prova Final','Rio Verde',true),
    (EVT2,'Evento Prova Final 2','Outra Cidade',true);

  PERFORM set_config('request.jwt.claims', json_build_object('sub', UID_A::text, 'role','authenticated')::text, true);

  ---------------------------------------------------------------------------
  -- 1. PEDIDO LITERAL DO CLIENTE (E2E real via save_own_profile_v2)
  ---------------------------------------------------------------------------
  b := pg_temp.mkprofile('B Marketing', EVT, 'marketing','medio','servico', NULL,NULL,NULL, 'Rio Verde');

  payload := jsonb_build_object(
    'event_id', EVT, 'name','Ana Alimentos','company','Delicias Ltda','city','Rio Verde',
    'segment_id','alimentacao','summary','Comercio de alimentos prontos no centro.',
    'business_size','pequeno','business_type','comercio',
    'target_business_size','medio','target_business_type','servico','target_segment_id','marketing',
    'consent', true,
    'offers', jsonb_build_array(jsonb_build_object('label','Refeicoes prontas')),
    'needs',  jsonb_build_array(jsonb_build_object('label','Sistema de gestao','segment_id','tecnologia','need_kind','servico','is_priority',true))
  );
  a := public.save_own_profile_v2(payload);

  m := pg_temp.mrow(a,b);
  PERFORM pg_temp.expect(m.id IS NOT NULL, '1: A nao identificou B (nenhum match gerado pelo backend)');
  PERFORM pg_temp.expect(m.kind = 'perfil_desejado', '1: kind deveria ser perfil_desejado, veio '||m.kind::text);
  PERFORM pg_temp.expect(m.algorithm_version = 'v2.4', '1: algorithm_version deveria ser v2.4');
  PERFORM pg_temp.expect(pg_temp.reasons(m.id, a) = 'atualidade:3|perfil_desejado:40|proximidade:2',
    '1: reasons de A inesperadas: '||pg_temp.reasons(m.id,a));
  PERFORM pg_temp.expect((CASE WHEN m.a_profile_id=a THEN m.score_for_a ELSE m.score_for_b END) = 45,
    '1: score de A deveria ser 45 (40 target + 3 atualidade + 2 proximidade)');
  PERFORM pg_temp.expect((CASE WHEN m.a_profile_id=b THEN m.score_for_a ELSE m.score_for_b END) = 5,
    '1: score de B deveria ser 5 (target de B nao existe => sem sinal de perfil desejado)');
  PERFORM pg_temp.expect(m.label = 'boa_oportunidade', '1: label deveria ser boa_oportunidade');
  SELECT label INTO err FROM public.match_reasons WHERE match_id=m.id AND perspective_profile_id=a AND code='perfil_desejado';
  PERFORM pg_temp.expect(err ILIKE '%porte%' AND err ILIKE '%tipo%' AND err ILIKE '%segmento%',
    '1: reason de perfil desejado nao e compreensivel: '||COALESCE(err,'<null>'));

  SELECT p.segment_id, p.target_segment_id,
         (SELECT n.segment_id FROM public.profile_needs n WHERE n.profile_id=p.id LIMIT 1) AS need_seg,
         (SELECT n.need_kind FROM public.profile_needs n WHERE n.profile_id=p.id LIMIT 1) AS need_kind,
         (SELECT n.is_priority FROM public.profile_needs n WHERE n.profile_id=p.id LIMIT 1) AS need_prio
    INTO prof FROM public.profiles p WHERE p.id=a;
  PERFORM pg_temp.expect(prof.segment_id='alimentacao' AND prof.target_segment_id='marketing'
    AND prof.need_seg='tecnologia' AND prof.need_kind='servico' AND prof.need_prio,
    '5: cross-segment sobrescrito: self='||prof.segment_id||' target='||prof.target_segment_id||' need='||prof.need_seg);

  INSERT INTO public.audit_logs(event_id, target_table, target_id, action, after)
  SELECT NULL, 'PROOF_FINAL_V24', m.id::text, 'cliente_literal_A_ve_B',
    jsonb_build_object(
      'match', to_jsonb(m) - 'event_id',
      'reasons_A', (SELECT jsonb_agg(jsonb_build_object('code',code,'weight',weight,'label',label) ORDER BY code)
                      FROM public.match_reasons WHERE match_id=m.id AND perspective_profile_id=a),
      'reasons_B', (SELECT jsonb_agg(jsonb_build_object('code',code,'weight',weight,'label',label) ORDER BY code)
                      FROM public.match_reasons WHERE match_id=m.id AND perspective_profile_id=b),
      'perfil_A', (SELECT jsonb_build_object('segment_id',segment_id,'business_size',business_size,'business_type',business_type,
                            'target_business_size',target_business_size,'target_business_type',target_business_type,'target_segment_id',target_segment_id)
                     FROM public.profiles WHERE id=a),
      'perfil_B', (SELECT jsonb_build_object('segment_id',segment_id,'business_size',business_size,'business_type',business_type,
                            'target_business_size',target_business_size,'target_business_type',target_business_type,'target_segment_id',target_segment_id)
                     FROM public.profiles WHERE id=b),
      'need_A', (SELECT jsonb_build_object('label',label,'segment_id',segment_id,'need_kind',need_kind,'is_priority',is_priority)
                   FROM public.profile_needs WHERE profile_id=a LIMIT 1));

  got := public.get_own_profile_v2(EVT);
  PERFORM pg_temp.expect(got->>'business_size'='pequeno' AND got->>'target_business_size'='medio'
    AND got->>'target_segment_id'='marketing',
    '1: get_own_profile_v2 nao devolve self+target corretamente');

  ---------------------------------------------------------------------------
  -- 2. INDEPENDENCIA self x target
  ---------------------------------------------------------------------------
  PERFORM public.save_own_profile_v2(payload
    || jsonb_build_object('target_business_size','grande','target_business_type','comercio','target_segment_id','tecnologia'));
  SELECT * INTO prof FROM public.profiles WHERE id=a;
  PERFORM pg_temp.expect(prof.business_size='pequeno' AND prof.business_type='comercio' AND prof.segment_id='alimentacao',
    '2a: alterar target mudou o self');
  PERFORM pg_temp.expect(prof.target_business_size='grande' AND prof.target_business_type='comercio' AND prof.target_segment_id='tecnologia',
    '2a: target nao foi atualizado');
  m := pg_temp.mrow(a,b);
  PERFORM pg_temp.expect(m.id IS NULL, '2a: match sem sinal continuou ativo apos target deixar de bater');

  PERFORM public.save_own_profile_v2(payload
    || jsonb_build_object('business_size','medio','target_business_size','grande','target_business_type','comercio','target_segment_id','tecnologia'));
  SELECT * INTO prof FROM public.profiles WHERE id=a;
  PERFORM pg_temp.expect(prof.business_size='medio' AND prof.target_business_size='grande'
    AND prof.target_business_type='comercio' AND prof.target_segment_id='tecnologia',
    '2b: alterar self substituiu o target');

  BEGIN
    PERFORM public.save_own_profile_v2(payload || jsonb_build_object('target_segment_id','segmento-que-nao-existe'));
    PERFORM pg_temp.expect(false, '14: target_segment_id inexistente foi aceito');
  EXCEPTION WHEN OTHERS THEN err := SQLERRM;
  END;
  PERFORM pg_temp.expect(err='invalid_target_segment', '14: erro esperado invalid_target_segment, veio '||COALESCE(err,'<null>'));
  BEGIN
    PERFORM public.save_own_profile_v2(payload || jsonb_build_object('target_business_size','gigante'));
    PERFORM pg_temp.expect(false, '14: target_business_size invalido foi aceito');
  EXCEPTION WHEN OTHERS THEN err := SQLERRM;
  END;
  PERFORM pg_temp.expect(err='invalid_target_business_size', '14: erro esperado invalid_target_business_size, veio '||COALESCE(err,'<null>'));
  SELECT * INTO prof FROM public.profiles WHERE id=a;
  PERFORM pg_temp.expect(prof.target_segment_id='tecnologia' AND prof.target_business_size='grande',
    '14: payload invalido deixou residuo no perfil');

  PERFORM public.save_own_profile_v2(payload);
  SELECT * INTO prof FROM public.profiles WHERE id=a;
  PERFORM pg_temp.expect(prof.business_size='pequeno' AND prof.target_segment_id='marketing', '2: restauracao do cenario falhou');
  PERFORM pg_temp.expect((pg_temp.mrow(a,b)).kind='perfil_desejado', '2: recompute nao recriou o match do cliente');

  ---------------------------------------------------------------------------
  -- 7. MATRIZ DO MATCHER v2.4 (perfil central C)
  ---------------------------------------------------------------------------
  c := pg_temp.mkprofile('C Central', EVT, 'alimentacao','pequeno','comercio','medio','servico','marketing','Rio Verde');
  PERFORM pg_temp.addoffer(c,'Refeicoes corporativas');
  PERFORM pg_temp.addneed(c,'Consultoria de marketing', true);

  INSERT INTO public.taxonomy_items(slug,label,kind,segment_id,active) VALUES ('tmp-fin-need','Tmp Fin Need','need','alimentacao',true) RETURNING id INTO tax_from;
  INSERT INTO public.taxonomy_items(slug,label,kind,segment_id,active) VALUES ('tmp-fin-offer','Tmp Fin Offer','offer','marketing',true) RETURNING id INTO tax_to;
  INSERT INTO public.taxonomy_relations(from_taxonomy_item_id,to_taxonomy_item_id,relation_type,weight,active)
  VALUES (tax_from,tax_to,'complements',80,true) RETURNING id INTO rel;
  PERFORM pg_temp.addneed(c,'Necessidade complementar tmp', false, tax_from);

  t1 := pg_temp.mkprofile('T1 target only', EVT, 'marketing','medio','servico',NULL,NULL,NULL,'Rio Verde');
  t2 := pg_temp.mkprofile('T2 target direto', EVT, 'marketing','medio','servico',NULL,NULL,NULL,'Rio Verde');
  PERFORM pg_temp.addoffer(t2,'Consultoria de marketing');
  t3 := pg_temp.mkprofile('T3 target inverso', EVT, 'marketing','medio','servico',NULL,NULL,NULL,'Rio Verde');
  PERFORM pg_temp.addneed(t3,'Refeicoes corporativas');
  t4 := pg_temp.mkprofile('T4 target complementar', EVT, 'marketing','medio','servico',NULL,NULL,NULL,'Rio Verde');
  PERFORM pg_temp.addoffer(t4,'Oferta complementar tmp', tax_to);
  t5 := pg_temp.mkprofile('T5 target parcial', EVT, 'marketing','pequeno','servico',NULL,NULL,NULL,'Rio Verde');
  t6 := pg_temp.mkprofile('T6 target mutuo', EVT, 'marketing','medio','servico','pequeno','comercio','alimentacao','Rio Verde');
  t7 := pg_temp.mkprofile('T7 target unilateral', EVT, 'construcao','grande','industria','pequeno','comercio','alimentacao','Rio Verde');
  t8 := pg_temp.mkprofile('T8 sem target', EVT, 'saude','medio','servico',NULL,NULL,NULL,'Rio Verde');

  n := public._recompute_matches_for_profile(c, EVT);

  m := pg_temp.mrow(c,t1);
  PERFORM pg_temp.expect(m.kind='perfil_desejado' AND pg_temp.reasons(m.id,c)='atualidade:3|perfil_desejado:40|proximidade:2',
    '7 target-only: '||COALESCE(m.kind::text,'<sem match>')||' / '||pg_temp.reasons(m.id,c));
  m := pg_temp.mrow(c,t2);
  PERFORM pg_temp.expect(m.kind='hibrido'
    AND pg_temp.reasons(m.id,c) LIKE '%outro_oferece_o_que_procuro:55%'
    AND pg_temp.reasons(m.id,c) LIKE '%perfil_desejado:40%'
    AND pg_temp.reasons(m.id,c) LIKE '%prioridade:10%',
    '7 target+direto: '||COALESCE(m.kind::text,'<sem match>')||' / '||pg_temp.reasons(m.id,c));
  PERFORM pg_temp.expect(m.label='alta_compatibilidade', '7 target+direto: label deveria ser alta_compatibilidade');
  m := pg_temp.mrow(c,t3);
  PERFORM pg_temp.expect(m.kind='inverso'
    AND pg_temp.reasons(m.id,c) LIKE '%outro_procura_o_que_ofereco:25%'
    AND pg_temp.reasons(m.id,c) LIKE '%perfil_desejado:40%',
    '7 target+inverso: '||COALESCE(m.kind::text,'<sem match>')||' / '||pg_temp.reasons(m.id,c));
  m := pg_temp.mrow(c,t4);
  PERFORM pg_temp.expect(m.kind='complementar'
    AND pg_temp.reasons(m.id,c) LIKE '%relacao_complementar:24%'
    AND pg_temp.reasons(m.id,c) LIKE '%perfil_desejado:40%',
    '7 target+complementar: '||COALESCE(m.kind::text,'<sem match>')||' / '||pg_temp.reasons(m.id,c));
  PERFORM pg_temp.expect((pg_temp.mrow(c,t5)).id IS NULL, '7 target parcial: nao deveria gerar match');
  m := pg_temp.mrow(c,t6);
  PERFORM pg_temp.expect(m.kind='perfil_desejado'
    AND pg_temp.reasons(m.id,c)='atualidade:3|perfil_desejado:40|perfil_desejado_mutuo:10|proximidade:2'
    AND pg_temp.reasons(m.id,t6)='atualidade:3|perfil_desejado:40|perfil_desejado_mutuo:10|proximidade:2',
    '7 target mutuo: '||pg_temp.reasons(m.id,c)||' // '||pg_temp.reasons(m.id,t6));
  PERFORM pg_temp.expect((CASE WHEN m.a_profile_id=c THEN m.score_for_a ELSE m.score_for_b END)=55
    AND (CASE WHEN m.a_profile_id=t6 THEN m.score_for_a ELSE m.score_for_b END)=55, '7 target mutuo: score por perspectiva');
  m := pg_temp.mrow(c,t7);
  PERFORM pg_temp.expect(m.kind='perfil_desejado'
    AND pg_temp.reasons(m.id,c) NOT LIKE '%perfil_desejado%'
    AND pg_temp.reasons(m.id,t7) LIKE '%perfil_desejado:40%'
    AND pg_temp.reasons(m.id,t7) NOT LIKE '%mutuo%',
    '7 target unilateral: '||pg_temp.reasons(m.id,c)||' // '||pg_temp.reasons(m.id,t7));
  PERFORM pg_temp.expect((CASE WHEN m.a_profile_id=c THEN m.score_for_a ELSE m.score_for_b END)=5
    AND (CASE WHEN m.a_profile_id=t7 THEN m.score_for_a ELSE m.score_for_b END)=45, '7 unilateral: score por perspectiva');
  PERFORM pg_temp.expect((pg_temp.mrow(c,t8)).id IS NULL, '7 sem target: nao deveria gerar match');

  SELECT count(*) INTO k FROM public.matches WHERE event_id=EVT AND is_active AND (a_profile_id=c OR b_profile_id=c);
  PERFORM pg_temp.expect(n=k AND k<=7, '7 explosao: recompute='||n||' ativas='||k);
  n := public._recompute_matches_for_profile(c, EVT);
  SELECT count(*) INTO k FROM public.matches WHERE event_id=EVT AND is_active AND (a_profile_id=c OR b_profile_id=c);
  PERFORM pg_temp.expect(n=k AND k<=7, '7 idempotencia: recompute duplicou duplas ('||n||'/'||k||')');
  SELECT count(*) INTO k FROM (
    SELECT mr.match_id, mr.perspective_profile_id, mr.code, count(*) AS qtd
      FROM public.match_reasons mr JOIN public.matches mm ON mm.id=mr.match_id
     WHERE mm.event_id=EVT
     GROUP BY 1,2,3 HAVING count(*) > 1) dup;
  PERFORM pg_temp.expect(k=0, '7 idempotencia: reasons duplicadas apos recompute ('||k||' combinacoes)');

  INSERT INTO public.audit_logs(event_id, target_table, action, after)
  VALUES (NULL,'PROOF_FINAL_V24','matriz_v24',
    (SELECT jsonb_agg(jsonb_build_object(
        'candidato', p.name, 'kind', mm.kind, 'score_C',
        CASE WHEN mm.a_profile_id=c THEN mm.score_for_a ELSE mm.score_for_b END,
        'score_outro', CASE WHEN mm.a_profile_id=c THEN mm.score_for_b ELSE mm.score_for_a END,
        'label', mm.label,
        'reasons_C', pg_temp.reasons(mm.id,c),
        'reasons_outro', pg_temp.reasons(mm.id, CASE WHEN mm.a_profile_id=c THEN mm.b_profile_id ELSE mm.a_profile_id END))
        ORDER BY p.name)
       FROM public.matches mm
       JOIN public.profiles p ON p.id = CASE WHEN mm.a_profile_id=c THEN mm.b_profile_id ELSE mm.a_profile_id END
      WHERE mm.event_id=EVT AND mm.is_active AND (mm.a_profile_id=c OR mm.b_profile_id=c)));

  ---------------------------------------------------------------------------
  -- 5. NECESSIDADES continuam sendo a segunda dimensao
  ---------------------------------------------------------------------------
  SELECT count(*) INTO k FROM public.profile_needs WHERE profile_id=c AND active;
  PERFORM pg_temp.expect(k=2, '5: necessidades de C perdidas');
  SELECT count(*) INTO k FROM public.profile_needs WHERE profile_id=c AND is_priority;
  PERFORM pg_temp.expect(k=1, '5: prioridade unica por perfil quebrada');
  SELECT count(*) INTO k FROM public.match_reasons mr JOIN public.matches mm ON mm.id=mr.match_id
   WHERE mm.event_id=EVT AND mr.perspective_profile_id=c AND mr.code='prioridade';
  PERFORM pg_temp.expect(k=1, '5: reason de prioridade deixou de existir');

  ---------------------------------------------------------------------------
  -- 8. DADOS ANTIGOS (perfil sem target_*, segmento legado)
  ---------------------------------------------------------------------------
  l := pg_temp.mkprofile('L Legado', EVT, 'comercio','pequeno','comercio',NULL,NULL,NULL,'Rio Verde', false, UID_L);
  PERFORM pg_temp.addoffer(l,'Oferta legada');
  PERFORM pg_temp.addneed(l,'Consultoria de marketing', true);
  INSERT INTO public.consents(profile_id,event_id,consent_type,version,granted) VALUES (l,EVT,'matchmaking','1',true);

  PERFORM set_config('request.jwt.claims', json_build_object('sub', UID_L::text, 'role','authenticated')::text, true);
  got := public.get_own_profile_v2(EVT);
  PERFORM pg_temp.expect(got->>'segment_id'='comercio'
    AND COALESCE(got->'target_business_size','null'::jsonb) = 'null'::jsonb
    AND COALESCE(got->'target_business_type','null'::jsonb) = 'null'::jsonb
    AND COALESCE(got->'target_segment_id','null'::jsonb) = 'null'::jsonb,
    '8: perfil legado nao carrega com target nulo (contrato Qualquer): '||got::text);

  n := public._recompute_matches_for_profile(l, EVT);
  SELECT count(*) INTO k FROM public.match_reasons mr JOIN public.matches mm ON mm.id=mr.match_id
   WHERE mm.event_id=EVT AND mr.perspective_profile_id=l AND mr.code LIKE 'perfil_desejado%';
  PERFORM pg_temp.expect(k=0, '8: matcher inventou sinal de target para perfil legado');
  PERFORM pg_temp.expect(n>0, '8: perfil legado deixou de gerar matches comerciais');
  SELECT count(*) INTO k FROM public.segments WHERE id IN ('comercio','industria','servicos');
  PERFORM pg_temp.expect(k=3, '3/8: rows de segments legados desapareceram');
  SELECT count(*) INTO k FROM public.segments WHERE id IN ('comercio','industria','servicos') AND profile_selectable;
  PERFORM pg_temp.expect(k=0, '3: segmentos legados nao deveriam ser selecionaveis no cadastro');
  SELECT count(*) INTO k FROM public.taxonomy_items WHERE segment_id IN ('comercio','industria','servicos') AND active;
  PERFORM pg_temp.expect(k>=12, '3: taxonomy_items ligados aos segmentos legados foram perdidos ('||k||')');
  PERFORM set_config('request.jwt.claims', json_build_object('sub', UID_A::text, 'role','authenticated')::text, true);

  INSERT INTO public.audit_logs(event_id, target_table, action, after)
  VALUES (NULL,'PROOF_FINAL_V24','legado_e_segmentos',
    jsonb_build_object(
      'perfil_legado', (SELECT jsonb_build_object('segment_id',segment_id,'target_business_size',target_business_size,
                          'target_business_type',target_business_type,'target_segment_id',target_segment_id)
                          FROM public.profiles WHERE id=l),
      'matches_legado', n,
      'reasons_target_legado', k,
      'segments_legados', (SELECT jsonb_agg(jsonb_build_object('id',id,'label',label,'profile_selectable',profile_selectable) ORDER BY sort_order)
                             FROM public.segments WHERE id IN ('comercio','industria','servicos')),
      'segments_selecionaveis', (SELECT count(*) FROM public.segments WHERE profile_selectable),
      'taxonomy_items_legados', (SELECT count(*) FROM public.taxonomy_items WHERE segment_id IN ('comercio','industria','servicos'))));

  ---------------------------------------------------------------------------
  -- 14. ISOLAMENTO POR EVENTO + grants/seguranca
  ---------------------------------------------------------------------------
  x := pg_temp.mkprofile('X Outro Evento', EVT2, 'marketing','medio','servico','pequeno','comercio','alimentacao','Rio Verde');
  n := public._recompute_matches_for_profile(c, EVT);
  SELECT count(*) INTO k FROM public.matches WHERE is_active AND (a_profile_id=x OR b_profile_id=x);
  PERFORM pg_temp.expect(n<=7 AND k=0, '14: cross-event vazou ('||n||' duplas para C, '||k||' com perfil de outro evento)');

  PERFORM pg_temp.expect(NOT has_function_privilege('anon','public._recompute_matches_for_profile(uuid,text)','EXECUTE')
    AND NOT has_function_privilege('authenticated','public._recompute_matches_for_profile(uuid,text)','EXECUTE'),
    '14: _recompute_matches_for_profile ficou executavel por anon/authenticated');
  PERFORM pg_temp.expect(NOT has_function_privilege('anon','public._target_fit(text,text,text,text,text,text)','EXECUTE')
    AND NOT has_function_privilege('authenticated','public._target_fit(text,text,text,text,text,text)','EXECUTE'),
    '14: _target_fit ficou publica');
  PERFORM pg_temp.expect(NOT has_function_privilege('anon','public._target_fit_label(jsonb)','EXECUTE')
    AND NOT has_function_privilege('authenticated','public._target_fit_label(jsonb)','EXECUTE'),
    '14: _target_fit_label ficou publica');
  SELECT count(*) INTO k FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public'
     AND p.proname IN ('_target_fit','_target_fit_label','_recompute_matches_for_profile','save_own_profile_v2','get_own_profile_v2')
     AND array_to_string(p.proconfig,',') LIKE '%search_path%';
  PERFORM pg_temp.expect(k=5, '14: search_path nao fixado em todas as 5 funcoes ('||k||'/5)');
  SELECT count(*) INTO k FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public'
     AND p.proname IN ('_recompute_matches_for_profile','save_own_profile_v2','get_own_profile_v2')
     AND p.prosecdef;
  PERFORM pg_temp.expect(k=3, '14: SECURITY DEFINER nao preservado nas funcoes de dados ('||k||'/3)');
  SELECT count(*) INTO k FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname='public' AND p.proname IN ('_target_fit','_target_fit_label') AND p.provolatile='i' AND NOT p.prosecdef;
  PERFORM pg_temp.expect(k=2, '14: helpers de target fit deveriam ser puros/IMMUTABLE sem SECURITY DEFINER ('||k||'/2)');

  ---------------------------------------------------------------------------
  -- limpeza total (evidencia fica em audit_logs com event_id NULL)
  ---------------------------------------------------------------------------
  DELETE FROM public.match_reasons WHERE match_id IN (SELECT id FROM public.matches WHERE event_id IN (EVT,EVT2));
  DELETE FROM public.match_decisions WHERE match_id IN (SELECT id FROM public.matches WHERE event_id IN (EVT,EVT2));
  DELETE FROM public.matches WHERE event_id IN (EVT,EVT2);
  DELETE FROM public.consents WHERE event_id IN (EVT,EVT2);
  DELETE FROM public.profile_needs WHERE event_id IN (EVT,EVT2);
  DELETE FROM public.profile_offers WHERE event_id IN (EVT,EVT2);
  DELETE FROM public.profile_segments WHERE profile_id IN (SELECT id FROM public.profiles WHERE event_id IN (EVT,EVT2));
  DELETE FROM public.analytics_events WHERE event_id IN (EVT,EVT2);
  DELETE FROM public.ai_runs WHERE event_id IN (EVT,EVT2);
  DELETE FROM public.audit_logs WHERE event_id IN (EVT,EVT2);
  DELETE FROM public.profiles WHERE event_id IN (EVT,EVT2);
  DELETE FROM public.taxonomy_relations WHERE id=rel;
  DELETE FROM public.taxonomy_items WHERE id IN (tax_from,tax_to);
  DELETE FROM public.events WHERE id IN (EVT,EVT2);

  SELECT count(*) INTO k FROM public.profiles WHERE event_id IN (EVT,EVT2);
  PERFORM pg_temp.expect(k=0, 'limpeza: perfis temporarios remanescentes');
  SELECT count(*) INTO k FROM public.taxonomy_items WHERE slug LIKE 'tmp-fin-%';
  PERFORM pg_temp.expect(k=0, 'limpeza: taxonomia temporaria remanescente');
END $outer$;