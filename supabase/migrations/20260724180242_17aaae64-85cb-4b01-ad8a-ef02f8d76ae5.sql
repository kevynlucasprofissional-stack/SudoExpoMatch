-- 1) Remove overload antigo (sem motivo) para deixar o tipo TS não-ambíguo
DROP FUNCTION IF EXISTS public.staff_reveal_contact_for_match(uuid);

-- 2) Reescreve a fila com ordenação estável ANTES da paginação
CREATE OR REPLACE FUNCTION public.staff_list_connections_v2(
  _event_id text,
  _statuses public.connection_status[] DEFAULT NULL,
  _segment_ids text[] DEFAULT NULL,
  _search text DEFAULT NULL,
  _scope text DEFAULT 'all',
  _sort text DEFAULT 'priority',
  _limit integer DEFAULT 25,
  _offset integer DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_search text := NULLIF(btrim(coalesce(_search,'')),'');
  v_limit int := LEAST(GREATEST(coalesce(_limit,25),1),100);
  v_offset int := GREATEST(coalesce(_offset,0),0);
  v_scope text := coalesce(_scope,'all');
  v_sort text := coalesce(_sort,'priority');
  v_items jsonb;
  v_total int;
  v_counts jsonb;
  v_scope_counts jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501';
  END IF;
  IF NOT public.has_any_event_role(_event_id, v_uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  IF v_scope NOT IN ('all','mine','unassigned','pending','closed') THEN
    RAISE EXCEPTION 'invalid_scope' USING ERRCODE='22023';
  END IF;
  IF v_sort NOT IN ('priority','waiting','updated','created') THEN
    RAISE EXCEPTION 'invalid_sort' USING ERRCODE='22023';
  END IF;

  WITH filtered AS (
    SELECT
      c.id, c.event_id, c.match_id, c.status,
      c.assigned_to, c.assigned_at, c.assumed_at, c.presented_at,
      c.contact_exchanged_at, c.completed_at, c.cancelled_at,
      c.notes, c.created_at, c.updated_at,
      pa.name AS a_name, pa.company AS a_company, pa.city AS a_city, pa.segment_id AS a_segment,
      pb.name AS b_name, pb.company AS b_company, pb.city AS b_city, pb.segment_id AS b_segment,
      (SELECT u.email::text FROM auth.users u WHERE u.id = c.assigned_to) AS assignee_email,
      GREATEST(EXTRACT(EPOCH FROM (now() - c.updated_at))::int, 0) AS seconds_in_stage,
      GREATEST(EXTRACT(EPOCH FROM (now() - c.created_at))::int, 0) AS seconds_waiting,
      CASE c.status
        WHEN 'aguardando' THEN 0
        WHEN 'em_atendimento' THEN 1
        WHEN 'apresentados' THEN 2
        WHEN 'contato_trocado' THEN 3
        WHEN 'concluido' THEN 4
        WHEN 'cancelado' THEN 5
      END AS status_order
    FROM public.connections c
    JOIN public.profiles pa ON pa.id = c.a_profile_id
    JOIN public.profiles pb ON pb.id = c.b_profile_id
    WHERE c.event_id = _event_id
      AND (_statuses IS NULL OR c.status = ANY(_statuses))
      AND (_segment_ids IS NULL
        OR pa.segment_id = ANY(_segment_ids)
        OR pb.segment_id = ANY(_segment_ids))
      AND (v_search IS NULL
        OR pa.name    ILIKE '%'||v_search||'%'
        OR pb.name    ILIKE '%'||v_search||'%'
        OR pa.company ILIKE '%'||v_search||'%'
        OR pb.company ILIKE '%'||v_search||'%'
        OR pa.city    ILIKE '%'||v_search||'%'
        OR pb.city    ILIKE '%'||v_search||'%')
      AND (v_scope = 'all'
        OR (v_scope = 'mine'       AND c.assigned_to = v_uid)
        OR (v_scope = 'unassigned' AND c.assigned_to IS NULL AND c.status='aguardando')
        OR (v_scope = 'pending'    AND c.status NOT IN ('concluido','cancelado'))
        OR (v_scope = 'closed'     AND c.status IN ('concluido','cancelado')))
  ),
  ordered AS (
    SELECT f.*,
      ROW_NUMBER() OVER (ORDER BY
        CASE WHEN v_sort = 'priority' THEN f.status_order END ASC  NULLS LAST,
        CASE WHEN v_sort = 'waiting'  THEN f.seconds_waiting END DESC NULLS LAST,
        CASE WHEN v_sort = 'updated'  THEN f.updated_at END DESC NULLS LAST,
        CASE WHEN v_sort = 'created'  THEN f.created_at END DESC NULLS LAST,
        f.updated_at DESC,
        f.created_at DESC,
        f.id ASC
      ) AS rn
    FROM filtered f
  ),
  page AS (
    SELECT *
      FROM ordered
     WHERE rn > v_offset AND rn <= v_offset + v_limit
  )
  SELECT
    COALESCE(jsonb_agg((to_jsonb(p) - 'rn' - 'status_order') ORDER BY p.rn), '[]'::jsonb),
    (SELECT count(*)::int FROM filtered)
    INTO v_items, v_total
  FROM page p;

  -- counts_by_status: total do EVENTO por status (ignora filtros; alimenta badges globais)
  SELECT COALESCE(jsonb_object_agg(status::text, cnt), '{}'::jsonb)
    INTO v_counts
    FROM (
      SELECT status, count(*)::int cnt
        FROM public.connections
       WHERE event_id = _event_id
       GROUP BY status
    ) t;

  -- counts_by_scope: total do EVENTO por escopo lógico (ignora filtros; alimenta abas)
  SELECT jsonb_build_object(
    'all',        count(*),
    'mine',       count(*) FILTER (WHERE assigned_to = v_uid),
    'unassigned', count(*) FILTER (WHERE assigned_to IS NULL AND status='aguardando'),
    'pending',    count(*) FILTER (WHERE status NOT IN ('concluido','cancelado')),
    'closed',     count(*) FILTER (WHERE status IN ('concluido','cancelado'))
  ) INTO v_scope_counts
  FROM public.connections
  WHERE event_id = _event_id;

  RETURN jsonb_build_object(
    'items', COALESCE(v_items,'[]'::jsonb),
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'counts_by_status', COALESCE(v_counts,'{}'::jsonb),
    'counts_by_scope',  COALESCE(v_scope_counts,'{}'::jsonb)
  );
END
$fn$;

GRANT EXECUTE ON FUNCTION public.staff_list_connections_v2(text, public.connection_status[], text[], text, text, text, integer, integer) TO authenticated;