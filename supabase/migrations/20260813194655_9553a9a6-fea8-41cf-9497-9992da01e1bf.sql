-- IMPL 9/12 — Governança administrativa de participantes (read-only).
-- Duas RPCs admin-only, SECURITY DEFINER, isolamento por evento e sem PII privada.

CREATE OR REPLACE FUNCTION public.admin_list_participants(
  _event_id text,
  _search text DEFAULT NULL,
  _segment_ids text[] DEFAULT NULL,
  _city text DEFAULT NULL,
  _limit integer DEFAULT 25,
  _offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_limit int := LEAST(GREATEST(COALESCE(_limit, 25), 1), 100);
  v_offset int := GREATEST(COALESCE(_offset, 0), 0);
  v_search text := NULLIF(btrim(COALESCE(_search, '')), '');
  v_city text := NULLIF(btrim(COALESCE(_city, '')), '');
  v_pattern text;
  v_segs text[] := CASE
    WHEN _segment_ids IS NULL OR array_length(_segment_ids, 1) IS NULL THEN NULL
    ELSE _segment_ids END;
  v_total int;
  v_items jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_event_role(_event_id, v_uid, 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Busca segura: escapa curingas para o texto do usuário nunca virar padrão.
  IF v_search IS NOT NULL THEN
    v_pattern := '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  END IF;

  WITH base AS (
    SELECT p.id, p.name, p.company, p.city, p.segment_id, p.created_at, p.updated_at
      FROM public.profiles p
     WHERE p.event_id = _event_id
       AND (v_pattern IS NULL OR p.name ILIKE v_pattern OR p.company ILIKE v_pattern)
       AND (v_segs IS NULL OR p.segment_id = ANY (v_segs))
       AND (v_city IS NULL OR public.norm_label(p.city) = public.norm_label(v_city))
  ),
  -- Agregacoes em CTE unica por tabela: evita N+1 e evita produto cartesiano.
  off AS (
    SELECT o.profile_id, count(*)::int AS n
      FROM public.profile_offers o
      JOIN base b ON b.id = o.profile_id
     WHERE o.active
     GROUP BY o.profile_id
  ),
  nee AS (
    SELECT n.profile_id, count(*)::int AS n
      FROM public.profile_needs n
      JOIN base b ON b.id = n.profile_id
     WHERE n.active
     GROUP BY n.profile_id
  ),
  mt AS (
    SELECT b.id AS profile_id, count(m.id)::int AS n
      FROM base b
      JOIN public.matches m
        ON m.is_active AND (m.a_profile_id = b.id OR m.b_profile_id = b.id)
     GROUP BY b.id
  ),
  cn AS (
    SELECT b.id AS profile_id, count(c.id)::int AS n
      FROM base b
      JOIN public.connections c
        ON (c.a_profile_id = b.id OR c.b_profile_id = b.id)
     GROUP BY b.id
  ),
  counted AS (SELECT count(*)::int AS total FROM base),
  page AS (
    SELECT b.*, s.label AS segment_label, s.emoji AS segment_emoji,
           COALESCE(off.n, 0) AS offers_count,
           COALESCE(nee.n, 0) AS needs_count,
           COALESCE(mt.n, 0) AS matches_count,
           COALESCE(cn.n, 0) AS connections_count
      FROM base b
      LEFT JOIN public.segments s ON s.id = b.segment_id
      LEFT JOIN off ON off.profile_id = b.id
      LEFT JOIN nee ON nee.profile_id = b.id
      LEFT JOIN mt ON mt.profile_id = b.id
      LEFT JOIN cn ON cn.profile_id = b.id
     ORDER BY b.created_at DESC, b.id
     LIMIT v_limit OFFSET v_offset
  )
  SELECT (SELECT total FROM counted),
         COALESCE(jsonb_agg(jsonb_build_object(
           'id', pg.id,
           'name', pg.name,
           'company', pg.company,
           'city', pg.city,
           'segment_id', pg.segment_id,
           'segment_label', COALESCE(pg.segment_label, pg.segment_id),
           'segment_emoji', pg.segment_emoji,
           'created_at', pg.created_at,
           'updated_at', pg.updated_at,
           'offers_count', pg.offers_count,
           'needs_count', pg.needs_count,
           'matches_count', pg.matches_count,
           'connections_count', pg.connections_count
         ) ORDER BY pg.created_at DESC, pg.id), '[]'::jsonb)
    INTO v_total, v_items
    FROM page pg;

  RETURN jsonb_build_object(
    'items', COALESCE(v_items, '[]'::jsonb),
    'total', COALESCE(v_total, 0),
    'limit', v_limit,
    'offset', v_offset
  );
END;
$function$;

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

  -- Isolamento por evento: admin so acessa participante do proprio evento.
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
        'other_profile_id', CASE WHEN m.a_profile_id = v_p.id THEN m.b_profile_id ELSE m.a_profile_id END,
        'other_name', op.name,
        'other_company', op.company,
        'other_segment_id', op.segment_id,
        'kind', m.kind,
        'label', m.label,
        'score_for_participant', CASE WHEN m.a_profile_id = v_p.id THEN m.score_for_a ELSE m.score_for_b END,
        'score_for_other', CASE WHEN m.a_profile_id = v_p.id THEN m.score_for_b ELSE m.score_for_a END,
        'decision_participant', CASE WHEN m.a_profile_id = v_p.id THEN m.decision_a ELSE m.decision_b END,
        'decision_other', CASE WHEN m.a_profile_id = v_p.id THEN m.decision_b ELSE m.decision_a END,
        'algorithm_version', m.algorithm_version,
        'generated_at', m.generated_at,
        'updated_at', m.updated_at
      ) ORDER BY GREATEST(m.score_for_a, m.score_for_b) DESC, m.generated_at DESC)
      FROM public.matches m
      JOIN public.profiles op
        ON op.id = CASE WHEN m.a_profile_id = v_p.id THEN m.b_profile_id ELSE m.a_profile_id END
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

REVOKE ALL ON FUNCTION public.admin_list_participants(text, text, text[], text, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_get_participant_detail(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_participants(text, text, text[], text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_participant_detail(uuid) TO authenticated;