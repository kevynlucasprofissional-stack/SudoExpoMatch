CREATE OR REPLACE FUNCTION public.admin_get_participant_detail(_profile_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_p record;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT p.id, p.event_id, p.name, p.company, p.city, p.neighborhood,
         p.segment_id, p.summary, p.is_demo, p.created_at, p.updated_at
    INTO v_p
    FROM public.profiles p
   WHERE p.id = _profile_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.has_event_role(v_p.event_id, v_uid, 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'profile', jsonb_build_object(
      'id', v_p.id,
      'event_id', v_p.event_id,
      'name', v_p.name,
      'company', v_p.company,
      'city', v_p.city,
      'neighborhood', v_p.neighborhood,
      'segment_id', v_p.segment_id,
      'segment_label', COALESCE((SELECT s.label FROM public.segments s WHERE s.id = v_p.segment_id), v_p.segment_id),
      'summary', v_p.summary,
      'is_demo', v_p.is_demo,
      'created_at', v_p.created_at,
      'updated_at', v_p.updated_at
    ),
    'offers', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', o.id, 'label', o.label, 'detail', o.detail,
        'segment_id', o.segment_id, 'taxonomy_item_id', o.taxonomy_item_id,
        'source', o.source, 'user_confirmed', o.user_confirmed,
        'active', o.active, 'sort_order', o.sort_order
      ) ORDER BY o.sort_order, o.created_at)
      FROM public.profile_offers o WHERE o.profile_id = v_p.id AND o.active
    ), '[]'::jsonb),
    'needs', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', n.id, 'label', n.label, 'detail', n.detail,
        'segment_id', n.segment_id, 'taxonomy_item_id', n.taxonomy_item_id,
        'need_kind', n.need_kind, 'is_priority', n.is_priority,
        'source', n.source, 'user_confirmed', n.user_confirmed,
        'active', n.active, 'sort_order', n.sort_order
      ) ORDER BY n.is_priority DESC, n.sort_order, n.created_at)
      FROM public.profile_needs n WHERE n.profile_id = v_p.id AND n.active
    ), '[]'::jsonb),
    'matches', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', m.id,
        'other_profile_id', x.other_id,
        'other_name', op.name,
        'other_company', op.company,
        'other_segment_id', op.segment_id,
        'kind', m.kind,
        'label', m.label,
        'score_for_participant', x.score_for_participant,
        'score_for_other', x.score_for_other,
        'label_for_participant', public.match_label_for_score(x.score_for_participant),
        'label_for_other', public.match_label_for_score(x.score_for_other),
        'decision_participant', COALESCE((
          SELECT d.decision::text FROM public.match_decisions d
           WHERE d.match_id = m.id AND d.profile_id = v_p.id
           ORDER BY d.decided_at DESC LIMIT 1
        ), 'sem_decisao'),
        'decision_other', COALESCE((
          SELECT d.decision::text FROM public.match_decisions d
           WHERE d.match_id = m.id AND d.profile_id = x.other_id
           ORDER BY d.decided_at DESC LIMIT 1
        ), 'sem_decisao'),
        'algorithm_version', m.algorithm_version,
        'generated_at', m.generated_at,
        'updated_at', m.updated_at
      ) ORDER BY x.score_for_participant DESC, m.generated_at DESC)
      FROM public.matches m
      CROSS JOIN LATERAL (
        SELECT
          CASE WHEN m.a_profile_id = v_p.id THEN m.b_profile_id ELSE m.a_profile_id END AS other_id,
          CASE WHEN m.a_profile_id = v_p.id THEN m.score_for_a ELSE m.score_for_b END AS score_for_participant,
          CASE WHEN m.a_profile_id = v_p.id THEN m.score_for_b ELSE m.score_for_a END AS score_for_other
      ) x
      JOIN public.profiles op ON op.id = x.other_id
     WHERE m.is_active AND (m.a_profile_id = v_p.id OR m.b_profile_id = v_p.id)
    ), '[]'::jsonb),
    'connections', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', c.id,
        'match_id', c.match_id,
        'status', c.status,
        'other_profile_id', CASE WHEN c.a_profile_id = v_p.id THEN c.b_profile_id ELSE c.a_profile_id END,
        'other_name', op.name,
        'other_company', op.company,
        'assigned_to', c.assigned_to,
        'created_at', c.created_at,
        'updated_at', c.updated_at,
        'completed_at', c.completed_at,
        'cancelled_at', c.cancelled_at
      ) ORDER BY c.created_at DESC)
      FROM public.connections c
      JOIN public.profiles op
        ON op.id = CASE WHEN c.a_profile_id = v_p.id THEN c.b_profile_id ELSE c.a_profile_id END
     WHERE c.a_profile_id = v_p.id OR c.b_profile_id = v_p.id
    ), '[]'::jsonb),
    'history', COALESCE((
      SELECT jsonb_agg(h ORDER BY (h->>'created_at') DESC)
      FROM (
        SELECT jsonb_build_object(
          'kind', 'connection',
          'action', ce.action,
          'previous_status', ce.previous_status,
          'new_status', ce.new_status,
          'created_at', ce.created_at
        ) AS h
          FROM public.connection_events ce
          JOIN public.connections c ON c.id = ce.connection_id
         WHERE c.a_profile_id = v_p.id OR c.b_profile_id = v_p.id
        UNION ALL
        SELECT jsonb_build_object(
          'kind', 'match',
          'action', msh.event_type,
          'previous_status', NULL,
          'new_status', NULL,
          'created_at', msh.created_at
        )
          FROM public.match_status_history msh
          JOIN public.matches m ON m.id = msh.match_id
         WHERE m.a_profile_id = v_p.id OR m.b_profile_id = v_p.id
        ORDER BY 1 DESC
        LIMIT 100
      ) hist
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_get_participant_detail(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_participant_detail(uuid) TO authenticated;