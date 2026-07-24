
-- =========================================================
-- FASE 3A — Backend normalizado e matching server-side
-- Aditivo: não remove colunas legadas.
-- =========================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------- 1) TAXONOMY ---------------------------------------------------

ALTER TABLE public.taxonomy_items
  ADD COLUMN IF NOT EXISTS segment_id text REFERENCES public.segments(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS synonyms text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='taxonomy_items_kind_check') THEN
    ALTER TABLE public.taxonomy_items
      ADD CONSTRAINT taxonomy_items_kind_check CHECK (kind IN ('offer','need','both'));
  END IF;
END $$;

ALTER TABLE public.taxonomy_items DROP CONSTRAINT IF EXISTS taxonomy_items_slug_key;

CREATE UNIQUE INDEX IF NOT EXISTS taxonomy_items_segment_slug_kind_uidx
  ON public.taxonomy_items(segment_id, slug, kind);

CREATE INDEX IF NOT EXISTS taxonomy_items_seg_kind_active_idx
  ON public.taxonomy_items(segment_id, kind, active);

CREATE INDEX IF NOT EXISTS taxonomy_items_label_trgm_idx
  ON public.taxonomy_items USING gin (label gin_trgm_ops);

CREATE INDEX IF NOT EXISTS taxonomy_items_synonyms_gin_idx
  ON public.taxonomy_items USING gin (synonyms);

DROP TRIGGER IF EXISTS trg_taxonomy_items_updated ON public.taxonomy_items;
CREATE TRIGGER trg_taxonomy_items_updated
  BEFORE UPDATE ON public.taxonomy_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Helper: slug determinístico
CREATE OR REPLACE FUNCTION public.slugify(_txt text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(
    regexp_replace(
      lower(translate(coalesce(_txt,''),
        'áàâãäåÁÀÂÃÄÅéèêëÉÈÊËíìîïÍÌÎÏóòôõöÓÒÔÕÖúùûüÚÙÛÜçÇñÑ',
        'aaaaaaAAAAAAeeeeEEEEiiiiIIIIoooooOOOOOuuuuUUUUcCnN')),
      '[^a-z0-9]+', '-', 'g'),
    '(^-+)|(-+$)', '', 'g');
$$;

-- Seed idempotente (upsert) da taxonomia oficial
WITH raw(segment_id, label) AS (VALUES
  ('comercio','Revenda de produtos'), ('comercio','Loja física'),
  ('comercio','E-commerce'), ('comercio','Atacado'),
  ('industria','Fabricação sob demanda'), ('industria','Produção em escala'),
  ('industria','Embalagens'), ('industria','Metalurgia'),
  ('servicos','Manutenção'), ('servicos','Instalação'),
  ('servicos','Terceirização'), ('servicos','Limpeza'),
  ('tecnologia','Desenvolvimento de software'), ('tecnologia','Suporte técnico'),
  ('tecnologia','Automação'), ('tecnologia','Infraestrutura de TI'),
  ('marketing','Gestão de redes sociais'), ('marketing','Design gráfico'),
  ('marketing','Tráfego pago'), ('marketing','Produção audiovisual'),
  ('saude','Consultório'), ('saude','Equipamentos médicos'),
  ('saude','Bem-estar corporativo'),
  ('educacao','Cursos livres'), ('educacao','Treinamento corporativo'),
  ('educacao','Educação técnica'),
  ('alimentacao','Restaurante'), ('alimentacao','Fornecimento de refeições'),
  ('alimentacao','Insumos alimentícios'),
  ('agro','Insumos agrícolas'), ('agro','Máquinas agrícolas'),
  ('agro','Consultoria rural'),
  ('construcao','Materiais de construção'), ('construcao','Projetos e obras'),
  ('construcao','Instalações elétricas'),
  ('financas','Contabilidade'), ('financas','Crédito empresarial'),
  ('financas','Meios de pagamento'),
  ('logistica','Transporte de cargas'), ('logistica','Armazenagem'),
  ('logistica','Última milha'),
  ('consultoria','Gestão empresarial'), ('consultoria','Jurídica'),
  ('consultoria','RH e pessoas')
)
INSERT INTO public.taxonomy_items (segment_id, slug, label, kind, active, synonyms)
SELECT r.segment_id, public.slugify(r.label), r.label, 'both', true, ARRAY[]::text[]
FROM raw r
ON CONFLICT (segment_id, slug, kind) DO UPDATE
  SET label = EXCLUDED.label, active = true, updated_at = now();

-- ---------- 2) PROFILE_OFFERS / PROFILE_NEEDS ----------------------------

ALTER TABLE public.profile_offers
  ADD COLUMN IF NOT EXISTS taxonomy_item_id uuid REFERENCES public.taxonomy_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS label text,
  ADD COLUMN IF NOT EXISTS detail text,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS user_confirmed boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

ALTER TABLE public.profile_needs
  ADD COLUMN IF NOT EXISTS taxonomy_item_id uuid REFERENCES public.taxonomy_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS label text,
  ADD COLUMN IF NOT EXISTS detail text,
  ADD COLUMN IF NOT EXISTS need_kind text NOT NULL DEFAULT 'outro',
  ADD COLUMN IF NOT EXISTS is_priority boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS user_confirmed boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='profile_needs_kind_check') THEN
    ALTER TABLE public.profile_needs
      ADD CONSTRAINT profile_needs_kind_check
      CHECK (need_kind IN ('servico','fornecedor','parceiro','compradores','distribuidores','profissionais','produtos','outro'));
  END IF;
