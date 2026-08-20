-- =========================================================
-- PARTE B: analytics_events precisa de GRANT (RLS já restringe)
-- =========================================================
GRANT INSERT ON public.analytics_events TO authenticated;
GRANT ALL ON public.analytics_events TO service_role;

-- =========================================================
-- PARTE A: outcomes comerciais em connection_events
-- Modelo reaproveitado (sem nova entidade): action = 'outcome:<kind>'
-- =========================================================
CREATE UNIQUE INDEX IF NOT EXISTS uq_connection_events_outcome
  ON public.connection_events (connection_id, action)
  WHERE action LIKE 'outcome:%';

CREATE INDEX IF NOT EXISTS idx_connection_events_outcome_event
  ON public.connection_events (event_id, action, created_at DESC)
  WHERE action LIKE 'outcome:%';

CREATE OR REPLACE FUNCTION public._outcome_kinds()
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $function$ SELECT ARRAY['conversa_realizada','reuniao_agendada','proposta_solicitada','negocio_reportado']::text[] $function$;

CREATE OR REPLACE FUNCTION public.staff_record_connection_outcome(
  _connection_id uuid, _kind text, _note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_c public.connections;
  v_note text := NULLIF(btrim(COALESCE(_note,'')), '');
  v_inserted boolean := false;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;
  IF _kind IS NULL OR NOT (_kind = ANY (public._outcome_kinds())) THEN
    RAISE EXCEPTION 'invalid_outcome_kind' USING ERRCODE='P0001';
  END IF;
  IF v_note IS NOT NULL AND char_length(v_note) > 280 THEN
    RAISE EXCEPTION 'note_too_long' USING ERRCODE='P0001';
  END IF;

  SELECT * INTO v_c FROM public.connections WHERE id = _connection_id;
  IF v_c.id IS NULL THEN RAISE EXCEPTION 'connection_not_found' USING ERRCODE='P0001'; END IF;
  IF NOT public.has_any_event_role(v_c.event_id, v_uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  INSERT INTO public.connection_events(event_id, connection_id, actor_user_id, action, note, metadata)
  VALUES (v_c.event_id, v_c.id, v_uid, 'outcome:'||_kind, v_note,
          jsonb_build_object('outcome_kind', _kind))
  ON CONFLICT (connection_id, action) WHERE action LIKE 'outcome:%' DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  RETURN jsonb_build_object(
    'connection_id', v_c.id,
    'kind', _kind,
    'created', v_inserted,
    'outcomes', public._connection_outcomes(v_c.id)
  );
END $function$;

CREATE OR REPLACE FUNCTION public._connection_outcomes(_connection_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'kind', e.metadata->>'outcome_kind',
           'note', e.note,
           'created_at', e.created_at,
           'actor_email', (SELECT u.email FROM auth.users u WHERE u.id = e.actor_user_id)
         ) ORDER BY e.created_at ASC), '[]'::jsonb)
    FROM public.connection_events e
   WHERE e.connection_id = _connection_id
     AND e.action LIKE 'outcome:%'
$function$;

CREATE OR REPLACE FUNCTION public.staff_remove_connection_outcome(
  _connection_id uuid, _kind text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_c public.connections;
  v_removed int := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;
  IF _kind IS NULL OR NOT (_kind = ANY (public._outcome_kinds())) THEN
    RAISE EXCEPTION 'invalid_outcome_kind' USING ERRCODE='P0001';
  END IF;

  SELECT * INTO v_c FROM public.connections WHERE id = _connection_id;
  IF v_c.id IS NULL THEN RAISE EXCEPTION 'connection_not_found' USING ERRCODE='P0001'; END IF;
  IF NOT public.has_any_event_role(v_c.event_id, v_uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  DELETE FROM public.connection_events
   WHERE connection_id = v_c.id AND action = 'outcome:'||_kind;
  GET DIAGNOSTICS v_removed = ROW_COUNT;

  IF v_removed > 0 THEN
    INSERT INTO public.connection_events(event_id, connection_id, actor_user_id, action, metadata)
    VALUES (v_c.event_id, v_c.id, v_uid, 'outcome_removed',
            jsonb_build_object('outcome_kind', _kind));
  END IF;

  RETURN jsonb_build_object(
    'connection_id', v_c.id,
    'kind', _kind,
    'removed', v_removed > 0,
    'outcomes', public._connection_outcomes(v_c.id)
  );
END $function$;

-- Detalhe da conexão passa a expor os outcomes
CREATE OR REPLACE FUNCTION public.staff_list_connection_detail(_connection_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_c public.connections;
  v_out jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_c FROM public.connections WHERE id = _connection_id;
  IF v_c.id IS NULL THEN RAISE EXCEPTION 'connection_not_found' USING ERRCODE='P0001'; END IF;
  IF NOT public.has_any_event_role(v_c.event_id, v_uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  SELECT jsonb_build_object(
    'id', v_c.id,
    'event_id', v_c.event_id,
    'match_id', v_c.match_id,
    'status', v_c.status,
    'assigned_to', v_c.assigned_to,
    'assignee_email', (SELECT email FROM auth.users WHERE id = v_c.assigned_to),
    'assigned_at', v_c.assigned_at,
    'assumed_at', v_c.assumed_at,
    'presented_at', v_c.presented_at,
    'contact_exchanged_at', v_c.contact_exchanged_at,
    'completed_at', v_c.completed_at,
    'cancelled_at', v_c.cancelled_at,
    'created_at', v_c.created_at,
    'updated_at', v_c.updated_at,
    'mapped_at', v_c.mapped_at,
    'mapped_by', v_c.mapped_by,
    'mapped_by_email', (SELECT email FROM auth.users WHERE id = v_c.mapped_by),
    'notes_summary', v_c.notes,
    'outcomes', public._connection_outcomes(v_c.id),
    'a', (SELECT jsonb_build_object('id',p.id,'name',p.name,'company',p.company,'city',p.city,
            'segment_id',p.segment_id,'summary',p.summary,
            'pin_code',p.pin_code,'pin_placed_at',p.pin_placed_at)
            FROM public.profiles p WHERE p.id = v_c.a_profile_id),
    'b', (SELECT jsonb_build_object('id',p.id,'name',p.name,'company',p.company,'city',p.city,
            'segment_id',p.segment_id,'summary',p.summary,
            'pin_code',p.pin_code,'pin_placed_at',p.pin_placed_at)
            FROM public.profiles p WHERE p.id = v_c.b_profile_id),
    'reasons', COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.weight DESC)
       FROM public.match_reasons r WHERE r.match_id = v_c.match_id), '[]'::jsonb),
    'events', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', e.id, 'action', e.action, 'previous_status', e.previous_status,
        'new_status', e.new_status, 'assigned_from', e.assigned_from,
        'assigned_to', e.assigned_to, 'note', e.note, 'metadata', e.metadata,
        'created_at', e.created_at,
        'actor_email', (SELECT email FROM auth.users WHERE id = e.actor_user_id)
      ) ORDER BY e.created_at ASC)
       FROM public.connection_events e WHERE e.connection_id = v_c.id), '[]'::jsonb),
    'internal_notes', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', n.id, 'body', n.body, 'created_at', n.created_at,
        'author_email', (SELECT email FROM auth.users WHERE id = n.author_user_id)
      ) ORDER BY n.created_at ASC)
       FROM public.connection_notes n WHERE n.connection_id = v_c.id), '[]'::jsonb)
  ) INTO v_out;

  RETURN v_out;
