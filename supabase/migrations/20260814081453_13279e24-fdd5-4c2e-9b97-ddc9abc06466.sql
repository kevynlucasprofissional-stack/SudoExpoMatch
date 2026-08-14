CREATE OR REPLACE FUNCTION public.admin_update_taxonomy_item(
  _event_id text, _item_id uuid, _label text, _segment_id text, _kind text,
  _description text DEFAULT NULL, _synonyms text[] DEFAULT '{}'::text[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid uuid; v_before jsonb; v_after jsonb;
BEGIN
  v_uid := public._admin_require_event_admin(_event_id);
  PERFORM public._validate_taxonomy_payload(_label, _segment_id, _kind, _description);
  PERFORM public._validate_synonyms(_synonyms);

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
END
$$;