END $$;

-- Backfill offers.label a partir de text (que pode ser JSON `{"label":"..."}`)
UPDATE public.profile_offers
   SET label = COALESCE(
     NULLIF(trim(BOTH FROM (
       CASE WHEN left(trim(text),1)='{' THEN
         (text::jsonb)->>'label'
       ELSE text END
     )), ''),
     text)
 WHERE label IS NULL OR label = '';

UPDATE public.profile_needs pn
   SET label = COALESCE(
         NULLIF(trim(BOTH FROM (
           CASE WHEN left(trim(pn.text),1)='{' THEN (pn.text::jsonb)->>'label' ELSE pn.text END
         )), ''), pn.text),
       need_kind = COALESCE(
         NULLIF(CASE WHEN left(trim(pn.text),1)='{' THEN (pn.text::jsonb)->>'kind' ELSE NULL END, ''),
         pn.need_kind),
       is_priority = COALESCE(
         CASE WHEN left(trim(pn.text),1)='{' THEN ((pn.text::jsonb)->>'isPriority')::boolean ELSE NULL END,
         pn.is_priority)
 WHERE pn.label IS NULL OR pn.label = '';

-- Backfill taxonomy_item_id por match de label normalizado dentro do segmento
UPDATE public.profile_offers po
   SET taxonomy_item_id = ti.id
  FROM public.taxonomy_items ti
 WHERE po.taxonomy_item_id IS NULL
   AND ti.segment_id = po.segment_id
   AND public.slugify(ti.label) = public.slugify(po.label);

UPDATE public.profile_needs pn
   SET taxonomy_item_id = ti.id
  FROM public.taxonomy_items ti
 WHERE pn.taxonomy_item_id IS NULL
   AND ti.segment_id = pn.segment_id
   AND public.slugify(ti.label) = public.slugify(pn.label);

-- Enforce not-null label depois do backfill
ALTER TABLE public.profile_offers ALTER COLUMN label SET NOT NULL;
ALTER TABLE public.profile_needs  ALTER COLUMN label SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS profile_offers_profile_taxonomy_uidx
  ON public.profile_offers(profile_id, taxonomy_item_id)
  WHERE taxonomy_item_id IS NOT NULL AND active = true;

CREATE UNIQUE INDEX IF NOT EXISTS profile_needs_profile_taxonomy_uidx
  ON public.profile_needs(profile_id, taxonomy_item_id)
  WHERE taxonomy_item_id IS NOT NULL AND active = true;

-- Backfill a partir do JSON legado `profiles.offers` / `profiles.needs`
-- caso normalização esteja mais pobre que a origem.
INSERT INTO public.profile_offers (profile_id, event_id, segment_id, text, label, sort_order, source, user_confirmed, active)
SELECT p.id, p.event_id, p.segment_id, elem->>'label',
       elem->>'label',
       (ord - 1),
       'legacy_backfill', true, true
  FROM public.profiles p
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p.offers,'[]'::jsonb)) WITH ORDINALITY AS t(elem, ord)
 WHERE elem ? 'label'
   AND NOT EXISTS (
     SELECT 1 FROM public.profile_offers po
      WHERE po.profile_id = p.id
        AND public.slugify(po.label) = public.slugify(elem->>'label')
   );

INSERT INTO public.profile_needs (profile_id, event_id, segment_id, text, label, need_kind, is_priority, sort_order, source, user_confirmed, active)
SELECT p.id, p.event_id, p.segment_id, elem->>'label',
       elem->>'label',
       COALESCE(NULLIF(elem->>'kind',''),'outro'),
       COALESCE((elem->>'isPriority')::boolean, false),
       (ord - 1),
       'legacy_backfill', true, true
  FROM public.profiles p
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p.needs,'[]'::jsonb)) WITH ORDINALITY AS t(elem, ord)
 WHERE elem ? 'label'
   AND NOT EXISTS (
     SELECT 1 FROM public.profile_needs pn
      WHERE pn.profile_id = p.id
        AND public.slugify(pn.label) = public.slugify(elem->>'label')
   );

-- Re-link taxonomy após backfill do legado
UPDATE public.profile_offers po
   SET taxonomy_item_id = ti.id
  FROM public.taxonomy_items ti
 WHERE po.taxonomy_item_id IS NULL
   AND ti.segment_id = po.segment_id
   AND public.slugify(ti.label) = public.slugify(po.label);

UPDATE public.profile_needs pn
   SET taxonomy_item_id = ti.id
  FROM public.taxonomy_items ti
 WHERE pn.taxonomy_item_id IS NULL
   AND ti.segment_id = pn.segment_id
   AND public.slugify(ti.label) = public.slugify(pn.label);

-- ---------- 3) MATCHES: colunas de gerenciamento -------------------------

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS algorithm_version text NOT NULL DEFAULT 'v2.0',
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS generated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

CREATE INDEX IF NOT EXISTS matches_active_event_idx
  ON public.matches(event_id, is_active);

-- Backfill match_decisions/match_reasons a partir das colunas legadas quando existirem
INSERT INTO public.match_decisions (match_id, profile_id, decision)
SELECT m.id, m.a_profile_id, m.decision_a
  FROM public.matches m
 WHERE m.decision_a <> 'sem_decisao'
ON CONFLICT (match_id, profile_id) DO NOTHING;

INSERT INTO public.match_decisions (match_id, profile_id, decision)
SELECT m.id, m.b_profile_id, m.decision_b
  FROM public.matches m
 WHERE m.decision_b <> 'sem_decisao'
