-- IMPL 11 hardening: validação explícita de sinônimos (sem truncamento silencioso)

CREATE OR REPLACE FUNCTION public._sanitize_synonyms(_syn text[])
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  -- Determinística: apenas trim + dedupe case-insensitive, preservando a ordem.
  -- Não trunca e não descarta por tamanho: validação é responsabilidade de _validate_synonyms.
  SELECT COALESCE(array_agg(s ORDER BY ord), '{}'::text[])
  FROM (
    SELECT (array_agg(btrim(x) ORDER BY ord))[1] AS s, MIN(ord) AS ord
    FROM unnest(COALESCE(_syn, '{}'::text[])) WITH ORDINALITY AS t(x, ord)
    WHERE btrim(x) <> ''
    GROUP BY lower(btrim(x))
  ) d;
$$;

CREATE OR REPLACE FUNCTION public._validate_synonyms(_syn text[])
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE v_raw int; v_max_len int; v_clean int;
BEGIN
  v_raw := COALESCE(array_length(_syn, 1), 0);
  -- Limite defensivo de payload bruto (entradas enviadas, incluindo vazias/duplicadas).
  IF v_raw > 100 THEN
    RAISE EXCEPTION 'too_many_synonyms_raw' USING ERRCODE='P0001';
  END IF;

  SELECT COALESCE(MAX(length(btrim(x))), 0) INTO v_max_len
  FROM unnest(COALESCE(_syn, '{}'::text[])) AS t(x)
  WHERE btrim(x) <> '';
  IF v_max_len > 80 THEN
    RAISE EXCEPTION 'synonym_too_long' USING ERRCODE='P0001';
  END IF;

  v_clean := COALESCE(array_length(public._sanitize_synonyms(_syn), 1), 0);
  IF v_clean > 20 THEN
    RAISE EXCEPTION 'too_many_synonyms' USING ERRCODE='P0001';
  END IF;
END
$$;

REVOKE ALL ON FUNCTION public._sanitize_synonyms(text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._validate_synonyms(text[]) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_create_taxonomy_item(
  _event_id text, _label text, _segment_id text, _kind text,
  _description text DEFAULT NULL, _synonyms text[] DEFAULT '{}'::text[])
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid uuid; v_id uuid; v_slug text; v_label text; v_desc text;
BEGIN
  v_uid := public._admin_require_event_admin(_event_id);
  PERFORM public._validate_taxonomy_payload(_label, _segment_id, _kind, _description);
  PERFORM public._validate_synonyms(_synonyms);

  v_label := btrim(_label);
  v_desc := NULLIF(btrim(COALESCE(_description, '')), '');
  v_slug := public._taxonomy_unique_slug(v_label, _segment_id, _kind);

  INSERT INTO public.taxonomy_items (slug, label, kind, segment_id, description, synonyms, active)
  VALUES (v_slug, v_label, _kind, _segment_id, v_desc, public._sanitize_synonyms(_synonyms), true)
  RETURNING id INTO v_id;

  INSERT INTO public.audit_logs (event_id, actor_user_id, target_table, target_id, action, before, after)
  VALUES (_event_id, v_uid, 'taxonomy_item', v_id::text, 'create', NULL, public._taxonomy_item_json(v_id));

  RETURN v_id;
END
$$;
