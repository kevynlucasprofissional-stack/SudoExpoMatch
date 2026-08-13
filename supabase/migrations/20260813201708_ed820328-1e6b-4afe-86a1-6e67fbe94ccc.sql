-- IMPL 11 — Governança administrativa da taxonomia.
-- 1) Remove mutação direta por staff; 2) RPCs admin-only auditadas.

DROP POLICY IF EXISTS taxonomy_items_insert_staff ON public.taxonomy_items;
DROP POLICY IF EXISTS taxonomy_items_update_staff ON public.taxonomy_items;
DROP POLICY IF EXISTS taxonomy_items_delete_staff ON public.taxonomy_items;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.taxonomy_items FROM authenticated, anon, PUBLIC;
REVOKE ALL ON public.taxonomy_items FROM anon;
GRANT SELECT ON public.taxonomy_items TO authenticated;
GRANT ALL ON public.taxonomy_items TO service_role;

COMMENT ON TABLE public.taxonomy_items IS
  'Catálogo global de ofertas/necessidades. Mutação apenas via RPCs admin-only auditadas (Impl 11).';

-- ---------------------------------------------------------------------------
-- Helpers internos (não expostos a clientes)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._admin_require_event_admin(_event_id text)
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;
  IF COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  IF NOT public.has_event_role(_event_id, v_uid, 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  RETURN v_uid;
END $$;

REVOKE ALL ON FUNCTION public._admin_require_event_admin(text) FROM PUBLIC, anon, authenticated;

-- Sanitização determinística de sinônimos: trim, sem vazios, dedupe
-- case-insensitive, máximo 20 itens de até 80 caracteres.
CREATE OR REPLACE FUNCTION public._sanitize_synonyms(_syn text[])
RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = public
AS $$
  SELECT COALESCE(array_agg(s ORDER BY ord), '{}'::text[])
  FROM (
    SELECT DISTINCT ON (lower(btrim(x))) btrim(x) AS s, MIN(ord) AS ord
    FROM unnest(COALESCE(_syn, '{}'::text[])) WITH ORDINALITY AS t(x, ord)
    WHERE btrim(x) <> ''
    GROUP BY lower(btrim(x)), btrim(x)
    ORDER BY lower(btrim(x)), MIN(ord)
  ) d
  WHERE length(d.s) <= 80
  LIMIT 20;
$$;

REVOKE ALL ON FUNCTION public._sanitize_synonyms(text[]) FROM PUBLIC, anon, authenticated;

-- Slug estável e determinístico dentro de (segment_id, kind).
CREATE OR REPLACE FUNCTION public._taxonomy_unique_slug(_label text, _segment_id text, _kind text)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_base text; v_slug text; i int := 1;
BEGIN
  v_base := NULLIF(public.slugify(_label), '');
  IF v_base IS NULL THEN v_base := 'item'; END IF;
  v_base := left(v_base, 100);
  v_slug := v_base;
  WHILE EXISTS (
    SELECT 1 FROM public.taxonomy_items
    WHERE slug = v_slug AND segment_id IS NOT DISTINCT FROM _segment_id AND kind = _kind
  ) LOOP
    i := i + 1;
    v_slug := v_base || '-' || i::text;
    IF i > 200 THEN RAISE EXCEPTION 'slug_collision' USING ERRCODE='P0001'; END IF;
  END LOOP;
  RETURN v_slug;
END $$;

REVOKE ALL ON FUNCTION public._taxonomy_unique_slug(text, text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._taxonomy_item_json(_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT to_jsonb(t) - 'created_at'
  FROM (
    SELECT ti.id, ti.slug, ti.label, ti.kind, ti.segment_id, ti.description,
           ti.synonyms, ti.active, ti.updated_at
    FROM public.taxonomy_items ti WHERE ti.id = _id
  ) t;
$$;

REVOKE ALL ON FUNCTION public._taxonomy_item_json(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._validate_taxonomy_payload(
  _label text, _segment_id text, _kind text, _description text
) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF _label IS NULL OR length(btrim(_label)) < 2 OR length(btrim(_label)) > 120 THEN
    RAISE EXCEPTION 'invalid_label' USING ERRCODE='P0001';
  END IF;
  IF _kind IS NULL OR _kind NOT IN ('offer','need','both') THEN
    RAISE EXCEPTION 'invalid_kind' USING ERRCODE='P0001';
  END IF;
  IF _description IS NOT NULL AND length(_description) > 800 THEN
    RAISE EXCEPTION 'invalid_description' USING ERRCODE='P0001';
  END IF;
  IF _segment_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.segments WHERE id = _segment_id) THEN
    RAISE EXCEPTION 'invalid_segment' USING ERRCODE='P0001';
  END IF;
END $$;

REVOKE ALL ON FUNCTION public._validate_taxonomy_payload(text, text, text, text) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Leitura administrativa
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_list_taxonomy_items(
  _event_id text,
  _search text DEFAULT NULL,
  _segment_ids text[] DEFAULT NULL,
  _kinds text[] DEFAULT NULL,
  _active boolean DEFAULT NULL,
  _limit int DEFAULT 20,
  _offset int DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_limit int := LEAST(GREATEST(COALESCE(_limit, 20), 1), 100);
  v_offset int := GREATEST(COALESCE(_offset, 0), 0);
  v_q text := NULLIF(btrim(COALESCE(_search, '')), '');
  v_total int;
  v_items jsonb;
BEGIN
  PERFORM public._admin_require_event_admin(_event_id);

  WITH base AS (
    SELECT ti.*
    FROM public.taxonomy_items ti
    WHERE (_segment_ids IS NULL OR array_length(_segment_ids,1) IS NULL OR ti.segment_id = ANY(_segment_ids))
      AND (_kinds IS NULL OR array_length(_kinds,1) IS NULL OR ti.kind = ANY(_kinds))
      AND (_active IS NULL OR ti.active = _active)
      AND (
        v_q IS NULL
        OR ti.label ILIKE '%'||v_q||'%'
        OR ti.slug ILIKE '%'||v_q||'%'
        OR EXISTS (SELECT 1 FROM unnest(ti.synonyms) s WHERE s ILIKE '%'||v_q||'%')
      )
  ), counted AS (
    SELECT count(*)::int AS total FROM base
  ), page AS (
    SELECT b.* FROM base b
    ORDER BY b.segment_id NULLS LAST, b.label
    LIMIT v_limit OFFSET v_offset
  ), enriched AS (
    SELECT
      p.id, p.slug, p.label, p.kind, p.segment_id, p.description, p.synonyms,
      p.active, p.created_at, p.updated_at,
      sg.label AS segment_label,
      COALESCE(po.active_count, 0) AS usage_offers_active,
      COALESCE(po.total_count, 0) AS usage_offers_total,
      COALESCE(pn.active_count, 0) AS usage_needs_active,
      COALESCE(pn.total_count, 0) AS usage_needs_total,
      COALESCE(ro.active_count, 0) AS outgoing_relations_active,
      COALESCE(ro.total_count, 0) AS outgoing_relations_total,
      COALESCE(ri.active_count, 0) AS incoming_relations_active,
      COALESCE(ri.total_count, 0) AS incoming_relations_total
    FROM page p
    LEFT JOIN public.segments sg ON sg.id = p.segment_id
    LEFT JOIN LATERAL (
      SELECT count(*) FILTER (WHERE o.active)::int AS active_count, count(*)::int AS total_count
      FROM public.profile_offers o WHERE o.taxonomy_item_id = p.id
    ) po ON true
    LEFT JOIN LATERAL (
      SELECT count(*) FILTER (WHERE n.active)::int AS active_count, count(*)::int AS total_count
      FROM public.profile_needs n WHERE n.taxonomy_item_id = p.id
    ) pn ON true
    LEFT JOIN LATERAL (
      SELECT count(*) FILTER (WHERE r.active)::int AS active_count, count(*)::int AS total_count
      FROM public.taxonomy_relations r WHERE r.from_taxonomy_item_id = p.id
    ) ro ON true
    LEFT JOIN LATERAL (
      SELECT count(*) FILTER (WHERE r.active)::int AS active_count, count(*)::int AS total_count
      FROM public.taxonomy_relations r WHERE r.to_taxonomy_item_id = p.id
    ) ri ON true
  )
  SELECT (SELECT total FROM counted),
         COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.segment_id NULLS LAST, e.label) FROM enriched e), '[]'::jsonb)
  INTO v_total, v_items;

  RETURN jsonb_build_object('items', v_items, 'total', v_total, 'limit', v_limit, 'offset', v_offset);
END $$;

REVOKE ALL ON FUNCTION public.admin_list_taxonomy_items(text, text, text[], text[], boolean, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_taxonomy_items(text, text, text[], text[], boolean, int, int) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_taxonomy_item_detail(_event_id text, _item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_item jsonb; v_rel jsonb;
BEGIN
  PERFORM public._admin_require_event_admin(_event_id);

  SELECT to_jsonb(x) INTO v_item FROM (
    SELECT ti.id, ti.slug, ti.label, ti.kind, ti.segment_id, sg.label AS segment_label,
           ti.description, ti.synonyms, ti.active, ti.created_at, ti.updated_at,
           (SELECT count(*) FILTER (WHERE o.active)::int FROM public.profile_offers o WHERE o.taxonomy_item_id = ti.id) AS usage_offers_active,
           (SELECT count(*)::int FROM public.profile_offers o WHERE o.taxonomy_item_id = ti.id) AS usage_offers_total,
           (SELECT count(*) FILTER (WHERE n.active)::int FROM public.profile_needs n WHERE n.taxonomy_item_id = ti.id) AS usage_needs_active,
           (SELECT count(*)::int FROM public.profile_needs n WHERE n.taxonomy_item_id = ti.id) AS usage_needs_total,
           (SELECT count(*)::int FROM public.match_reasons mr WHERE mr.taxonomy_relation_id IN (
              SELECT r.id FROM public.taxonomy_relations r
              WHERE r.from_taxonomy_item_id = ti.id OR r.to_taxonomy_item_id = ti.id)) AS usage_match_reasons
    FROM public.taxonomy_items ti
    LEFT JOIN public.segments sg ON sg.id = ti.segment_id
    WHERE ti.id = _item_id
  ) x;

  IF v_item IS NULL THEN RAISE EXCEPTION 'not_found' USING ERRCODE='P0002'; END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.direction, r.other_label), '[]'::jsonb) INTO v_rel FROM (
    SELECT tr.id, 'outgoing'::text AS direction, tr.relation_type, tr.weight, tr.rationale, tr.active,
           oi.id AS other_id, oi.label AS other_label, oi.segment_id AS other_segment_id,
           osg.label AS other_segment_label, oi.active AS other_active
    FROM public.taxonomy_relations tr
    JOIN public.taxonomy_items oi ON oi.id = tr.to_taxonomy_item_id
    LEFT JOIN public.segments osg ON osg.id = oi.segment_id
    WHERE tr.from_taxonomy_item_id = _item_id
    UNION ALL
    SELECT tr.id, 'incoming'::text, tr.relation_type, tr.weight, tr.rationale, tr.active,
           oi.id, oi.label, oi.segment_id, osg.label, oi.active
    FROM public.taxonomy_relations tr
    JOIN public.taxonomy_items oi ON oi.id = tr.from_taxonomy_item_id
    LEFT JOIN public.segments osg ON osg.id = oi.segment_id
    WHERE tr.to_taxonomy_item_id = _item_id
  ) r;

  RETURN jsonb_build_object('item', v_item, 'relations', v_rel);
END $$;

REVOKE ALL ON FUNCTION public.admin_get_taxonomy_item_detail(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_taxonomy_item_detail(text, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Mutações admin-only auditadas
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_create_taxonomy_item(
  _event_id text, _label text, _segment_id text, _kind text,
  _description text DEFAULT NULL, _synonyms text[] DEFAULT '{}'::text[]
) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid; v_id uuid; v_slug text; v_label text; v_desc text;
BEGIN
  v_uid := public._admin_require_event_admin(_event_id);
  PERFORM public._validate_taxonomy_payload(_label, _segment_id, _kind, _description);

  v_label := btrim(_label);
  v_desc := NULLIF(btrim(COALESCE(_description, '')), '');
  v_slug := public._taxonomy_unique_slug(v_label, _segment_id, _kind);

  INSERT INTO public.taxonomy_items (slug, label, kind, segment_id, description, synonyms, active)
  VALUES (v_slug, v_label, _kind, _segment_id, v_desc, public._sanitize_synonyms(_synonyms), true)
  RETURNING id INTO v_id;

  INSERT INTO public.audit_logs (event_id, actor_user_id, target_table, target_id, action, before, after)
  VALUES (_event_id, v_uid, 'taxonomy_item', v_id::text, 'create', NULL, public._taxonomy_item_json(v_id));

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.admin_create_taxonomy_item(text, text, text, text, text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_taxonomy_item(text, text, text, text, text, text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_update_taxonomy_item(
  _event_id text, _item_id uuid, _label text, _segment_id text, _kind text,
  _description text DEFAULT NULL, _synonyms text[] DEFAULT '{}'::text[]
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid; v_before jsonb; v_after jsonb;
BEGIN
  v_uid := public._admin_require_event_admin(_event_id);
  PERFORM public._validate_taxonomy_payload(_label, _segment_id, _kind, _description);

  v_before := public._taxonomy_item_json(_item_id);
  IF v_before IS NULL THEN RAISE EXCEPTION 'not_found' USING ERRCODE='P0002'; END IF;

  -- slug permanece estável: identidade do item não muda ao renomear.
  UPDATE public.taxonomy_items
  SET label = btrim(_label),
      segment_id = _segment_id,
      kind = _kind,
      description = NULLIF(btrim(COALESCE(_description, '')), ''),
      synonyms = public._sanitize_synonyms(_synonyms),
      updated_at = now()
  WHERE id = _item_id;

  v_after := public._taxonomy_item_json(_item_id);

  INSERT INTO public.audit_logs (event_id, actor_user_id, target_table, target_id, action, before, after)
  VALUES (_event_id, v_uid, 'taxonomy_item', _item_id::text, 'update', v_before, v_after);

  RETURN v_after;
END $$;

REVOKE ALL ON FUNCTION public.admin_update_taxonomy_item(text, uuid, text, text, text, text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_taxonomy_item(text, uuid, text, text, text, text, text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_taxonomy_item_active(
  _event_id text, _item_id uuid, _active boolean
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid; v_before jsonb; v_after jsonb;
BEGIN
  v_uid := public._admin_require_event_admin(_event_id);
  IF _active IS NULL THEN RAISE EXCEPTION 'invalid_active' USING ERRCODE='P0001'; END IF;

  v_before := public._taxonomy_item_json(_item_id);
  IF v_before IS NULL THEN RAISE EXCEPTION 'not_found' USING ERRCODE='P0002'; END IF;

  UPDATE public.taxonomy_items SET active = _active, updated_at = now() WHERE id = _item_id;
  v_after := public._taxonomy_item_json(_item_id);

  INSERT INTO public.audit_logs (event_id, actor_user_id, target_table, target_id, action, before, after)
  VALUES (_event_id, v_uid, 'taxonomy_item', _item_id::text,
          CASE WHEN _active THEN 'activate' ELSE 'deactivate' END, v_before, v_after);

  RETURN v_after;
END $$;

REVOKE ALL ON FUNCTION public.admin_set_taxonomy_item_active(text, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_taxonomy_item_active(text, uuid, boolean) TO authenticated;