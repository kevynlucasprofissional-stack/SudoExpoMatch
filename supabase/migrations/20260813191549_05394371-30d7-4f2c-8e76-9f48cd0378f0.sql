-- =====================================================================
-- IMPL 4/12 — correcao minima de falso positivo em taxonomy_match
-- (substring passa a exigir limite de palavra) + prova comportamental
-- com cenarios comerciais reais. Todos os dados de prova sao removidos.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.taxonomy_match(_a_tax uuid, _a_label text, _b_tax uuid, _b_label text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  WITH
    a AS (SELECT public.norm_label(_a_label) AS lbl),
    b AS (SELECT public.norm_label(_b_label) AS lbl),
    a_syn AS (
      SELECT unnest(coalesce(ti.synonyms,'{}'::text[])) AS s
        FROM public.taxonomy_items ti WHERE ti.id = _a_tax
    ),
    b_syn AS (
      SELECT unnest(coalesce(ti.synonyms,'{}'::text[])) AS s
        FROM public.taxonomy_items ti WHERE ti.id = _b_tax
    )
  SELECT
    -- mesmo item de taxonomia
    (_a_tax IS NOT NULL AND _a_tax = _b_tax)
    -- labels normalizados iguais
    OR ((SELECT lbl FROM a) = (SELECT lbl FROM b) AND (SELECT lbl FROM a) <> '')
    -- label do lado A aparece nos sinonimos do lado B
    OR EXISTS (SELECT 1 FROM b_syn WHERE public.norm_label(s) = (SELECT lbl FROM a) AND (SELECT lbl FROM a) <> '')
    -- label do lado B aparece nos sinonimos do lado A
    OR EXISTS (SELECT 1 FROM a_syn WHERE public.norm_label(s) = (SELECT lbl FROM b) AND (SELECT lbl FROM b) <> '')
    -- v2.3.1: contencao somente em LIMITE DE PALAVRA (>=4 chars em ambos os lados).
    -- Evita falsos positivos por substring acidental ("bala" dentro de "embalagens",
    -- "porta" dentro de "transportadora"), preservando "marketing" ~ "marketing digital".
    OR (
      length((SELECT lbl FROM a)) >= 4 AND length((SELECT lbl FROM b)) >= 4 AND (
        (SELECT lbl FROM b) ~ ('(^| )' || regexp_replace((SELECT lbl FROM a), '[^a-z0-9 ]', '.', 'g') || '( |$)')
        OR (SELECT lbl FROM a) ~ ('(^| )' || regexp_replace((SELECT lbl FROM b), '[^a-z0-9 ]', '.', 'g') || '( |$)')
      )
    );
$function$;

DO $proof$
DECLARE
  ev CONSTANT text := 'proof-impl4';
  -- taxonomia
  t_buffet uuid; t_mkt uuid; t_trafego uuid; t_conta uuid; t_sis uuid;
  t_emb uuid; t_log uuid; t_foto uuid; t_estrut uuid; t_orgev uuid;
  t_catering uuid; t_bgourmet uuid; t_cerimonial uuid;
  t_sinal uuid; t_gráfica uuid; t_esg uuid; t_solar uuid;
  t_segtrab uuid; t_unif uuid; t_jard uuid; t_trad uuid;
  t_bala uuid; t_porta uuid; t_transp uuid; t_marketing uuid;
  -- relacoes
  r_forte uuid; r_fraco uuid; r_dir_errada uuid; r_inativa uuid;
  -- perfis
  p_rest uuid; p_mkt uuid; p_ti uuid; p_ct uuid; p_ev uuid;
  p_w uuid; p_z uuid; p_w2 uuid; p_z2 uuid; p_w3 uuid; p_z3 uuid;
  p_w4 uuid; p_z4 uuid; p_w5 uuid; p_z5 uuid;
  p_fp1a uuid; p_fp1b uuid; p_fp2a uuid; p_fp2b uuid;
  p_rg1 uuid; p_rg2 uuid; p_d1 uuid; p_d2 uuid; p_i1 uuid; p_i2 uuid;
  n_catering uuid; o_bgourmet uuid;
  m RECORD; rec RECORD;
  v_pid uuid; v_txt text; v_int int; v_bool boolean;
  v_score_rest int; v_score_ti int;
BEGIN
  ---------------------------------------------------------------- setup
  INSERT INTO public.events (id, name, city, is_active)
  VALUES (ev, 'Prova IMPL4', 'Rio do Sul', false);

  INSERT INTO public.taxonomy_items (slug,label,kind) VALUES
    ('p4-buffet','Buffet','both'),('p4-mkt-digital','Marketing digital','both'),
    ('p4-trafego','Tráfego pago','offer'),('p4-contabilidade','Contabilidade empresarial','both'),
    ('p4-sistema-gestao','Sistema de gestão','both'),('p4-embalagens','Embalagens','both'),
    ('p4-logistica','Logística','both'),('p4-fotografia','Fotografia','both'),
    ('p4-estrutura','Estrutura para eventos','both'),('p4-org-eventos','Organização de eventos','both'),
    ('p4-catering','Catering corporativo','need'),('p4-buffet-gourmet','Buffet gourmet','offer'),
    ('p4-cerimonial','Cerimonial social','offer'),('p4-sinalizacao','Sinalização visual','need'),
    ('p4-grafica','Gráfica rápida','offer'),('p4-esg','Consultoria ESG','need'),
    ('p4-solar','Energia solar','offer'),('p4-seg-trabalho','Segurança do trabalho','need'),
    ('p4-uniformes','Uniformes profissionais','offer'),('p4-jardinagem','Jardinagem','need'),
    ('p4-traducao','Tradução juramentada','offer'),('p4-bala','Bala','need'),
    ('p4-porta','Porta','need'),('p4-transportadora','Transportadora','offer'),
    ('p4-marketing','Marketing','need');

  SELECT id INTO t_buffet FROM public.taxonomy_items WHERE slug='p4-buffet';
  SELECT id INTO t_mkt FROM public.taxonomy_items WHERE slug='p4-mkt-digital';
  SELECT id INTO t_trafego FROM public.taxonomy_items WHERE slug='p4-trafego';
  SELECT id INTO t_conta FROM public.taxonomy_items WHERE slug='p4-contabilidade';
  SELECT id INTO t_sis FROM public.taxonomy_items WHERE slug='p4-sistema-gestao';
  SELECT id INTO t_emb FROM public.taxonomy_items WHERE slug='p4-embalagens';
  SELECT id INTO t_log FROM public.taxonomy_items WHERE slug='p4-logistica';
  SELECT id INTO t_foto FROM public.taxonomy_items WHERE slug='p4-fotografia';
  SELECT id INTO t_estrut FROM public.taxonomy_items WHERE slug='p4-estrutura';
  SELECT id INTO t_orgev FROM public.taxonomy_items WHERE slug='p4-org-eventos';
  SELECT id INTO t_catering FROM public.taxonomy_items WHERE slug='p4-catering';
  SELECT id INTO t_bgourmet FROM public.taxonomy_items WHERE slug='p4-buffet-gourmet';
  SELECT id INTO t_cerimonial FROM public.taxonomy_items WHERE slug='p4-cerimonial';
  SELECT id INTO t_sinal FROM public.taxonomy_items WHERE slug='p4-sinalizacao';
  SELECT id INTO t_gráfica FROM public.taxonomy_items WHERE slug='p4-grafica';
  SELECT id INTO t_esg FROM public.taxonomy_items WHERE slug='p4-esg';
  SELECT id INTO t_solar FROM public.taxonomy_items WHERE slug='p4-solar';
  SELECT id INTO t_segtrab FROM public.taxonomy_items WHERE slug='p4-seg-trabalho';
  SELECT id INTO t_unif FROM public.taxonomy_items WHERE slug='p4-uniformes';
  SELECT id INTO t_jard FROM public.taxonomy_items WHERE slug='p4-jardinagem';
  SELECT id INTO t_trad FROM public.taxonomy_items WHERE slug='p4-traducao';
  SELECT id INTO t_bala FROM public.taxonomy_items WHERE slug='p4-bala';
  SELECT id INTO t_porta FROM public.taxonomy_items WHERE slug='p4-porta';
  SELECT id INTO t_transp FROM public.taxonomy_items WHERE slug='p4-transportadora';
  SELECT id INTO t_marketing FROM public.taxonomy_items WHERE slug='p4-marketing';

  -- relacoes complementares realistas
  INSERT INTO public.taxonomy_relations (from_taxonomy_item_id,to_taxonomy_item_id,relation_type,weight,rationale,active)
  VALUES (t_catering, t_bgourmet, 'complements', 90,
          'Quem contrata catering corporativo costuma fechar buffet gourmet completo no mesmo evento.', true)
  RETURNING id INTO r_forte;

  INSERT INTO public.taxonomy_relations (from_taxonomy_item_id,to_taxonomy_item_id,relation_type,weight,rationale,active)
  VALUES (t_sinal, t_gráfica, 'complements', 30, 'Sinal fraco: gráfica rápida às vezes atende sinalização.', true)
  RETURNING id INTO r_fraco;

  INSERT INTO public.taxonomy_relations (from_taxonomy_item_id,to_taxonomy_item_id,relation_type,weight,rationale,active)
  VALUES (t_solar, t_esg, 'complements', 90, 'Direção inversa proposital para a prova.', true)
  RETURNING id INTO r_dir_errada;

  INSERT INTO public.taxonomy_relations (from_taxonomy_item_id,to_taxonomy_item_id,relation_type,weight,rationale,active)
  VALUES (t_segtrab, t_unif, 'complements', 100, 'Relação desativada para a prova.', false)
  RETURNING id INTO r_inativa;

  ---------------------------------------------------------------- perfis
  CREATE TEMP TABLE p4_ids(k text primary key, id uuid) ON COMMIT DROP;

  PERFORM 1;
  FOR rec IN
    SELECT * FROM (VALUES
      ('rest','Restaurante Sabor','alimentacao'),
      ('mkt','Agência Pulse','marketing'),
      ('ti','TechFlow Sistemas','tecnologia'),
      ('ct','Contábil Prisma','financas'),
      ('ev','Eventos Vértice','servicos'),
      ('w','Cerimonial Aurora','servicos'),
      ('z','Buffet Gourmet Lume','alimentacao'),
      ('w2','Loja Norte','comercio'),
      ('z2','Gráfica Veloz','servicos'),
      ('w3','Indústria Verde','industria'),
      ('z3','Solar Sul','servicos'),
      ('w4','Metalúrgica Forte','industria'),
      ('z4','Uniformes Alfa','comercio'),
      ('w5','Clínica Bem','saude'),
      ('z5','Traduções Global','servicos'),
      ('fp1a','Doceria Melzinho','alimentacao'),
      ('fp1b','Embalar Embalagens','industria'),
      ('fp2a','Marcenaria Cedro','construcao'),
      ('fp2b','Transportes Rota','logistica'),
      ('rg1','Loja Central','comercio'),
      ('rg2','Studio Ads','marketing'),
      ('d1','Eventos Duo','servicos'),
      ('d2','Foto Duo','servicos'),
      ('i1','Consultoria Um','consultoria'),
      ('i2','Consultoria Dois','consultoria')
    ) AS v(k,nome,seg)
  LOOP
    INSERT INTO public.profiles (event_id,name,company,city,whatsapp,segment_id,summary,consent,is_demo,recovery_code)
    VALUES (ev, rec.nome, rec.nome, 'Rio do Sul', '+5547999990000', rec.seg, 'Perfil de prova IMPL4', true, true, 'proof')
    RETURNING id INTO v_pid;
    INSERT INTO p4_ids(k,id) VALUES (rec.k, v_pid);
  END LOOP;

  SELECT id INTO p_rest FROM p4_ids WHERE k='rest';
  SELECT id INTO p_mkt FROM p4_ids WHERE k='mkt';
  SELECT id INTO p_ti FROM p4_ids WHERE k='ti';
  SELECT id INTO p_ct FROM p4_ids WHERE k='ct';
  SELECT id INTO p_ev FROM p4_ids WHERE k='ev';
  SELECT id INTO p_w FROM p4_ids WHERE k='w';
  SELECT id INTO p_z FROM p4_ids WHERE k='z';
  SELECT id INTO p_w2 FROM p4_ids WHERE k='w2';
  SELECT id INTO p_z2 FROM p4_ids WHERE k='z2';
  SELECT id INTO p_w3 FROM p4_ids WHERE k='w3';
  SELECT id INTO p_z3 FROM p4_ids WHERE k='z3';
  SELECT id INTO p_w4 FROM p4_ids WHERE k='w4';
  SELECT id INTO p_z4 FROM p4_ids WHERE k='z4';
  SELECT id INTO p_w5 FROM p4_ids WHERE k='w5';
  SELECT id INTO p_z5 FROM p4_ids WHERE k='z5';
  SELECT id INTO p_fp1a FROM p4_ids WHERE k='fp1a';
  SELECT id INTO p_fp1b FROM p4_ids WHERE k='fp1b';
  SELECT id INTO p_fp2a FROM p4_ids WHERE k='fp2a';
  SELECT id INTO p_fp2b FROM p4_ids WHERE k='fp2b';
  SELECT id INTO p_rg1 FROM p4_ids WHERE k='rg1';
  SELECT id INTO p_rg2 FROM p4_ids WHERE k='rg2';
  SELECT id INTO p_d1 FROM p4_ids WHERE k='d1';
  SELECT id INTO p_d2 FROM p4_ids WHERE k='d2';
  SELECT id INTO p_i1 FROM p4_ids WHERE k='i1';
  SELECT id INTO p_i2 FROM p4_ids WHERE k='i2';

  -- ofertas
  INSERT INTO public.profile_offers (profile_id,event_id,text,label,taxonomy_item_id) VALUES
    (p_rest, ev,'Buffet','Buffet',t_buffet),
    (p_mkt,  ev,'Marketing digital','Marketing digital',t_mkt),
    (p_mkt,  ev,'Tráfego pago','Tráfego pago',t_trafego),
    (p_ti,   ev,'Sistema de gestão','Sistema de gestão',t_sis),
    (p_ct,   ev,'Contabilidade empresarial','Contabilidade empresarial',t_conta),
    (p_ev,   ev,'Organização de eventos','Organização de eventos',t_orgev),
    (p_w,    ev,'Cerimonial social','Cerimonial social',t_cerimonial),
    (p_z,    ev,'Buffet gourmet','Buffet gourmet',t_bgourmet),
    (p_z2,   ev,'Gráfica rápida','Gráfica rápida',t_gráfica),
    (p_z3,   ev,'Energia solar','Energia solar',t_solar),
    (p_z4,   ev,'Uniformes profissionais','Uniformes profissionais',t_unif),
    (p_z5,   ev,'Tradução juramentada','Tradução juramentada',t_trad),
    (p_fp1b, ev,'Embalagens','Embalagens',t_emb),
    (p_fp2b, ev,'Transportadora','Transportadora',t_transp),
    (p_rg2,  ev,'Marketing digital','Marketing digital',t_mkt),
    (p_d2,   ev,'Fotografia','Fotografia',t_foto),
    (p_i1,   ev,'Logística','Logística',t_log);

  -- necessidades
  INSERT INTO public.profile_needs (profile_id,event_id,text,label,taxonomy_item_id,is_priority) VALUES
    (p_rest, ev,'Sistema de gestão','Sistema de gestão',t_sis,true),
    (p_rest, ev,'Marketing digital','Marketing digital',t_mkt,false),
    (p_mkt,  ev,'Buffet','Buffet',t_buffet,false),
    (p_ct,   ev,'Sistema de gestão','Sistema de gestão',t_sis,false),
    (p_ev,   ev,'Estrutura para eventos','Estrutura para eventos',t_estrut,false),
    (p_w2,   ev,'Sinalização visual','Sinalização visual',t_sinal,false),
    (p_w3,   ev,'Consultoria ESG','Consultoria ESG',t_esg,false),
    (p_w4,   ev,'Segurança do trabalho','Segurança do trabalho',t_segtrab,false),
    (p_w5,   ev,'Jardinagem','Jardinagem',t_jard,false),
    (p_fp1a, ev,'Bala','Bala',t_bala,false),
    (p_fp2a, ev,'Porta','Porta',t_porta,false),
    (p_rg1,  ev,'Marketing','Marketing',t_marketing,false),
    (p_d1,   ev,'Fotografia','Fotografia',t_foto,false),
    (p_i2,   ev,'Logística','Logística',t_log,false);

  INSERT INTO public.profile_needs (profile_id,event_id,text,label,taxonomy_item_id,is_priority)
  VALUES (p_w, ev,'Catering corporativo','Catering corporativo',t_catering,false)
  RETURNING id INTO n_catering;
  SELECT id INTO o_bgourmet FROM public.profile_offers WHERE profile_id=p_z AND taxonomy_item_id=t_bgourmet;

  ---------------------------------------------------------------- recompute
  FOR rec IN SELECT id FROM public.profiles WHERE event_id = ev ORDER BY created_at, id LOOP
    PERFORM public._recompute_matches_for_profile(rec.id, ev);
  END LOOP;
  -- ordem final controlada para provar kind por perspectiva do solicitante
  PERFORM public._recompute_matches_for_profile(p_i1, ev); -- i1 OFERECE o que i2 procura -> inverso
  PERFORM public._recompute_matches_for_profile(p_d1, ev); -- d1 PROCURA o que d2 oferece -> direto

  ---------------------------------------------------------------- asserts
  -- 1) match direto real (mesmo segmento, literal a favor de quem recalculou)
  SELECT * INTO m FROM public.matches
   WHERE event_id=ev AND is_active
     AND ((a_profile_id=p_d1 AND b_profile_id=p_d2) OR (a_profile_id=p_d2 AND b_profile_id=p_d1));
  IF m IS NULL OR m.kind <> 'direto' THEN
    RAISE EXCEPTION 'IMPL4 FAIL 1: match direto esperado, obtido %', COALESCE(m.kind::text,'nenhum');
  END IF;

  -- 2) match inverso real
  SELECT * INTO m FROM public.matches
   WHERE event_id=ev AND is_active
     AND ((a_profile_id=p_i1 AND b_profile_id=p_i2) OR (a_profile_id=p_i2 AND b_profile_id=p_i1));
  IF m IS NULL OR m.kind <> 'inverso' THEN
    RAISE EXCEPTION 'IMPL4 FAIL 2: match inverso esperado, obtido %', COALESCE(m.kind::text,'nenhum');
  END IF;

  -- 3) bidirecional real (restaurante x agencia de marketing)
  SELECT * INTO m FROM public.matches
   WHERE event_id=ev AND is_active
     AND ((a_profile_id=p_rest AND b_profile_id=p_mkt) OR (a_profile_id=p_mkt AND b_profile_id=p_rest));
  IF m IS NULL OR m.kind <> 'bidirecional' THEN
    RAISE EXCEPTION 'IMPL4 FAIL 3: bidirecional esperado, obtido %', COALESCE(m.kind::text,'nenhum');
  END IF;

  -- 7) multiplos reasons coexistem sem double count (soma dos reasons = score)
  SELECT COALESCE(sum(weight),0)::int INTO v_int FROM public.match_reasons
   WHERE match_id=m.id AND perspective_profile_id=p_rest;
  IF v_int <> (CASE WHEN m.a_profile_id=p_rest THEN m.score_for_a ELSE m.score_for_b END) THEN
    RAISE EXCEPTION 'IMPL4 FAIL 7: soma de reasons % difere do score', v_int;
  END IF;
  SELECT count(*) INTO v_int FROM (
    SELECT code FROM public.match_reasons WHERE match_id=m.id AND perspective_profile_id=p_rest
     GROUP BY code HAVING count(*)>1) x;
  IF v_int > 0 THEN RAISE EXCEPTION 'IMPL4 FAIL 7: reason duplicado (double count)'; END IF;

  -- 4) complementar puro forte (sem literal nenhum)
  SELECT * INTO m FROM public.matches
   WHERE event_id=ev AND is_active
     AND ((a_profile_id=p_w AND b_profile_id=p_z) OR (a_profile_id=p_z AND b_profile_id=p_w));
  IF m IS NULL OR m.kind <> 'complementar' THEN
    RAISE EXCEPTION 'IMPL4 FAIL 4: complementar puro esperado, obtido %', COALESCE(m.kind::text,'nenhum');
  END IF;

  -- 13) reason complementar aponta need/offer/relation/rationale corretos
  SELECT * INTO rec FROM public.match_reasons
   WHERE match_id=m.id AND perspective_profile_id=p_w AND code='relacao_complementar';
  IF rec IS NULL THEN RAISE EXCEPTION 'IMPL4 FAIL 13: reason complementar ausente'; END IF;
  IF rec.profile_need_id <> n_catering OR rec.profile_offer_id <> o_bgourmet
     OR rec.taxonomy_relation_id <> r_forte OR rec.relation_weight <> 90 OR rec.weight <> 27
     OR rec.rationale <> 'Quem contrata catering corporativo costuma fechar buffet gourmet completo no mesmo evento.' THEN
    RAISE EXCEPTION 'IMPL4 FAIL 13: rastreio incorreto (need=%, offer=%, rel=%, w=%, pts=%)',
      rec.profile_need_id, rec.profile_offer_id, rec.taxonomy_relation_id, rec.relation_weight, rec.weight;
  END IF;
  -- perspectiva sem complemento nao carrega IDs
  IF EXISTS (SELECT 1 FROM public.match_reasons
              WHERE match_id=m.id AND perspective_profile_id=p_z AND code='relacao_complementar') THEN
    RAISE EXCEPTION 'IMPL4 FAIL 13: complemento indevido na perspectiva inversa';
  END IF;

  -- 14) algorithm_version
  IF EXISTS (SELECT 1 FROM public.matches WHERE event_id=ev AND algorithm_version <> 'v2.3') THEN
    RAISE EXCEPTION 'IMPL4 FAIL 14: algorithm_version diferente de v2.3';
  END IF;

  -- 5) complementar fraco (weight 30) nao cria match
  IF EXISTS (SELECT 1 FROM public.matches WHERE event_id=ev AND is_active
      AND ((a_profile_id=p_w2 AND b_profile_id=p_z2) OR (a_profile_id=p_z2 AND b_profile_id=p_w2))) THEN
    RAISE EXCEPTION 'IMPL4 FAIL 5: complementar fraco criou match';
  END IF;

  -- 9) relacao na direcao errada nao cria match
  IF EXISTS (SELECT 1 FROM public.matches WHERE event_id=ev AND is_active
      AND ((a_profile_id=p_w3 AND b_profile_id=p_z3) OR (a_profile_id=p_z3 AND b_profile_id=p_w3))) THEN
    RAISE EXCEPTION 'IMPL4 FAIL 9: relacao invertida criou match';
  END IF;

  -- 10) relacao inativa nao cria match
  IF EXISTS (SELECT 1 FROM public.matches WHERE event_id=ev AND is_active
      AND ((a_profile_id=p_w4 AND b_profile_id=p_z4) OR (a_profile_id=p_z4 AND b_profile_id=p_w4))) THEN
    RAISE EXCEPTION 'IMPL4 FAIL 10: relacao inativa criou match';
  END IF;

  -- 6) e 12) sem relacao/sem literal: segmento diferente sozinho nao cria match
  IF EXISTS (SELECT 1 FROM public.matches WHERE event_id=ev AND is_active
      AND ((a_profile_id=p_w5 AND b_profile_id=p_z5) OR (a_profile_id=p_z5 AND b_profile_id=p_w5))) THEN
    RAISE EXCEPTION 'IMPL4 FAIL 6/12: cross-segment sem sinal criou match';
  END IF;
  SELECT count(*)::int INTO v_int FROM public.matches m2
   WHERE m2.event_id=ev AND m2.is_active
     AND (m2.a_profile_id=p_w5 OR m2.b_profile_id=p_w5 OR m2.a_profile_id=p_z5 OR m2.b_profile_id=p_z5);
  IF v_int <> 0 THEN RAISE EXCEPTION 'IMPL4 FAIL 12: perfis sem sinal geraram % matches', v_int; END IF;

  -- 11) falsos positivos por substring acidental
  IF public.taxonomy_match(t_bala,'Bala',t_emb,'Embalagens') THEN
    RAISE EXCEPTION 'IMPL4 FAIL 11: "Bala" casou com "Embalagens"';
  END IF;
  IF public.taxonomy_match(t_porta,'Porta',t_transp,'Transportadora') THEN
    RAISE EXCEPTION 'IMPL4 FAIL 11: "Porta" casou com "Transportadora"';
  END IF;
  IF EXISTS (SELECT 1 FROM public.matches WHERE event_id=ev AND is_active
      AND ((a_profile_id=p_fp1a AND b_profile_id=p_fp1b) OR (a_profile_id=p_fp1b AND b_profile_id=p_fp1a)
        OR (a_profile_id=p_fp2a AND b_profile_id=p_fp2b) OR (a_profile_id=p_fp2b AND b_profile_id=p_fp2a))) THEN
    RAISE EXCEPTION 'IMPL4 FAIL 11: falso positivo por substring criou match';
  END IF;
  -- regressao: contencao legitima por palavra inteira continua valendo
  IF NOT public.taxonomy_match(t_marketing,'Marketing',t_mkt,'Marketing digital') THEN
    RAISE EXCEPTION 'IMPL4 FAIL 11-regressao: "Marketing" deixou de casar com "Marketing digital"';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.matches WHERE event_id=ev AND is_active
      AND ((a_profile_id=p_rg1 AND b_profile_id=p_rg2) OR (a_profile_id=p_rg2 AND b_profile_id=p_rg1))) THEN
    RAISE EXCEPTION 'IMPL4 FAIL 11-regressao: match legitimo por palavra inteira sumiu';
  END IF;

  -- 8) assimetria real: restaurante (55+10+5+3+2=75, alta) x tecnologia (25+5+3+2=35, possivel)
  SELECT * INTO m FROM public.matches
   WHERE event_id=ev AND is_active
     AND ((a_profile_id=p_rest AND b_profile_id=p_ti) OR (a_profile_id=p_ti AND b_profile_id=p_rest));
  IF m IS NULL THEN RAISE EXCEPTION 'IMPL4 FAIL 8: match restaurante x tecnologia ausente'; END IF;
  v_score_rest := CASE WHEN m.a_profile_id=p_rest THEN m.score_for_a ELSE m.score_for_b END;
  v_score_ti   := CASE WHEN m.a_profile_id=p_ti   THEN m.score_for_a ELSE m.score_for_b END;
  IF v_score_rest <> 75 OR v_score_ti <> 35 THEN
    RAISE EXCEPTION 'IMPL4 FAIL 8: scores esperados 75/35, obtidos %/%', v_score_rest, v_score_ti;
  END IF;
  IF public.match_label_for_score(v_score_rest) <> 'alta_compatibilidade'
     OR public.match_label_for_score(v_score_ti) <> 'conexao_possivel' THEN
    RAISE EXCEPTION 'IMPL4 FAIL 8: label_me por perspectiva incorreta';
  END IF;

  -- 15) recompute automatico e manual usam a mesma logica central
  SELECT pg_get_functiondef(p.oid) INTO v_txt FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='save_own_profile_v2';
  IF position('_recompute_matches_for_profile' in v_txt) = 0 THEN
    RAISE EXCEPTION 'IMPL4 FAIL 15: save_own_profile_v2 nao chama a logica central';
  END IF;
  SELECT pg_get_functiondef(p.oid) INTO v_txt FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='recompute_own_matches';
  IF position('_recompute_matches_for_profile' in v_txt) = 0 THEN
    RAISE EXCEPTION 'IMPL4 FAIL 15: recompute_own_matches nao chama a logica central';
  END IF;
  SELECT pg_get_functiondef(p.oid) INTO v_txt FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='list_own_matches_v2';
  IF position('match_label_for_score' in v_txt) = 0 THEN
    RAISE EXCEPTION 'IMPL4 FAIL 15: list_own_matches_v2 nao usa match_label_for_score';
  END IF;
  -- idempotencia: recomputar de novo nao muda score
  PERFORM public._recompute_matches_for_profile(p_rest, ev);
  SELECT CASE WHEN m2.a_profile_id=p_rest THEN m2.score_for_a ELSE m2.score_for_b END INTO v_int
    FROM public.matches m2
   WHERE m2.event_id=ev AND m2.is_active
     AND ((m2.a_profile_id=p_rest AND m2.b_profile_id=p_ti) OR (m2.a_profile_id=p_ti AND m2.b_profile_id=p_rest));
  IF v_int <> 75 THEN RAISE EXCEPTION 'IMPL4 FAIL 15: recompute nao idempotente (%)', v_int; END IF;

  RAISE NOTICE 'IMPL4: 15 cenarios comerciais validados com sucesso.';

  ---------------------------------------------------------------- cleanup
  DELETE FROM public.match_reasons WHERE match_id IN (SELECT id FROM public.matches WHERE event_id=ev);
  DELETE FROM public.match_status_history WHERE match_id IN (SELECT id FROM public.matches WHERE event_id=ev);
  DELETE FROM public.match_decisions WHERE match_id IN (SELECT id FROM public.matches WHERE event_id=ev);
  DELETE FROM public.connection_events WHERE event_id=ev;
  DELETE FROM public.connection_notes WHERE event_id=ev;
  DELETE FROM public.connection_status_history WHERE connection_id IN (SELECT id FROM public.connections WHERE event_id=ev);
  DELETE FROM public.connections WHERE event_id=ev;
  DELETE FROM public.matches WHERE event_id=ev;
  DELETE FROM public.profile_needs WHERE event_id=ev;
  DELETE FROM public.profile_offers WHERE event_id=ev;
  DELETE FROM public.profile_segments WHERE profile_id IN (SELECT id FROM public.profiles WHERE event_id=ev);
  DELETE FROM public.consents WHERE event_id=ev;
  DELETE FROM public.analytics_events WHERE event_id=ev;
  DELETE FROM public.ai_runs WHERE event_id=ev;
  DELETE FROM public.audit_logs WHERE event_id=ev;
  DELETE FROM public.profiles WHERE event_id=ev;
  DELETE FROM public.taxonomy_relations WHERE id IN (r_forte, r_fraco, r_dir_errada, r_inativa);
  DELETE FROM public.taxonomy_items WHERE slug LIKE 'p4-%';
  DELETE FROM public.events WHERE id=ev;
END $proof$;