ON CONFLICT (match_id, profile_id) DO NOTHING;

INSERT INTO public.match_reasons (match_id, perspective_profile_id, code, label, weight)
SELECT m.id, m.a_profile_id,
       COALESCE(r->>'code','n/a'), COALESCE(r->>'detail', r->>'label',''),
       COALESCE((r->>'weight')::int, 0)
  FROM public.matches m
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(m.reasons_for_a,'[]'::jsonb)) r
 WHERE NOT EXISTS (
   SELECT 1 FROM public.match_reasons mr
    WHERE mr.match_id = m.id AND mr.perspective_profile_id = m.a_profile_id
 );

INSERT INTO public.match_reasons (match_id, perspective_profile_id, code, label, weight)
SELECT m.id, m.b_profile_id,
       COALESCE(r->>'code','n/a'), COALESCE(r->>'detail', r->>'label',''),
       COALESCE((r->>'weight')::int, 0)
  FROM public.matches m
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(m.reasons_for_b,'[]'::jsonb)) r
 WHERE NOT EXISTS (
   SELECT 1 FROM public.match_reasons mr
    WHERE mr.match_id = m.id AND mr.perspective_profile_id = m.b_profile_id
 );

-- ---------- 4) HELPERS DE MATCHING SERVER-SIDE ---------------------------

CREATE OR REPLACE FUNCTION public.norm_label(_s text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(regexp_replace(translate(coalesce(_s,''),
    'áàâãäåÁÀÂÃÄÅéèêëÉÈÊËíìîïÍÌÎÏóòôõöÓÒÔÕÖúùûüÚÙÛÜçÇñÑ',
    'aaaaaaAAAAAAeeeeEEEEiiiiIIIIoooooOOOOOuuuuUUUUcCnN'
  ), '\s+', ' ', 'g'));
$$;

-- ---------- 5) RPC v2: PERFIL --------------------------------------------

CREATE OR REPLACE FUNCTION public.list_event_segments_and_taxonomy(_event_id text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.events WHERE id=_event_id AND is_active) THEN
    RAISE EXCEPTION 'event_not_active' USING ERRCODE='P0001';
  END IF;

  RETURN jsonb_build_object(
    'segments', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', s.id, 'label', s.label, 'emoji', s.emoji) ORDER BY s.sort_order), '[]'::jsonb)
      FROM public.segments s),
    'taxonomy', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', ti.id, 'segment_id', ti.segment_id, 'label', ti.label,
        'kind', ti.kind, 'synonyms', ti.synonyms) ORDER BY ti.segment_id, ti.label), '[]'::jsonb)
      FROM public.taxonomy_items ti WHERE ti.active = true)
  );
END $$;

