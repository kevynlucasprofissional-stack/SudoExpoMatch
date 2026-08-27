CREATE OR REPLACE FUNCTION public.admin_release_contact_for_match(_match_id uuid, _reason text DEFAULT NULL::text)
 RETURNS TABLE(profile_id uuid, name text, company text, phone_e164 text, email text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_event_id text; v_a_pid uuid; v_b_pid uuid;
  v_conn public.connections;
  v_prev public.connection_status;
  v_reason text := NULLIF(btrim(coalesce(_reason,'')),'');
  v_role text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;

  SELECT m.event_id, m.a_profile_id, m.b_profile_id
    INTO v_event_id, v_a_pid, v_b_pid
    FROM public.matches m WHERE m.id = _match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'match_not_found' USING ERRCODE='P0001'; END IF;

  IF public.has_event_role(v_event_id, v_uid, 'admin') THEN
    v_role := 'admin';
  ELSIF public.has_event_role(v_event_id, v_uid, 'staff') THEN
    v_role := 'staff';
  ELSE
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_conn FROM public.connections WHERE match_id = _match_id FOR UPDATE;

  IF v_conn.id IS NULL THEN
    INSERT INTO public.connections (match_id, event_id, a_profile_id, b_profile_id, status)
    VALUES (_match_id, v_event_id, v_a_pid, v_b_pid, 'aguardando')
    RETURNING * INTO v_conn;
  END IF;

  IF v_conn.status = 'cancelado' THEN
    RAISE EXCEPTION 'connection_cancelled' USING ERRCODE='P0001';
  END IF;

  v_prev := v_conn.status;

  IF v_conn.status NOT IN ('apresentados','contato_trocado','concluido') THEN
    UPDATE public.connections
       SET status = 'apresentados',
           presented_at = COALESCE(presented_at, now()),
           contact_released_at = COALESCE(contact_released_at, now()),
           contact_released_by = COALESCE(contact_released_by, v_uid),
           contact_release_reason = COALESCE(contact_release_reason, v_reason),
           updated_at = now()
     WHERE id = v_conn.id
    RETURNING * INTO v_conn;

    INSERT INTO public.connection_status_history(connection_id, from_status, to_status, actor_user_id, note)
    VALUES (v_conn.id, v_prev, 'apresentados', v_uid, v_reason);
  ELSE
    UPDATE public.connections
       SET contact_released_at = COALESCE(contact_released_at, now()),
           contact_released_by = COALESCE(contact_released_by, v_uid),
           contact_release_reason = COALESCE(contact_release_reason, v_reason),
           updated_at = now()
     WHERE id = v_conn.id
    RETURNING * INTO v_conn;
  END IF;

  INSERT INTO public.connection_events(event_id, connection_id, actor_user_id, action, previous_status, new_status, note, metadata)
  VALUES (v_event_id, v_conn.id, v_uid, 'admin_release_contact', v_prev, v_conn.status, v_reason,
          jsonb_build_object('match_id', _match_id, 'actor_role', v_role));

  INSERT INTO public.audit_logs(event_id, actor_user_id, target_table, target_id, action, after)
  VALUES (v_event_id, v_uid, 'public.connections', v_conn.id::text, 'admin_release_contact',
          jsonb_build_object('match_id', _match_id, 'reason', v_reason, 'actor_role', v_role));

  RETURN QUERY
    SELECT p.id, p.name, p.company, pc.phone_e164, pc.email
      FROM public.matches m
      JOIN public.profiles p ON p.id IN (m.a_profile_id, m.b_profile_id)
      LEFT JOIN private.profile_contacts pc ON pc.profile_id = p.id
     WHERE m.id = _match_id;
END $function$;

CREATE OR REPLACE FUNCTION public.list_own_matches_v2(_event_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_me uuid;
  v_out jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;

  SELECT id INTO v_me FROM public.profiles
   WHERE event_id=_event_id AND owner_id=v_uid AND is_demo=false LIMIT 1;
  IF v_me IS NULL THEN RETURN '[]'::jsonb; END IF;

  WITH base AS (
    SELECT
      m.id AS match_id,
      v_me AS my_profile_id,
      (CASE WHEN m.a_profile_id = v_me THEN m.b_profile_id ELSE m.a_profile_id END) AS other_profile_id,
      m.kind, m.label,
      (CASE WHEN m.a_profile_id = v_me THEN m.score_for_a ELSE m.score_for_b END)::int AS score_me,
      (CASE WHEN m.a_profile_id = v_me THEN m.score_for_b ELSE m.score_for_a END)::int AS score_other,
      m.created_at, m.updated_at, m.generated_at,
      op.id AS op_id, op.name AS op_name, op.company AS op_company,
      op.city AS op_city, op.neighborhood AS op_neighborhood,
      op.segment_id AS op_segment, op.summary AS op_summary
    FROM public.matches m
    JOIN public.profiles op ON op.id = (CASE WHEN m.a_profile_id=v_me THEN m.b_profile_id ELSE m.a_profile_id END)
    WHERE m.event_id = _event_id
      AND m.is_active = true
      AND (m.a_profile_id = v_me OR m.b_profile_id = v_me)
  ), enriched AS (
    SELECT
      b.match_id, b.my_profile_id, b.other_profile_id, b.kind, b.label,
      public.match_label_for_score(b.score_me) AS label_me,
      public.match_label_for_score(b.score_other) AS label_other,
      b.score_me, b.score_other, b.created_at, b.updated_at, b.generated_at,
      jsonb_build_object(
        'name', b.op_name, 'company', b.op_company, 'city', b.op_city,
        'neighborhood', b.op_neighborhood, 'segment_id', b.op_segment, 'summary', b.op_summary
      ) AS other,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object('label', po.label, 'detail', po.detail) ORDER BY po.sort_order)
          FROM public.profile_offers po WHERE po.profile_id = b.op_id AND po.active
      ), '[]'::jsonb) AS other_offers,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'label', pn.label, 'detail', pn.detail,
          'need_kind', pn.need_kind, 'is_priority', pn.is_priority
        ) ORDER BY pn.sort_order)
          FROM public.profile_needs pn WHERE pn.profile_id = b.op_id AND pn.active
      ), '[]'::jsonb) AS other_needs,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object('code',mr.code,'label',mr.label,'weight',mr.weight) ORDER BY mr.weight DESC)
          FROM public.match_reasons mr
         WHERE mr.match_id = b.match_id AND mr.perspective_profile_id = v_me
      ), '[]'::jsonb) AS reasons,
      COALESCE(
        (SELECT decision FROM public.match_decisions WHERE match_id=b.match_id AND profile_id=v_me),
        'sem_decisao'::public.decision
      ) AS my_decision,
      COALESCE(
        (SELECT decision FROM public.match_decisions WHERE match_id=b.match_id AND profile_id=b.other_profile_id),
        'sem_decisao'::public.decision
      ) AS other_decision,
      (SELECT jsonb_build_object(
                'id', c.id,
                'status', c.status,
                'notes', c.notes,
                'contact_released_at', c.contact_released_at)
         FROM public.connections c WHERE c.match_id = b.match_id) AS connection
    FROM base b
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.score_me DESC, e.generated_at DESC), '[]'::jsonb)
    INTO v_out
    FROM enriched e;

  RETURN v_out;
END $function$;