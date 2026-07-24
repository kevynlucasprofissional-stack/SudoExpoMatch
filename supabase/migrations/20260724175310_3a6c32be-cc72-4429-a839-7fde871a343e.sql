-- ===== Onda D: Central operacional de conexões =====

-- 1) Colunas incrementais em connections
ALTER TABLE public.connections
  ADD COLUMN IF NOT EXISTS assigned_at            timestamptz,
  ADD COLUMN IF NOT EXISTS assumed_at             timestamptz,
  ADD COLUMN IF NOT EXISTS presented_at           timestamptz,
  ADD COLUMN IF NOT EXISTS contact_exchanged_at   timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at           timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at           timestamptz,
  ADD COLUMN IF NOT EXISTS assignee_lock_version  int NOT NULL DEFAULT 0;

-- Backfill dos timestamps a partir do histórico existente
UPDATE public.connections c SET assumed_at = c.updated_at
  WHERE c.assumed_at IS NULL AND c.assigned_to IS NOT NULL;
UPDATE public.connections c SET assigned_at = c.assumed_at
  WHERE c.assigned_at IS NULL AND c.assigned_to IS NOT NULL;

WITH last_hist AS (
  SELECT connection_id, to_status, max(created_at) AS at
    FROM public.connection_status_history
   GROUP BY connection_id, to_status
)
UPDATE public.connections c
   SET presented_at = COALESCE(c.presented_at,
        (SELECT at FROM last_hist h WHERE h.connection_id = c.id AND h.to_status = 'apresentados')),
       contact_exchanged_at = COALESCE(c.contact_exchanged_at,
        (SELECT at FROM last_hist h WHERE h.connection_id = c.id AND h.to_status = 'contato_trocado')),
       completed_at = COALESCE(c.completed_at,
        (SELECT at FROM last_hist h WHERE h.connection_id = c.id AND h.to_status = 'concluido')),
       cancelled_at = COALESCE(c.cancelled_at,
        (SELECT at FROM last_hist h WHERE h.connection_id = c.id AND h.to_status = 'cancelado'));

CREATE INDEX IF NOT EXISTS idx_connections_event_status
  ON public.connections(event_id, status);
CREATE INDEX IF NOT EXISTS idx_connections_event_assignee
  ON public.connections(event_id, assigned_to);
CREATE INDEX IF NOT EXISTS idx_connections_event_updated
  ON public.connections(event_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_connections_event_created
  ON public.connections(event_id, created_at DESC);

-- 2) connection_events (auditoria normalizada)
CREATE TABLE IF NOT EXISTS public.connection_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        text NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  connection_id   uuid NOT NULL REFERENCES public.connections(id) ON DELETE CASCADE,
  actor_user_id   uuid,
  action          text NOT NULL,
  previous_status public.connection_status,
  new_status      public.connection_status,
  assigned_from   uuid,
  assigned_to     uuid,
  note            text,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.connection_events TO authenticated;
GRANT ALL ON public.connection_events TO service_role;
ALTER TABLE public.connection_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read connection events"
  ON public.connection_events FOR SELECT TO authenticated
  USING (public.has_any_event_role(event_id, auth.uid()));
-- INSERTs sempre via RPC SECURITY DEFINER; sem policy de INSERT (bloqueia caminho direto).

CREATE INDEX IF NOT EXISTS idx_connection_events_conn_created
  ON public.connection_events(connection_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_connection_events_event
  ON public.connection_events(event_id, created_at DESC);

-- 3) connection_notes (observações internas)
CREATE TABLE IF NOT EXISTS public.connection_notes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        text NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  connection_id   uuid NOT NULL REFERENCES public.connections(id) ON DELETE CASCADE,
  author_user_id  uuid NOT NULL,
  body            text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 1000),
  created_at      timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.connection_notes TO authenticated;
GRANT ALL ON public.connection_notes TO service_role;
ALTER TABLE public.connection_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read connection notes"
  ON public.connection_notes FOR SELECT TO authenticated
  USING (public.has_any_event_role(event_id, auth.uid()));