CREATE OR REPLACE FUNCTION public.save_own_profile_v2(_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_event text := _payload->>'event_id';
  v_name text := trim(_payload->>'name');
  v_company text := trim(_payload->>'company');
  v_city text := trim(_payload->>'city');
  v_neighborhood text := _payload->>'neighborhood';
  v_segment text := _payload->>'segment_id';
  v_summary text := trim(_payload->>'summary');
  v_consent boolean := COALESCE((_payload->>'consent')::boolean, false);
  v_policy_version text := COALESCE(_payload->>'policy_version','1');
  v_offers jsonb := COALESCE(_payload->'offers','[]'::jsonb);
  v_needs  jsonb := COALESCE(_payload->'needs','[]'::jsonb);
  v_id uuid;
  v_item jsonb;
  v_idx int;
  v_off_count int;
  v_need_count int;
  v_priority_count int;
  v_forced_priority int := -1;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.events WHERE id=v_event AND is_active) THEN
    RAISE EXCEPTION 'event_not_active' USING ERRCODE='P0001';
  END IF;
  IF v_consent IS NOT TRUE THEN RAISE EXCEPTION 'consent_required' USING ERRCODE='P0001'; END IF;
  IF coalesce(v_name,'')='' OR coalesce(v_company,'')='' OR coalesce(v_city,'')=''
     OR coalesce(v_segment,'')='' OR coalesce(v_summary,'')='' THEN
    RAISE EXCEPTION 'missing_fields' USING ERRCODE='22023';
  END IF;
  IF length(v_name)>120 OR length(v_company)>160 OR length(v_summary)>800 THEN
    RAISE EXCEPTION 'field_too_long' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.segments WHERE id=v_segment) THEN
    RAISE EXCEPTION 'invalid_segment' USING ERRCODE='22023';
  END IF;

  v_off_count := jsonb_array_length(v_offers);
  v_need_count := jsonb_array_length(v_needs);
  IF v_off_count < 1 OR v_off_count > 5 THEN RAISE EXCEPTION 'invalid_offers_count' USING ERRCODE='22023'; END IF;
  IF v_need_count < 1 OR v_need_count > 5 THEN RAISE EXCEPTION 'invalid_needs_count' USING ERRCODE='22023'; END IF;

  v_priority_count := 0;
  FOR v_idx IN 0 .. v_need_count-1 LOOP
    v_item := v_needs->v_idx;
    IF COALESCE((v_item->>'is_priority')::boolean, false) THEN
      v_priority_count := v_priority_count + 1;
      IF v_forced_priority < 0 THEN v_forced_priority := v_idx; END IF;
    END IF;
  END LOOP;
  IF v_priority_count = 0 THEN v_forced_priority := 0;
  ELSIF v_priority_count > 1 THEN
    -- normaliza: só a primeira é prioritária
    NULL;
  END IF;

  -- localizar perfil próprio, bloqueando
  SELECT id INTO v_id FROM public.profiles
   WHERE event_id=v_event AND owner_id=v_uid AND is_demo=false
   FOR UPDATE;

  IF v_id IS NULL THEN
    INSERT INTO public.profiles(owner_id, event_id, name, company, city, neighborhood,
      whatsapp, segment_id, summary, offers, needs, consent, is_demo, recovery_code)
    VALUES (v_uid, v_event, v_name, v_company, v_city, v_neighborhood,
      '', v_segment, v_summary, '[]'::jsonb, '[]'::jsonb, true, false, '')
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.profiles
       SET name=v_name, company=v_company, city=v_city, neighborhood=v_neighborhood,
           segment_id=v_segment, summary=v_summary, consent=true, updated_at=now()
     WHERE id=v_id;
  END IF;

  -- segmento primário
  DELETE FROM public.profile_segments WHERE profile_id = v_id;
  INSERT INTO public.profile_segments(profile_id, segment_id, is_primary)
  VALUES (v_id, v_segment, true);

  -- ofertas
  DELETE FROM public.profile_offers WHERE profile_id = v_id;
  v_idx := 0;
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_offers) LOOP
    INSERT INTO public.profile_offers(profile_id, event_id, segment_id, taxonomy_item_id,
      text, label, detail, sort_order, source, user_confirmed, active)
    VALUES (v_id, v_event,
      COALESCE(NULLIF(v_item->>'segment_id',''), v_segment),
      NULLIF(v_item->>'taxonomy_item_id','')::uuid,
      COALESCE(v_item->>'label',''), COALESCE(v_item->>'label',''),
      NULLIF(v_item->>'detail',''), v_idx, 'user', true, true);
    v_idx := v_idx + 1;
  END LOOP;

  -- necessidades
  DELETE FROM public.profile_needs WHERE profile_id = v_id;
  v_idx := 0;
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_needs) LOOP
    INSERT INTO public.profile_needs(profile_id, event_id, segment_id, taxonomy_item_id,
      text, label, detail, need_kind, is_priority, sort_order, source, user_confirmed, active)
    VALUES (v_id, v_event,
      COALESCE(NULLIF(v_item->>'segment_id',''), v_segment),
      NULLIF(v_item->>'taxonomy_item_id','')::uuid,
      COALESCE(v_item->>'label',''), COALESCE(v_item->>'label',''),
      NULLIF(v_item->>'detail',''),
      COALESCE(NULLIF(v_item->>'need_kind',''),'outro'),
      CASE
        WHEN v_priority_count = 0 THEN (v_idx = 0)
        WHEN v_priority_count = 1 THEN COALESCE((v_item->>'is_priority')::boolean,false)
        ELSE (v_idx = v_forced_priority)
      END,
      v_idx, 'user', true, true);
    v_idx := v_idx + 1;
  END LOOP;

  -- consent
  INSERT INTO public.consents(profile_id, event_id, consent_type, version, granted)
  VALUES (v_id, v_event, 'matchmaking', v_policy_version, true);

  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.get_own_profile_v2(_event_id text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_row public.profiles; v_out jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_row FROM public.profiles
    WHERE event_id=_event_id AND owner_id=v_uid AND is_demo=false LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;

  v_out := jsonb_build_object(
    'id', v_row.id, 'event_id', v_row.event_id, 'name', v_row.name,
    'company', v_row.company, 'city', v_row.city, 'neighborhood', v_row.neighborhood,
    'segment_id', v_row.segment_id, 'summary', v_row.summary, 'consent', v_row.consent,
    'created_at', v_row.created_at, 'updated_at', v_row.updated_at,
    'offers', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', po.id, 'taxonomy_item_id', po.taxonomy_item_id,
        'segment_id', po.segment_id, 'label', po.label, 'detail', po.detail
      ) ORDER BY po.sort_order),'[]'::jsonb)
      FROM public.profile_offers po WHERE po.profile_id=v_row.id AND po.active),
    'needs', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', pn.id, 'taxonomy_item_id', pn.taxonomy_item_id,
        'segment_id', pn.segment_id, 'label', pn.label, 'detail', pn.detail,
        'need_kind', pn.need_kind, 'is_priority', pn.is_priority
      ) ORDER BY pn.sort_order),'[]'::jsonb)
      FROM public.profile_needs pn WHERE pn.profile_id=v_row.id AND pn.active)
  );
  RETURN v_out;
END $$;

-- ---------- 6) MATCHING SERVER-SIDE --------------------------------------