END $function$;

-- =========================================================
-- ADMIN: agregação server-side do funil (sem N+1, sem PII)
-- =========================================================
CREATE OR REPLACE FUNCTION public.admin_experience_analytics(_event_id text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_out jsonb;
BEGIN
  PERFORM public._admin_require_event_admin(_event_id);

  WITH prof AS (
    SELECT p.id,
           EXISTS (SELECT 1 FROM public.profile_offers o WHERE o.profile_id = p.id AND o.active) AS has_offer,
           EXISTS (SELECT 1 FROM public.profile_needs n WHERE n.profile_id = p.id AND n.active) AS has_need
      FROM public.profiles p
     WHERE p.event_id = _event_id AND p.is_demo = false
  ),
  m AS (SELECT * FROM public.matches WHERE event_id = _event_id AND is_active),
  d AS (
    SELECT dd.* FROM public.match_decisions dd
      JOIN m ON m.id = dd.match_id
  ),
  mutual AS (
    SELECT m.id FROM m
     WHERE (SELECT count(DISTINCT dd.profile_id) FROM d dd
             WHERE dd.match_id = m.id AND dd.decision = 'interesse'
               AND dd.profile_id IN (m.a_profile_id, m.b_profile_id)) >= 2
  ),
  c AS (SELECT * FROM public.connections WHERE event_id = _event_id),
  oc AS (
    SELECT e.metadata->>'outcome_kind' AS kind, count(*)::int AS total
      FROM public.connection_events e
     WHERE e.event_id = _event_id AND e.action LIKE 'outcome:%'
     GROUP BY 1
  ),
  ae AS (
    SELECT a.kind, count(*)::int AS total
      FROM public.analytics_events a
     WHERE a.event_id = _event_id
     GROUP BY 1
  )
  SELECT jsonb_build_object(
    'event_id', _event_id,
    'profiles_total', (SELECT count(*) FROM prof),
    'onboarding_completed', (SELECT count(*) FROM prof WHERE has_offer AND has_need),
    'profiles_with_match', (SELECT count(DISTINCT pid) FROM (
        SELECT a_profile_id AS pid FROM m UNION SELECT b_profile_id FROM m) t),
    'matches_total', (SELECT count(*) FROM m),
    'interests', (SELECT count(*) FROM d WHERE decision = 'interesse'),
    'mutual_interests', (SELECT count(*) FROM mutual),
    'connections_total', (SELECT count(*) FROM c),
    'connections_presented', (SELECT count(*) FROM c WHERE presented_at IS NOT NULL),
    'connections_completed', (SELECT count(*) FROM c WHERE status = 'concluido'),
    'connections_mapped', (SELECT count(*) FROM c WHERE mapped_at IS NOT NULL),
    'outcomes', COALESCE((SELECT jsonb_object_agg(kind, total) FROM oc), '{}'::jsonb),
    'outcomes_total', COALESCE((SELECT sum(total) FROM oc), 0),
    'connections_with_outcome', (SELECT count(DISTINCT e.connection_id)
        FROM public.connection_events e
       WHERE e.event_id = _event_id AND e.action LIKE 'outcome:%'),
    'product_events', COALESCE((SELECT jsonb_object_agg(kind, total) FROM ae), '{}'::jsonb)
  ) INTO v_out;

  RETURN v_out;
END $function$;

REVOKE ALL ON FUNCTION public.staff_record_connection_outcome(uuid,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staff_remove_connection_outcome(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_experience_analytics(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public._connection_outcomes(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._outcome_kinds() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.staff_record_connection_outcome(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_remove_connection_outcome(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_experience_analytics(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public._connection_outcomes(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public._outcome_kinds() TO authenticated, service_role;