CREATE INDEX IF NOT EXISTS idx_connection_notes_conn
  ON public.connection_notes(connection_id, created_at DESC);

-- 4) RPC: fila paginada
CREATE OR REPLACE FUNCTION public.staff_list_connections_v2(
  _event_id text,
  _statuses public.connection_status[] DEFAULT NULL,
  _segment_ids text[] DEFAULT NULL,
  _search text DEFAULT NULL,
  _scope text DEFAULT 'all',
  _sort text DEFAULT 'priority',
  _limit int DEFAULT 25,
  _offset int DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_search text := NULLIF(btrim(coalesce(_search,'')),'');
  v_limit int := LEAST(GREATEST(coalesce(_limit,25),1),100);
  v_offset int := GREATEST(coalesce(_offset,0),0);
  v_items jsonb;
  v_total int;
  v_counts jsonb;
  v_scope_counts jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;
  IF NOT public.has_any_event_role(_event_id, v_uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  WITH base AS (
    SELECT c.*,
           pa.name AS a_name, pa.company AS a_company, pa.city AS a_city, pa.segment_id AS a_segment,
           pb.name AS b_name, pb.company AS b_company, pb.city AS b_city, pb.segment_id AS b_segment,
           u.email AS assignee_email,
           EXTRACT(EPOCH FROM (now() - c.updated_at))::int AS seconds_in_stage,
           EXTRACT(EPOCH FROM (now() - c.created_at))::int AS seconds_waiting
      FROM public.connections c
      JOIN public.profiles pa ON pa.id = c.a_profile_id
      JOIN public.profiles pb ON pb.id = c.b_profile_id
      LEFT JOIN auth.users u ON u.id = c.assigned_to
     WHERE c.event_id = _event_id
  ), filtered AS (
    SELECT * FROM base
     WHERE (_statuses IS NULL OR status = ANY(_statuses))
       AND (_segment_ids IS NULL OR a_segment = ANY(_segment_ids) OR b_segment = ANY(_segment_ids))
       AND (v_search IS NULL
            OR a_name ILIKE '%'||v_search||'%'
            OR b_name ILIKE '%'||v_search||'%'
            OR a_company ILIKE '%'||v_search||'%'
            OR b_company ILIKE '%'||v_search||'%'
            OR a_city ILIKE '%'||v_search||'%'
            OR b_city ILIKE '%'||v_search||'%')
       AND (_scope = 'all'
            OR (_scope = 'mine' AND assigned_to = v_uid)
            OR (_scope = 'unassigned' AND assigned_to IS NULL AND status = 'aguardando')
            OR (_scope = 'pending' AND status NOT IN ('concluido','cancelado'))
            OR (_scope = 'closed' AND status IN ('concluido','cancelado')))
  ), ordered AS (
    SELECT *,
      CASE status
        WHEN 'aguardando' THEN 0
        WHEN 'em_atendimento' THEN 1
        WHEN 'apresentados' THEN 2
        WHEN 'contato_trocado' THEN 3
        WHEN 'concluido' THEN 4
        WHEN 'cancelado' THEN 5
      END AS status_order
    FROM filtered
  )
  SELECT
    COALESCE(jsonb_agg(to_jsonb(x) ORDER BY
      CASE WHEN _sort = 'waiting' THEN seconds_waiting END DESC NULLS LAST,
      CASE WHEN _sort = 'updated' THEN x.updated_at END DESC NULLS LAST,
      CASE WHEN _sort = 'created' THEN x.created_at END DESC NULLS LAST,
      CASE WHEN _sort NOT IN ('waiting','updated','created') THEN x.status_order END ASC NULLS LAST,
      x.updated_at DESC
    ), '[]'::jsonb),
    count(*)::int
    INTO v_items, v_total
  FROM (SELECT * FROM ordered LIMIT v_limit OFFSET v_offset) x
    RIGHT JOIN ordered ord ON ord.id = x.id
  ;

  -- Recount total honestly (right join above may double when x is null after limit; recompute)
  SELECT count(*)::int INTO v_total FROM (
    SELECT 1 FROM public.connections c
      JOIN public.profiles pa ON pa.id = c.a_profile_id
      JOIN public.profiles pb ON pb.id = c.b_profile_id
     WHERE c.event_id = _event_id
       AND (_statuses IS NULL OR c.status = ANY(_statuses))
       AND (_segment_ids IS NULL OR pa.segment_id = ANY(_segment_ids) OR pb.segment_id = ANY(_segment_ids))
       AND (v_search IS NULL
            OR pa.name ILIKE '%'||v_search||'%'
            OR pb.name ILIKE '%'||v_search||'%'
            OR pa.company ILIKE '%'||v_search||'%'
            OR pb.company ILIKE '%'||v_search||'%'
            OR pa.city ILIKE '%'||v_search||'%'
            OR pb.city ILIKE '%'||v_search||'%')
       AND (_scope = 'all'
            OR (_scope = 'mine' AND c.assigned_to = v_uid)
            OR (_scope = 'unassigned' AND c.assigned_to IS NULL AND c.status = 'aguardando')
            OR (_scope = 'pending' AND c.status NOT IN ('concluido','cancelado'))
            OR (_scope = 'closed' AND c.status IN ('concluido','cancelado')))
  ) s;

  -- Rebuild items with pure select to avoid the right-join quirk
  SELECT COALESCE(jsonb_agg(to_jsonb(ord) ORDER BY
    CASE WHEN _sort = 'waiting' THEN ord.seconds_waiting END DESC NULLS LAST,
    CASE WHEN _sort = 'updated' THEN ord.updated_at END DESC NULLS LAST,
    CASE WHEN _sort = 'created' THEN ord.created_at END DESC NULLS LAST,
    CASE WHEN _sort NOT IN ('waiting','updated','created') THEN ord.status_order END ASC NULLS LAST,
    ord.updated_at DESC
  ), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT c.*,
           pa.name AS a_name, pa.company AS a_company, pa.city AS a_city, pa.segment_id AS a_segment,
           pb.name AS b_name, pb.company AS b_company, pb.city AS b_city, pb.segment_id AS b_segment,
           u.email::text AS assignee_email,
           EXTRACT(EPOCH FROM (now() - c.updated_at))::int AS seconds_in_stage,
           EXTRACT(EPOCH FROM (now() - c.created_at))::int AS seconds_waiting,
           CASE c.status
             WHEN 'aguardando' THEN 0 WHEN 'em_atendimento' THEN 1
             WHEN 'apresentados' THEN 2 WHEN 'contato_trocado' THEN 3
             WHEN 'concluido' THEN 4 WHEN 'cancelado' THEN 5
           END AS status_order
      FROM public.connections c
      JOIN public.profiles pa ON pa.id = c.a_profile_id
      JOIN public.profiles pb ON pb.id = c.b_profile_id
      LEFT JOIN auth.users u ON u.id = c.assigned_to
     WHERE c.event_id = _event_id
       AND (_statuses IS NULL OR c.status = ANY(_statuses))
       AND (_segment_ids IS NULL OR pa.segment_id = ANY(_segment_ids) OR pb.segment_id = ANY(_segment_ids))
       AND (v_search IS NULL
            OR pa.name ILIKE '%'||v_search||'%'
            OR pb.name ILIKE '%'||v_search||'%'
            OR pa.company ILIKE '%'||v_search||'%'
            OR pb.company ILIKE '%'||v_search||'%'
            OR pa.city ILIKE '%'||v_search||'%'
            OR pb.city ILIKE '%'||v_search||'%')
       AND (_scope = 'all'
            OR (_scope = 'mine' AND c.assigned_to = v_uid)
            OR (_scope = 'unassigned' AND c.assigned_to IS NULL AND c.status = 'aguardando')
            OR (_scope = 'pending' AND c.status NOT IN ('concluido','cancelado'))
            OR (_scope = 'closed' AND c.status IN ('concluido','cancelado')))
     LIMIT v_limit OFFSET v_offset
  ) ord;

  -- Contadores por status (respeitando somente escopo, ignora status filter)
  SELECT jsonb_object_agg(status, cnt)
    INTO v_counts
    FROM (
      SELECT status::text AS status, count(*)::int AS cnt
        FROM public.connections
       WHERE event_id = _event_id
       GROUP BY status
    ) t;

  SELECT jsonb_build_object(
    'all',        count(*) FILTER (WHERE true),
    'mine',       count(*) FILTER (WHERE assigned_to = v_uid),
    'unassigned', count(*) FILTER (WHERE assigned_to IS NULL AND status = 'aguardando'),
    'pending',    count(*) FILTER (WHERE status NOT IN ('concluido','cancelado')),
    'closed',     count(*) FILTER (WHERE status IN ('concluido','cancelado'))
  ) INTO v_scope_counts
  FROM public.connections WHERE event_id = _event_id;

  RETURN jsonb_build_object(
    'items', v_items,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'counts_by_status', COALESCE(v_counts, '{}'::jsonb),
    'counts_by_scope',  COALESCE(v_scope_counts, '{}'::jsonb)
  );
END $$;

-- 5) staff_assume_connection (atômica)
CREATE OR REPLACE FUNCTION public.staff_assume_connection(_connection_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_event text;
  v_updated public.connections;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;

  SELECT event_id INTO v_event FROM public.connections WHERE id = _connection_id;
  IF v_event IS NULL THEN RAISE EXCEPTION 'connection_not_found' USING ERRCODE='P0001'; END IF;
  IF NOT public.has_any_event_role(v_event, v_uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  UPDATE public.connections
     SET assigned_to = v_uid,
         assigned_at = now(),
         assumed_at = COALESCE(assumed_at, now()),
         status = 'em_atendimento',
         assignee_lock_version = assignee_lock_version + 1,
         updated_at = now()
   WHERE id = _connection_id
     AND assigned_to IS NULL
     AND status = 'aguardando'
   RETURNING * INTO v_updated;

  IF v_updated.id IS NULL THEN
    RAISE EXCEPTION 'already_assigned' USING ERRCODE='P0001';
  END IF;

  INSERT INTO public.connection_events(event_id, connection_id, actor_user_id, action,
    previous_status, new_status, assigned_from, assigned_to)
  VALUES (v_event, _connection_id, v_uid, 'assumed', 'aguardando', 'em_atendimento', NULL, v_uid);

  INSERT INTO public.connection_status_history(connection_id, from_status, to_status, actor_user_id)
  VALUES (_connection_id, 'aguardando', 'em_atendimento', v_uid);

  RETURN jsonb_build_object('id', v_updated.id, 'status', v_updated.status, 'assigned_to', v_uid);
END $$;

-- 6) staff_release_connection
CREATE OR REPLACE FUNCTION public.staff_release_connection(_connection_id uuid, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_c public.connections;
  v_is_admin boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_c FROM public.connections WHERE id = _connection_id FOR UPDATE;
  IF v_c.id IS NULL THEN RAISE EXCEPTION 'connection_not_found' USING ERRCODE='P0001'; END IF;
  v_is_admin := public.has_event_role(v_c.event_id, v_uid, 'admin');
  IF NOT (v_is_admin OR v_c.assigned_to = v_uid) THEN
    RAISE EXCEPTION 'not_assignee' USING ERRCODE='42501';
  END IF;
  IF v_c.status IN ('concluido','cancelado') THEN
    RAISE EXCEPTION 'invalid_transition' USING ERRCODE='P0001';
  END IF;

  UPDATE public.connections
     SET assigned_to = NULL,
         assigned_at = NULL,
         status = 'aguardando',
         assignee_lock_version = assignee_lock_version + 1,
         updated_at = now()
   WHERE id = _connection_id;

  INSERT INTO public.connection_events(event_id, connection_id, actor_user_id, action,
    previous_status, new_status, assigned_from, assigned_to, note)
  VALUES (v_c.event_id, _connection_id, v_uid, 'released', v_c.status, 'aguardando',
          v_c.assigned_to, NULL, NULLIF(btrim(coalesce(_note,'')),''));
END $$;

-- 7) admin_reassign_connection
CREATE OR REPLACE FUNCTION public.admin_reassign_connection(_connection_id uuid, _new_user_id uuid, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_c public.connections;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_c FROM public.connections WHERE id = _connection_id FOR UPDATE;
  IF v_c.id IS NULL THEN RAISE EXCEPTION 'connection_not_found' USING ERRCODE='P0001'; END IF;
  IF NOT public.has_event_role(v_c.event_id, v_uid, 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  IF NOT public.has_any_event_role(v_c.event_id, _new_user_id) THEN
    RAISE EXCEPTION 'invalid_assignee' USING ERRCODE='P0001';
  END IF;
  IF v_c.status IN ('concluido','cancelado') THEN
    RAISE EXCEPTION 'invalid_transition' USING ERRCODE='P0001';
  END IF;

  UPDATE public.connections
     SET assigned_to = _new_user_id,
         assigned_at = now(),
         status = CASE WHEN v_c.status = 'aguardando' THEN 'em_atendimento'::public.connection_status ELSE v_c.status END,
         assignee_lock_version = assignee_lock_version + 1,
         updated_at = now()
   WHERE id = _connection_id;

  INSERT INTO public.connection_events(event_id, connection_id, actor_user_id, action,
    previous_status, new_status, assigned_from, assigned_to, note)
  VALUES (v_c.event_id, _connection_id, v_uid, 'reassigned', v_c.status,
          CASE WHEN v_c.status = 'aguardando' THEN 'em_atendimento'::public.connection_status ELSE v_c.status END,
          v_c.assigned_to, _new_user_id, NULLIF(btrim(coalesce(_note,'')),''));
END $$;

-- 8) staff_add_connection_note
CREATE OR REPLACE FUNCTION public.staff_add_connection_note(_connection_id uuid, _body text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_event text;
  v_body text := btrim(coalesce(_body,''));
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;
  IF length(v_body) < 1 OR length(v_body) > 1000 THEN
    RAISE EXCEPTION 'invalid_note' USING ERRCODE='22023';
  END IF;
  SELECT event_id INTO v_event FROM public.connections WHERE id = _connection_id;
  IF v_event IS NULL THEN RAISE EXCEPTION 'connection_not_found' USING ERRCODE='P0001'; END IF;
  IF NOT public.has_any_event_role(v_event, v_uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  INSERT INTO public.connection_notes(event_id, connection_id, author_user_id, body)
  VALUES (v_event, _connection_id, v_uid, v_body)
  RETURNING id INTO v_id;

  INSERT INTO public.connection_events(event_id, connection_id, actor_user_id, action, metadata)
  VALUES (v_event, _connection_id, v_uid, 'note_added', jsonb_build_object('note_id', v_id));

  RETURN v_id;
END $$;

-- 9) staff_list_connection_detail
CREATE OR REPLACE FUNCTION public.staff_list_connection_detail(_connection_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
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
    'notes_summary', v_c.notes,
    'a', (SELECT jsonb_build_object('id',p.id,'name',p.name,'company',p.company,'city',p.city,'segment_id',p.segment_id,'summary',p.summary)
            FROM public.profiles p WHERE p.id = v_c.a_profile_id),
    'b', (SELECT jsonb_build_object('id',p.id,'name',p.name,'company',p.company,'city',p.city,'segment_id',p.segment_id,'summary',p.summary)
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
END $$;

-- 10) staff_advance_connection: endurecer (assignee ou admin, timestamps, event log)
CREATE OR REPLACE FUNCTION public.staff_advance_connection(_connection_id uuid, _new_status public.connection_status, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_c public.connections;
  v_note_trim text;
  v_is_admin boolean;
  v_ok boolean := false;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;

  SELECT * INTO v_c FROM public.connections WHERE id = _connection_id FOR UPDATE;
  IF v_c.id IS NULL THEN RAISE EXCEPTION 'connection_not_found' USING ERRCODE='P0001'; END IF;

  IF NOT public.has_any_event_role(v_c.event_id, v_uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  v_is_admin := public.has_event_role(v_c.event_id, v_uid, 'admin');

  -- Staff só avança conexões atribuídas a si; admin pode qualquer.
  IF NOT v_is_admin AND v_c.assigned_to IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'not_assignee' USING ERRCODE='42501';
  END IF;

  IF v_c.status IN ('concluido','cancelado') THEN
    RAISE EXCEPTION 'invalid_transition:%->%', v_c.status, _new_status USING ERRCODE='P0001';
  END IF;

  IF _new_status = 'cancelado' THEN
    v_note_trim := btrim(coalesce(_note,''));
    IF length(v_note_trim) < 3 OR length(v_note_trim) > 500 THEN
      RAISE EXCEPTION 'note_required' USING ERRCODE='22023';
    END IF;
    v_ok := true;
  ELSE
    v_ok := (
      (v_c.status = 'aguardando'      AND _new_status = 'em_atendimento') OR
      (v_c.status = 'em_atendimento'  AND _new_status = 'apresentados') OR
      (v_c.status = 'apresentados'    AND _new_status = 'contato_trocado') OR
      (v_c.status = 'contato_trocado' AND _new_status = 'concluido')
    );
  END IF;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'invalid_transition:%->%', v_c.status, _new_status USING ERRCODE='P0001';
  END IF;

  UPDATE public.connections
     SET status = _new_status,
         notes = CASE WHEN _new_status = 'cancelado' THEN v_note_trim ELSE COALESCE(_note, notes) END,
         assigned_to = CASE WHEN _new_status = 'em_atendimento' AND assigned_to IS NULL THEN v_uid ELSE assigned_to END,
         assigned_at = CASE WHEN _new_status = 'em_atendimento' AND assigned_at IS NULL THEN now() ELSE assigned_at END,
         assumed_at = CASE WHEN _new_status = 'em_atendimento' AND assumed_at IS NULL THEN now() ELSE assumed_at END,
         presented_at = CASE WHEN _new_status = 'apresentados' THEN now() ELSE presented_at END,
         contact_exchanged_at = CASE WHEN _new_status = 'contato_trocado' THEN now() ELSE contact_exchanged_at END,
         completed_at = CASE WHEN _new_status = 'concluido' THEN now() ELSE completed_at END,
         cancelled_at = CASE WHEN _new_status = 'cancelado' THEN now() ELSE cancelled_at END,
         updated_at = now()
   WHERE id = _connection_id;

  INSERT INTO public.connection_status_history(connection_id, from_status, to_status, actor_user_id, note)
  VALUES (_connection_id, v_c.status, _new_status, v_uid,
          CASE WHEN _new_status = 'cancelado' THEN v_note_trim ELSE _note END);

  INSERT INTO public.connection_events(event_id, connection_id, actor_user_id, action,
    previous_status, new_status, note)
  VALUES (v_c.event_id, _connection_id, v_uid,
    CASE _new_status WHEN 'cancelado' THEN 'cancelled' WHEN 'concluido' THEN 'completed' ELSE 'advanced' END,
    v_c.status, _new_status,
    CASE WHEN _new_status = 'cancelado' THEN v_note_trim ELSE _note END);
END $$;

-- 11) staff_reveal_contact_for_match: endurecer política
CREATE OR REPLACE FUNCTION public.staff_reveal_contact_for_match(_match_id uuid, _override_reason text DEFAULT NULL)
RETURNS TABLE(profile_id uuid, name text, company text, phone_e164 text, email text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_event_id text; v_a_pid uuid; v_b_pid uuid;
  v_mutual int;
  v_conn public.connections;
  v_is_admin boolean;
  v_override text := NULLIF(btrim(coalesce(_override_reason,'')),'');
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;

  SELECT m.event_id, m.a_profile_id, m.b_profile_id
    INTO v_event_id, v_a_pid, v_b_pid
    FROM public.matches m WHERE m.id = _match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'match_not_found' USING ERRCODE='P0001'; END IF;

  IF NOT public.has_any_event_role(v_event_id, v_uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  v_is_admin := public.has_event_role(v_event_id, v_uid, 'admin');

  SELECT count(*)::int INTO v_mutual FROM public.match_decisions d
   WHERE d.match_id = _match_id AND d.decision = 'interesse'
     AND d.profile_id IN (v_a_pid, v_b_pid);
  IF v_mutual < 2 THEN RAISE EXCEPTION 'not_mutual' USING ERRCODE='P0001'; END IF;

  SELECT * INTO v_conn FROM public.connections WHERE match_id = _match_id;
  IF v_conn.id IS NULL THEN RAISE EXCEPTION 'no_connection' USING ERRCODE='P0001'; END IF;
  IF v_conn.status = 'cancelado' THEN RAISE EXCEPTION 'connection_cancelled' USING ERRCODE='P0001'; END IF;

  IF v_conn.status NOT IN ('apresentados','contato_trocado','concluido') THEN
    IF NOT v_is_admin THEN
      RAISE EXCEPTION 'reveal_not_allowed' USING ERRCODE='P0001';
    END IF;
    IF v_override IS NULL OR length(v_override) < 3 THEN
      RAISE EXCEPTION 'override_reason_required' USING ERRCODE='22023';
    END IF;
  END IF;

  INSERT INTO public.audit_logs(event_id, actor_user_id, target_table, target_id, action)
  VALUES (v_event_id, v_uid, 'private.profile_contacts', _match_id::text, 'staff_reveal_contact');

  INSERT INTO public.connection_events(event_id, connection_id, actor_user_id, action, metadata)
  VALUES (v_event_id, v_conn.id, v_uid, 'contact_revealed',
    jsonb_build_object('match_id', _match_id,
      'override', (v_conn.status NOT IN ('apresentados','contato_trocado','concluido')),
      'override_reason', v_override));

  RETURN QUERY
    SELECT p.id, p.name, p.company, pc.phone_e164, pc.email
      FROM public.matches m
      JOIN public.profiles p ON p.id IN (m.a_profile_id, m.b_profile_id)
      LEFT JOIN private.profile_contacts pc ON pc.profile_id = p.id
     WHERE m.id = _match_id;
END $$;

-- 12) event_operational_stats
CREATE OR REPLACE FUNCTION public.event_operational_stats(_event_id text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_out jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;
  IF NOT public.has_any_event_role(_event_id, v_uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  WITH c AS (SELECT * FROM public.connections WHERE event_id = _event_id),
  mutuals AS (
    SELECT m.id FROM public.matches m
     WHERE m.event_id = _event_id
       AND (SELECT count(*) FROM public.match_decisions d
             WHERE d.match_id = m.id AND d.decision='interesse'
               AND d.profile_id IN (m.a_profile_id, m.b_profile_id)) >= 2
  )
  SELECT jsonb_build_object(
    'active_profiles', (SELECT count(*) FROM public.profiles WHERE event_id = _event_id AND is_demo=false),
    'total_matches',   (SELECT count(*) FROM public.matches WHERE event_id = _event_id AND is_active),
    'mutual_matches',  (SELECT count(*) FROM mutuals),
    'by_status', COALESCE((SELECT jsonb_object_agg(status::text, cnt) FROM (
        SELECT status, count(*)::int AS cnt FROM c GROUP BY status) t), '{}'::jsonb),
    'unassigned', (SELECT count(*) FROM c WHERE assigned_to IS NULL AND status='aguardando'),
    'by_operator', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'user_id', o.assigned_to,
        'email', (SELECT email FROM auth.users u WHERE u.id = o.assigned_to),
        'total', o.total,
        'active', o.active,
        'completed', o.completed))
      FROM (
        SELECT assigned_to,
               count(*)::int AS total,
               count(*) FILTER (WHERE status NOT IN ('concluido','cancelado'))::int AS active,
               count(*) FILTER (WHERE status='concluido')::int AS completed
          FROM c WHERE assigned_to IS NOT NULL GROUP BY assigned_to) o), '[]'::jsonb),
    'avg_seconds_to_assume',   (SELECT COALESCE(EXTRACT(EPOCH FROM AVG(assumed_at - created_at)),0)::int FROM c WHERE assumed_at IS NOT NULL),
    'avg_seconds_to_present',  (SELECT COALESCE(EXTRACT(EPOCH FROM AVG(presented_at - assumed_at)),0)::int FROM c WHERE presented_at IS NOT NULL AND assumed_at IS NOT NULL),
    'avg_seconds_to_complete', (SELECT COALESCE(EXTRACT(EPOCH FROM AVG(completed_at - created_at)),0)::int FROM c WHERE completed_at IS NOT NULL),
    'rate_presented',        (SELECT CASE WHEN count(*)=0 THEN 0 ELSE round(100.0*count(*) FILTER (WHERE presented_at IS NOT NULL)/count(*),1) END FROM c),
    'rate_contact_exchanged',(SELECT CASE WHEN count(*)=0 THEN 0 ELSE round(100.0*count(*) FILTER (WHERE contact_exchanged_at IS NOT NULL)/count(*),1) END FROM c),
    'rate_completed',        (SELECT CASE WHEN count(*)=0 THEN 0 ELSE round(100.0*count(*) FILTER (WHERE status='concluido')/count(*),1) END FROM c),
    'cancellations',         (SELECT count(*) FROM c WHERE status='cancelado')
  ) INTO v_out;

  RETURN v_out;
END $$;

-- 13) admin_remove_event_staff: endurecer com reassign
CREATE OR REPLACE FUNCTION public.admin_remove_event_staff(
  _event_id text, _user_id uuid,
  _reassign_to uuid DEFAULT NULL,
  _confirm_self boolean DEFAULT false
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _admin_count int;
  _was_admin boolean;
  _active_count int;
BEGIN
  IF NOT public.has_event_role(_event_id, auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  IF _user_id = auth.uid() AND NOT _confirm_self THEN
    RAISE EXCEPTION 'self_removal_confirmation_required' USING ERRCODE='P0001';
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.event_staff
    WHERE event_id = _event_id AND user_id = _user_id AND role = 'admin') INTO _was_admin;

  IF _was_admin THEN
    SELECT count(*) INTO _admin_count FROM public.event_staff
      WHERE event_id = _event_id AND role = 'admin' AND user_id <> _user_id;
    IF _admin_count = 0 THEN RAISE EXCEPTION 'last_admin' USING ERRCODE='P0001'; END IF;
  END IF;

  SELECT count(*) INTO _active_count FROM public.connections
   WHERE event_id = _event_id AND assigned_to = _user_id
     AND status NOT IN ('concluido','cancelado');

  IF _active_count > 0 THEN
    IF _reassign_to IS NULL THEN
      RAISE EXCEPTION 'has_active_connections:%', _active_count USING ERRCODE='P0001';
    END IF;
    IF NOT public.has_any_event_role(_event_id, _reassign_to) THEN
      RAISE EXCEPTION 'invalid_reassignee' USING ERRCODE='P0001';
    END IF;

    UPDATE public.connections
       SET assigned_to = _reassign_to,
           assigned_at = now(),
           assignee_lock_version = assignee_lock_version + 1,
           updated_at = now()
     WHERE event_id = _event_id AND assigned_to = _user_id
       AND status NOT IN ('concluido','cancelado');

    INSERT INTO public.connection_events(event_id, connection_id, actor_user_id, action,
      previous_status, new_status, assigned_from, assigned_to, note)
    SELECT event_id, id, auth.uid(), 'reassigned', status, status, _user_id, _reassign_to, 'bulk_reassign_on_removal'
      FROM public.connections
     WHERE event_id = _event_id AND assigned_to = _reassign_to
       AND status NOT IN ('concluido','cancelado');
  END IF;

  DELETE FROM public.event_staff WHERE event_id = _event_id AND user_id = _user_id;

  INSERT INTO public.audit_logs (event_id, actor_user_id, target_table, target_id, action, after)
  VALUES (_event_id, auth.uid(), 'event_staff', _user_id::text, 'remove',
    jsonb_build_object('reassigned_to', _reassign_to, 'active_count', _active_count));
END $$;