CREATE OR REPLACE FUNCTION public.recompute_own_matches(_event_id text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_me uuid;
  v_my_segment text;
  v_my_city text;
  v_other RECORD;
  v_pair_a uuid; v_pair_b uuid;
  v_score_me int; v_score_other int;
  v_reasons_me jsonb; v_reasons_other jsonb;
  v_kind public.match_kind;
  v_label public.match_label;
  v_signal boolean;
  v_match_id uuid;
  v_count int := 0;
  v_prio_covered boolean;
  v_overlap_offers_needs int; -- outro oferece o que eu preciso
  v_overlap_needs_offers int; -- outro precisa do que eu ofereço
  v_now timestamptz := now();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;
  SELECT id, segment_id, city INTO v_me, v_my_segment, v_my_city
    FROM public.profiles
   WHERE event_id=_event_id AND owner_id=v_uid AND is_demo=false
   FOR UPDATE;
  IF v_me IS NULL THEN RAISE EXCEPTION 'profile_not_found' USING ERRCODE='P0001'; END IF;

  -- Desativa matches existentes envolvendo v_me neste evento; serão reativados/upserted
  UPDATE public.matches
     SET is_active = false, updated_at = v_now
   WHERE event_id = _event_id
     AND (a_profile_id = v_me OR b_profile_id = v_me);

  FOR v_other IN
    SELECT p.id, p.segment_id, p.city, p.updated_at
      FROM public.profiles p
     WHERE p.event_id = _event_id
       AND p.id <> v_me
       AND p.consent = true
  LOOP
    -- overlap "outro oferece o que eu preciso"
    SELECT COUNT(*)::int INTO v_overlap_offers_needs
      FROM public.profile_needs mn
      JOIN public.profile_offers oo ON oo.profile_id = v_other.id AND oo.active
     WHERE mn.profile_id = v_me AND mn.active
       AND (
         (mn.taxonomy_item_id IS NOT NULL AND mn.taxonomy_item_id = oo.taxonomy_item_id)
         OR public.norm_label(mn.label) = public.norm_label(oo.label)
         OR position(public.norm_label(mn.label) in public.norm_label(oo.label)) > 0
         OR position(public.norm_label(oo.label) in public.norm_label(mn.label)) > 0
       );

    SELECT COUNT(*)::int INTO v_overlap_needs_offers
      FROM public.profile_offers mo
      JOIN public.profile_needs no_ ON no_.profile_id = v_other.id AND no_.active
     WHERE mo.profile_id = v_me AND mo.active
       AND (
         (mo.taxonomy_item_id IS NOT NULL AND mo.taxonomy_item_id = no_.taxonomy_item_id)
         OR public.norm_label(mo.label) = public.norm_label(no_.label)
         OR position(public.norm_label(mo.label) in public.norm_label(no_.label)) > 0
         OR position(public.norm_label(no_.label) in public.norm_label(mo.label)) > 0
       );

    -- Perspectiva de v_me
    v_score_me := 0; v_reasons_me := '[]'::jsonb; v_signal := false;
    IF v_overlap_offers_needs > 0 THEN
      v_score_me := v_score_me + 55; v_signal := true;
      v_reasons_me := v_reasons_me || jsonb_build_object('code','outro_oferece_o_que_procuro','weight',55,'label','O outro oferece o que você procura');
    END IF;
    IF v_overlap_needs_offers > 0 THEN
      v_score_me := v_score_me + 25; v_signal := true;
      v_reasons_me := v_reasons_me || jsonb_build_object('code','outro_procura_o_que_ofereco','weight',25,'label','O outro procura o que você oferece');
    END IF;
    SELECT EXISTS (
      SELECT 1 FROM public.profile_needs mn
        JOIN public.profile_offers oo ON oo.profile_id=v_other.id AND oo.active
       WHERE mn.profile_id=v_me AND mn.is_priority AND mn.active
         AND ((mn.taxonomy_item_id IS NOT NULL AND mn.taxonomy_item_id=oo.taxonomy_item_id)
              OR public.norm_label(mn.label)=public.norm_label(oo.label))
    ) INTO v_prio_covered;
    IF v_prio_covered THEN
      v_score_me := v_score_me + 10;
      v_reasons_me := v_reasons_me || jsonb_build_object('code','prioridade','weight',10,'label','Atende sua necessidade prioritária');
    END IF;
    IF v_other.segment_id <> v_my_segment AND (v_overlap_offers_needs>0 OR v_overlap_needs_offers>0) THEN
      v_score_me := v_score_me + 5;
      v_reasons_me := v_reasons_me || jsonb_build_object('code','complementaridade','weight',5,'label','Segmentos complementares');
    END IF;
    IF v_other.updated_at >= v_now - interval '7 days' THEN
      v_score_me := v_score_me + 3;
      v_reasons_me := v_reasons_me || jsonb_build_object('code','atualidade','weight',3,'label','Perfil recém-atualizado');
    END IF;
    IF v_my_city <> '' AND public.norm_label(v_my_city) = public.norm_label(v_other.city) THEN
      v_score_me := v_score_me + 2;
      v_reasons_me := v_reasons_me || jsonb_build_object('code','proximidade','weight',2,'label','Mesma cidade');
    END IF;

    -- Perspectiva do outro (espelhada, invertendo os overlaps)
    v_score_other := 0; v_reasons_other := '[]'::jsonb;
    IF v_overlap_needs_offers > 0 THEN
      v_score_other := v_score_other + 55;
      v_reasons_other := v_reasons_other || jsonb_build_object('code','outro_oferece_o_que_procuro','weight',55,'label','O outro oferece o que você procura');
    END IF;
    IF v_overlap_offers_needs > 0 THEN
      v_score_other := v_score_other + 25;
      v_reasons_other := v_reasons_other || jsonb_build_object('code','outro_procura_o_que_ofereco','weight',25,'label','O outro procura o que você oferece');
    END IF;
    SELECT EXISTS (
      SELECT 1 FROM public.profile_needs no_
        JOIN public.profile_offers mo ON mo.profile_id=v_me AND mo.active
       WHERE no_.profile_id=v_other.id AND no_.is_priority AND no_.active
         AND ((no_.taxonomy_item_id IS NOT NULL AND no_.taxonomy_item_id=mo.taxonomy_item_id)
              OR public.norm_label(no_.label)=public.norm_label(mo.label))
    ) INTO v_prio_covered;
    IF v_prio_covered THEN
      v_score_other := v_score_other + 10;
      v_reasons_other := v_reasons_other || jsonb_build_object('code','prioridade','weight',10,'label','Atende necessidade prioritária do outro');
    END IF;
    IF v_other.segment_id <> v_my_segment AND (v_overlap_offers_needs>0 OR v_overlap_needs_offers>0) THEN
      v_score_other := v_score_other + 5;
      v_reasons_other := v_reasons_other || jsonb_build_object('code','complementaridade','weight',5,'label','Segmentos complementares');
    END IF;
    IF v_other.updated_at >= v_now - interval '7 days' THEN
      v_score_other := v_score_other + 3;
      v_reasons_other := v_reasons_other || jsonb_build_object('code','atualidade','weight',3,'label','Perfil recém-atualizado');
    END IF;
    IF v_my_city <> '' AND public.norm_label(v_my_city) = public.norm_label(v_other.city) THEN
      v_score_other := v_score_other + 2;
      v_reasons_other := v_reasons_other || jsonb_build_object('code','proximidade','weight',2,'label','Mesma cidade');
    END IF;

    -- Sinal comercial mínimo para persistir
    IF NOT v_signal THEN CONTINUE; END IF;

    -- kind
    IF v_overlap_offers_needs>0 AND v_overlap_needs_offers>0 THEN v_kind := 'bidirecional';
    ELSIF v_overlap_offers_needs>0 AND v_other.segment_id <> v_my_segment THEN v_kind := 'hibrido';
    ELSIF v_overlap_offers_needs>0 THEN v_kind := 'direto';
    ELSIF v_overlap_needs_offers>0 THEN v_kind := 'inverso';
    ELSE v_kind := 'complementar';
    END IF;

    IF GREATEST(v_score_me, v_score_other) >= 75 THEN v_label := 'alta_compatibilidade';
    ELSIF GREATEST(v_score_me, v_score_other) >= 40 THEN v_label := 'boa_oportunidade';
    ELSE v_label := 'conexao_possivel';
    END IF;

    -- Ordena dupla (a < b) para respeitar constraint
    IF v_me < v_other.id THEN
      v_pair_a := v_me; v_pair_b := v_other.id;
    ELSE
      v_pair_a := v_other.id; v_pair_b := v_me;
    END IF;

    INSERT INTO public.matches (event_id, a_profile_id, b_profile_id, kind,
      score_for_a, score_for_b, label, reasons_for_a, reasons_for_b,
      algorithm_version, is_active, generated_at)
    VALUES (_event_id, v_pair_a, v_pair_b, v_kind,
      CASE WHEN v_pair_a = v_me THEN v_score_me ELSE v_score_other END,
      CASE WHEN v_pair_b = v_me THEN v_score_me ELSE v_score_other END,
      v_label,
      CASE WHEN v_pair_a = v_me THEN v_reasons_me ELSE v_reasons_other END,
      CASE WHEN v_pair_b = v_me THEN v_reasons_me ELSE v_reasons_other END,
      'v2.0', true, v_now)
    ON CONFLICT (a_profile_id, b_profile_id) DO UPDATE
      SET kind = EXCLUDED.kind,
          score_for_a = EXCLUDED.score_for_a,
          score_for_b = EXCLUDED.score_for_b,
          label = EXCLUDED.label,
          reasons_for_a = EXCLUDED.reasons_for_a,
          reasons_for_b = EXCLUDED.reasons_for_b,
          is_active = true,
          generated_at = v_now,
          algorithm_version = 'v2.0',
          updated_at = v_now
    RETURNING id INTO v_match_id;

    -- Rebuild reasons normalizadas
    DELETE FROM public.match_reasons WHERE match_id = v_match_id;
    INSERT INTO public.match_reasons (match_id, perspective_profile_id, code, label, weight)
    SELECT v_match_id, v_me, r->>'code', r->>'label', COALESCE((r->>'weight')::int,0)
      FROM jsonb_array_elements(v_reasons_me) r;
    INSERT INTO public.match_reasons (match_id, perspective_profile_id, code, label, weight)
    SELECT v_match_id, v_other.id, r->>'code', r->>'label', COALESCE((r->>'weight')::int,0)
      FROM jsonb_array_elements(v_reasons_other) r;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END $$;

-- Revoga a função legada de matching do cliente
REVOKE ALL ON FUNCTION public.store_computed_matches(jsonb) FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION public.store_computed_matches(jsonb) IS
  'DEPRECATED (Fase 3A): use recompute_own_matches. Somente service_role/postgres.';

-- ---------- 7) LISTAR MATCHES V2 -----------------------------------------

