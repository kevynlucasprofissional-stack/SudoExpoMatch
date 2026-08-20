-- IMPL 12 — relações complementares editáveis (admin-only, auditadas)

CREATE UNIQUE INDEX IF NOT EXISTS taxonomy_relations_unique_pair
  ON public.taxonomy_relations (from_taxonomy_item_id, to_taxonomy_item_id, relation_type);

CREATE OR REPLACE FUNCTION public._taxonomy_relation_json(_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT to_jsonb(x) FROM (
    SELECT tr.id, tr.relation_type, tr.weight, tr.rationale, tr.active,
           tr.from_taxonomy_item_id, fi.label AS from_label, fi.segment_id AS from_segment_id,
           fsg.label AS from_segment_label, fi.active AS from_active,
           tr.to_taxonomy_item_id, ti.label AS to_label, ti.segment_id AS to_segment_id,
           tsg.label AS to_segment_label, ti.active AS to_active,
           tr.created_at, tr.updated_at
    FROM public.taxonomy_relations tr
    JOIN public.taxonomy_items fi ON fi.id = tr.from_taxonomy_item_id
    JOIN public.taxonomy_items ti ON ti.id = tr.to_taxonomy_item_id
    LEFT JOIN public.segments fsg ON fsg.id = fi.segment_id
    LEFT JOIN public.segments tsg ON tsg.id = ti.segment_id
    WHERE tr.id = _id
  ) x;
$$;

REVOKE ALL ON FUNCTION public._taxonomy_relation_json(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._validate_taxonomy_relation_payload(
  _from uuid, _to uuid, _relation_type text, _weight int, _rationale text)
RETURNS void
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF _from IS NULL OR _to IS NULL THEN
    RAISE EXCEPTION 'invalid_relation_items' USING ERRCODE='P0001';
  END IF;
  IF _from = _to THEN
    RAISE EXCEPTION 'self_relation' USING ERRCODE='P0001';
  END IF;
  IF COALESCE(_relation_type, '') <> 'complements' THEN
    RAISE EXCEPTION 'invalid_relation_type' USING ERRCODE='P0001';
  END IF;
  IF _weight IS NULL OR _weight < 1 OR _weight > 100 THEN
    RAISE EXCEPTION 'invalid_weight' USING ERRCODE='P0001';
  END IF;
  IF _rationale IS NOT NULL AND char_length(btrim(_rationale)) > 500 THEN
    RAISE EXCEPTION 'invalid_rationale' USING ERRCODE='P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.taxonomy_items WHERE id = _from) THEN
    RAISE EXCEPTION 'from_item_not_found' USING ERRCODE='P0002';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.taxonomy_items WHERE id = _to) THEN
    RAISE EXCEPTION 'to_item_not_found' USING ERRCODE='P0002';
  END IF;
END $$;

REVOKE ALL ON FUNCTION public._validate_taxonomy_relation_payload(uuid, uuid, text, int, text)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_create_taxonomy_relation(
  _event_id text, _from_item_id uuid, _to_item_id uuid,
  _relation_type text DEFAULT 'complements', _weight int DEFAULT 60, _rationale text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_uid uuid; v_id uuid; v_after jsonb; v_rat text;
BEGIN
  v_uid := public._admin_require_event_admin(_event_id);
  PERFORM public._validate_taxonomy_relation_payload(_from_item_id, _to_item_id, _relation_type, _weight, _rationale);

  v_rat := NULLIF(btrim(COALESCE(_rationale, '')), '');

  IF EXISTS (
    SELECT 1 FROM public.taxonomy_relations
     WHERE from_taxonomy_item_id = _from_item_id
       AND to_taxonomy_item_id = _to_item_id
       AND relation_type = _relation_type
  ) THEN
    RAISE EXCEPTION 'duplicate_relation' USING ERRCODE='P0001';
  END IF;

  INSERT INTO public.taxonomy_relations
    (from_taxonomy_item_id, to_taxonomy_item_id, relation_type, weight, rationale, active, created_by)
  VALUES (_from_item_id, _to_item_id, _relation_type, _weight, v_rat, true, v_uid)
  RETURNING id INTO v_id;

  v_after := public._taxonomy_relation_json(v_id);

  INSERT INTO public.audit_logs (event_id, actor_user_id, target_table, target_id, action, before, after)
  VALUES (_event_id, v_uid, 'taxonomy_relation', v_id::text, 'create', NULL, v_after);

  RETURN v_after;
END $$;

CREATE OR REPLACE FUNCTION public.admin_update_taxonomy_relation(
  _event_id text, _relation_id uuid,
  _relation_type text DEFAULT 'complements', _weight int DEFAULT 60, _rationale text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_uid uuid; v_before jsonb; v_after jsonb; v_from uuid; v_to uuid; v_rat text;
BEGIN
  v_uid := public._admin_require_event_admin(_event_id);

  SELECT from_taxonomy_item_id, to_taxonomy_item_id INTO v_from, v_to
    FROM public.taxonomy_relations WHERE id = _relation_id;
  IF v_from IS NULL THEN RAISE EXCEPTION 'not_found' USING ERRCODE='P0002'; END IF;

  PERFORM public._validate_taxonomy_relation_payload(v_from, v_to, _relation_type, _weight, _rationale);
  v_rat := NULLIF(btrim(COALESCE(_rationale, '')), '');

  IF EXISTS (
    SELECT 1 FROM public.taxonomy_relations
     WHERE from_taxonomy_item_id = v_from
       AND to_taxonomy_item_id = v_to
       AND relation_type = _relation_type
       AND id <> _relation_id
  ) THEN
    RAISE EXCEPTION 'duplicate_relation' USING ERRCODE='P0001';
  END IF;

  v_before := public._taxonomy_relation_json(_relation_id);

  UPDATE public.taxonomy_relations
     SET relation_type = _relation_type, weight = _weight, rationale = v_rat, updated_at = now()
   WHERE id = _relation_id;

  v_after := public._taxonomy_relation_json(_relation_id);

  INSERT INTO public.audit_logs (event_id, actor_user_id, target_table, target_id, action, before, after)
  VALUES (_event_id, v_uid, 'taxonomy_relation', _relation_id::text, 'update', v_before, v_after);

  RETURN v_after;
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_taxonomy_relation_active(
  _event_id text, _relation_id uuid, _active boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_uid uuid; v_before jsonb; v_after jsonb;
BEGIN
  v_uid := public._admin_require_event_admin(_event_id);
  IF _active IS NULL THEN RAISE EXCEPTION 'invalid_active' USING ERRCODE='P0001'; END IF;

  v_before := public._taxonomy_relation_json(_relation_id);
  IF v_before IS NULL THEN RAISE EXCEPTION 'not_found' USING ERRCODE='P0002'; END IF;

  UPDATE public.taxonomy_relations SET active = _active, updated_at = now() WHERE id = _relation_id;
  v_after := public._taxonomy_relation_json(_relation_id);

  INSERT INTO public.audit_logs (event_id, actor_user_id, target_table, target_id, action, before, after)
  VALUES (_event_id, v_uid, 'taxonomy_relation', _relation_id::text,
          CASE WHEN _active THEN 'activate' ELSE 'deactivate' END, v_before, v_after);

  RETURN v_after;
END $$;

REVOKE ALL ON FUNCTION public.admin_create_taxonomy_relation(text, uuid, uuid, text, int, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_update_taxonomy_relation(text, uuid, text, int, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_taxonomy_relation_active(text, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_taxonomy_relation(text, uuid, uuid, text, int, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_taxonomy_relation(text, uuid, text, int, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_taxonomy_relation_active(text, uuid, boolean) TO authenticated;