CREATE OR REPLACE FUNCTION public.list_own_matches_v2(_event_id text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_me uuid; v_out jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;
  SELECT id INTO v_me FROM public.profiles
    WHERE event_id=_event_id AND owner_id=v_uid AND is_demo=false LIMIT 1;
  IF v_me IS NULL THEN RETURN '[]'::jsonb; END IF;

  SELECT COALESCE(jsonb_agg(row_to_jsonb(r) ORDER BY (r->>'score_me')::int DESC), '[]'::jsonb) INTO v_out FROM (
    SELECT
      m.id AS match_id,
      v_me AS my_profile_id,
      (CASE WHEN m.a_profile_id = v_me THEN m.b_profile_id ELSE m.a_profile_id END) AS other_profile_id,
      m.kind, m.label,
      (CASE WHEN m.a_profile_id = v_me THEN m.score_for_a ELSE m.score_for_b END) AS score_me,
      (CASE WHEN m.a_profile_id = v_me THEN m.score_for_b ELSE m.score_for_a END) AS score_other,
      m.created_at, m.updated_at, m.generated_at,
      jsonb_build_object(
        'name', op.name, 'company', op.company, 'city', op.city,
        'neighborhood', op.neighborhood, 'segment_id', op.segment_id, 'summary', op.summary
      ) AS other,
      (SELECT COALESCE(jsonb_agg(jsonb_build_object('label', po.label, 'detail', po.detail) ORDER BY po.sort_order),'[]'::jsonb)
        FROM public.profile_offers po WHERE po.profile_id=op.id AND po.active) AS other_offers,
      (SELECT COALESCE(jsonb_agg(jsonb_build_object('label', pn.label, 'detail', pn.detail,
        'need_kind', pn.need_kind, 'is_priority', pn.is_priority) ORDER BY pn.sort_order),'[]'::jsonb)
        FROM public.profile_needs pn WHERE pn.profile_id=op.id AND pn.active) AS other_needs,
      (SELECT COALESCE(jsonb_agg(jsonb_build_object('code',mr.code,'label',mr.label,'weight',mr.weight) ORDER BY mr.weight DESC),'[]'::jsonb)
        FROM public.match_reasons mr WHERE mr.match_id=m.id AND mr.perspective_profile_id=v_me) AS reasons,
      (SELECT decision FROM public.match_decisions WHERE match_id=m.id AND profile_id=v_me) AS my_decision,
      (SELECT decision FROM public.match_decisions WHERE match_id=m.id AND profile_id=(CASE WHEN m.a_profile_id=v_me THEN m.b_profile_id ELSE m.a_profile_id END)) AS other_decision,
      (SELECT jsonb_build_object('id',c.id,'status',c.status,'notes',c.notes)
         FROM public.connections c WHERE c.match_id=m.id) AS connection
    FROM public.matches m
    JOIN public.profiles op ON op.id = (CASE WHEN m.a_profile_id=v_me THEN m.b_profile_id ELSE m.a_profile_id END)
    WHERE m.event_id = _event_id AND m.is_active = true
      AND (m.a_profile_id = v_me OR m.b_profile_id = v_me)
  ) r;

  RETURN v_out;
END $$;

-- ---------- 8) DECISÕES V2 -----------------------------------------------

CREATE OR REPLACE FUNCTION public.record_match_decision_v2(_match_id uuid, _decision public.decision)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_m RECORD;
  v_my_pid uuid;
  v_other_pid uuid;
  v_my_dec public.decision;
  v_other_dec public.decision;
  v_conn RECORD;
  v_created boolean := false;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;

  SELECT m.*, pa.owner_id AS a_owner, pb.owner_id AS b_owner
    INTO v_m
    FROM public.matches m
    JOIN public.profiles pa ON pa.id = m.a_profile_id
    JOIN public.profiles pb ON pb.id = m.b_profile_id
   WHERE m.id = _match_id
   FOR UPDATE OF m;
  IF NOT FOUND THEN RAISE EXCEPTION 'match_not_found' USING ERRCODE='P0001'; END IF;
  IF NOT v_m.is_active THEN RAISE EXCEPTION 'match_inactive' USING ERRCODE='P0001'; END IF;

  IF v_m.a_owner = v_uid THEN v_my_pid := v_m.a_profile_id; v_other_pid := v_m.b_profile_id;
  ELSIF v_m.b_owner = v_uid THEN v_my_pid := v_m.b_profile_id; v_other_pid := v_m.a_profile_id;
  ELSE RAISE EXCEPTION 'not_a_participant' USING ERRCODE='42501';
  END IF;

  -- Estado atual da conexão (se houver) para regra de bloqueio
  SELECT * INTO v_conn FROM public.connections WHERE match_id = _match_id FOR UPDATE;

  IF v_conn.id IS NOT NULL
     AND _decision = 'agora_nao'
     AND v_conn.status <> 'aguardando' THEN
    RAISE EXCEPTION 'decision_locked_by_connection' USING ERRCODE='P0001';
  END IF;

  INSERT INTO public.match_decisions(match_id, profile_id, decision)
  VALUES (_match_id, v_my_pid, _decision)
  ON CONFLICT (match_id, profile_id) DO UPDATE
    SET decision = EXCLUDED.decision, decided_at = now();

  INSERT INTO public.match_status_history(match_id, actor_user_id, actor_profile_id, event_type, payload)
  VALUES (_match_id, v_uid, v_my_pid, 'decision',
          jsonb_build_object('decision', _decision));

  SELECT decision INTO v_my_dec FROM public.match_decisions WHERE match_id=_match_id AND profile_id=v_my_pid;
  SELECT decision INTO v_other_dec FROM public.match_decisions WHERE match_id=_match_id AND profile_id=v_other_pid;

  -- Mutualidade
  IF v_my_dec = 'interesse' AND v_other_dec = 'interesse' AND v_conn.id IS NULL THEN
    INSERT INTO public.connections (match_id, event_id, a_profile_id, b_profile_id, status)
    VALUES (_match_id, v_m.event_id, v_m.a_profile_id, v_m.b_profile_id, 'aguardando')
    ON CONFLICT (match_id) DO NOTHING;
    v_created := true;
    SELECT * INTO v_conn FROM public.connections WHERE match_id = _match_id;
  END IF;

  RETURN jsonb_build_object(
    'my_decision', v_my_dec,
    'other_decision', v_other_dec,
    'mutual', (v_my_dec='interesse' AND v_other_dec='interesse'),
    'connection_id', v_conn.id,
    'connection_status', v_conn.status,
    'connection_created', v_created
  );
END $$;

-- Neutraliza trigger legado para não competir com a RPC v2 nem duplicar
CREATE OR REPLACE FUNCTION public.auto_create_connection()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- No-op: conexão é criada por record_match_decision_v2.
  RETURN NEW;
END $$;

-- ---------- 9) RECUPERAÇÃO V2 --------------------------------------------

CREATE OR REPLACE FUNCTION public.recover_profile_v2(_event_id text, _phone_e164 text, _code text)
RETURNS TABLE(profile_id uuid, new_recovery_code text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_norm text; v_hash text; v_pid uuid; v_prev_owner uuid;
  v_is_demo boolean; v_rec RECORD; v_recent int;
  v_new_code text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;
  v_norm := public.normalize_phone(_phone_e164);
  IF v_norm IS NULL OR _code IS NULL OR length(_code) < 4 THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE='22023';
  END IF;
  v_hash := public.hash_phone(v_norm);

  SELECT COUNT(*) INTO v_recent FROM private.recovery_attempts
    WHERE event_id=_event_id AND phone_hash=v_hash
      AND attempted_at > now() - interval '15 minutes';
  IF v_recent >= 10 THEN RAISE EXCEPTION 'rate_limited' USING ERRCODE='P0001'; END IF;

  SELECT pc.profile_id INTO v_pid FROM private.profile_contacts pc
    WHERE pc.event_id=_event_id AND pc.phone_hash=v_hash LIMIT 1;
  IF v_pid IS NULL THEN
    INSERT INTO private.recovery_attempts(event_id, phone_hash, succeeded) VALUES(_event_id, v_hash, false);
    RAISE EXCEPTION 'not_found' USING ERRCODE='P0001';
  END IF;

  -- Bloquear perfil e recovery
  SELECT p.owner_id, p.is_demo INTO v_prev_owner, v_is_demo
    FROM public.profiles p WHERE p.id = v_pid FOR UPDATE;
  IF v_is_demo THEN
    RAISE EXCEPTION 'demo_not_recoverable' USING ERRCODE='P0001';
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles p2
             WHERE p2.event_id=_event_id AND p2.owner_id=v_uid
               AND p2.is_demo=false AND p2.id <> v_pid) THEN
    RAISE EXCEPTION 'current_user_already_has_profile' USING ERRCODE='P0001';
  END IF;

  SELECT * INTO v_rec FROM private.profile_recovery WHERE profile_id=v_pid FOR UPDATE;
  IF v_rec.locked_until IS NOT NULL AND v_rec.locked_until > now() THEN
    RAISE EXCEPTION 'locked' USING ERRCODE='P0001';
  END IF;

  IF NOT public.verify_recovery_code(_code, v_rec.recovery_code_hash) THEN
    UPDATE private.profile_recovery
      SET failed_attempts = failed_attempts + 1,
          locked_until = CASE WHEN failed_attempts+1 >= 5 THEN now()+interval '15 minutes' ELSE locked_until END,
          updated_at = now()
     WHERE profile_id = v_pid;
    INSERT INTO private.recovery_attempts(event_id, phone_hash, succeeded) VALUES(_event_id, v_hash, false);
    RAISE EXCEPTION 'invalid_code' USING ERRCODE='P0001';
  END IF;

  -- Rotaciona código
  v_new_code := upper(substring(encode(extensions.gen_random_bytes(6),'hex') from 1 for 8));
  UPDATE private.profile_recovery
     SET recovery_code_hash = public.hash_recovery_code(v_new_code),
         code_rotated_at = now(), failed_attempts = 0, locked_until = NULL,
         last_recovered_at = now(), updated_at = now()
   WHERE profile_id = v_pid;

  INSERT INTO private.recovery_attempts(event_id, phone_hash, succeeded) VALUES(_event_id, v_hash, true);

  -- Transfere propriedade
  UPDATE public.profiles SET owner_id = v_uid, updated_at = now()
    WHERE id = v_pid;

  INSERT INTO public.audit_logs(event_id, actor_user_id, target_table, target_id, action, before, after)
  VALUES (_event_id, v_uid, 'profiles', v_pid::text, 'ownership_transfer',
          jsonb_build_object('previous_owner', v_prev_owner),
          jsonb_build_object('new_owner', v_uid));

  RETURN QUERY SELECT v_pid, v_new_code;
END $$;

COMMENT ON FUNCTION public.recover_profile(text,text,text) IS
  'DEPRECATED (Fase 3A): usar recover_profile_v2. Não transfere propriedade corretamente.';

-- ---------- 10) GRANTS FINAIS --------------------------------------------

REVOKE ALL ON FUNCTION public.save_own_profile_v2(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_own_profile_v2(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_event_segments_and_taxonomy(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.recompute_own_matches(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_own_matches_v2(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_match_decision_v2(uuid, public.decision) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.recover_profile_v2(text, text, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.save_own_profile_v2(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_own_profile_v2(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_event_segments_and_taxonomy(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_own_matches(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_own_matches_v2(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_match_decision_v2(uuid, public.decision) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recover_profile_v2(text, text, text) TO authenticated;
