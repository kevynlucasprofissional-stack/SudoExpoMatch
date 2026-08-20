-- ============================================================
-- MAPA FÍSICO SUDOEXPO — extensão mínima do modelo operacional
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pin_code       text,
  ADD COLUMN IF NOT EXISTS pin_placed_at  timestamptz,
  ADD COLUMN IF NOT EXISTS pin_placed_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_pin_code_len;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_pin_code_len
  CHECK (pin_code IS NULL OR char_length(pin_code) BETWEEN 1 AND 24);

CREATE UNIQUE INDEX IF NOT EXISTS profiles_pin_code_unique_per_event
  ON public.profiles (event_id, lower(pin_code))
  WHERE pin_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS profiles_pin_missing_idx
  ON public.profiles (event_id)
  WHERE pin_placed_at IS NULL;

ALTER TABLE public.connections
  ADD COLUMN IF NOT EXISTS mapped_at timestamptz,
  ADD COLUMN IF NOT EXISTS mapped_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS connections_map_pending_idx
  ON public.connections (event_id)
  WHERE mapped_at IS NULL;

-- ------------------------------------------------------------
-- Pin do participante
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.staff_set_participant_pin(
  _profile_id uuid,
  _pin_code text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_p public.profiles;
  v_pin text := NULLIF(btrim(coalesce(_pin_code,'')),'');
  v_prev_pin text;
  v_was_placed boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;

  SELECT * INTO v_p FROM public.profiles WHERE id = _profile_id FOR UPDATE;
  IF v_p.id IS NULL THEN RAISE EXCEPTION 'profile_not_found' USING ERRCODE='P0001'; END IF;
  IF NOT public.has_any_event_role(v_p.event_id, v_uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  IF v_pin IS NOT NULL AND char_length(v_pin) > 24 THEN
    RAISE EXCEPTION 'pin_code_too_long' USING ERRCODE='22023';
  END IF;

  v_prev_pin := v_p.pin_code;
  v_was_placed := v_p.pin_placed_at IS NOT NULL;

  -- Idempotência: mesmo pin já registrado => não repete auditoria.
  IF v_was_placed AND v_prev_pin IS NOT DISTINCT FROM v_pin THEN
    RETURN jsonb_build_object(
      'profile_id', v_p.id, 'pin_code', v_p.pin_code,
      'pin_placed_at', v_p.pin_placed_at, 'changed', false);
  END IF;

  IF v_pin IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.event_id = v_p.event_id AND p.id <> v_p.id
       AND lower(p.pin_code) = lower(v_pin)
  ) THEN
    RAISE EXCEPTION 'pin_code_taken' USING ERRCODE='23505';
  END IF;

  UPDATE public.profiles
     SET pin_code = v_pin,
         pin_placed_at = COALESCE(pin_placed_at, now()),
         pin_placed_by = COALESCE(pin_placed_by, v_uid),
         updated_at = now()
   WHERE id = _profile_id
   RETURNING * INTO v_p;

  INSERT INTO public.audit_logs(event_id, actor_user_id, target_table, target_id, action, before, after)
  VALUES (v_p.event_id, v_uid, 'profiles', v_p.id::text,
          CASE WHEN v_was_placed THEN 'pin_updated' ELSE 'pin_placed' END,
          jsonb_build_object('pin_code', v_prev_pin, 'pin_placed', v_was_placed),
          jsonb_build_object('pin_code', v_p.pin_code, 'pin_placed', true));

  RETURN jsonb_build_object(
    'profile_id', v_p.id, 'pin_code', v_p.pin_code,
    'pin_placed_at', v_p.pin_placed_at, 'changed', true);
END $function$;

CREATE OR REPLACE FUNCTION public.staff_clear_participant_pin(
  _profile_id uuid,
  _note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_p public.profiles;
  v_prev_pin text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;

  SELECT * INTO v_p FROM public.profiles WHERE id = _profile_id FOR UPDATE;
  IF v_p.id IS NULL THEN RAISE EXCEPTION 'profile_not_found' USING ERRCODE='P0001'; END IF;
  IF NOT public.has_any_event_role(v_p.event_id, v_uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  IF v_p.pin_placed_at IS NULL AND v_p.pin_code IS NULL THEN
    RETURN jsonb_build_object('profile_id', v_p.id, 'changed', false);
  END IF;

  v_prev_pin := v_p.pin_code;

  UPDATE public.profiles
     SET pin_code = NULL, pin_placed_at = NULL, pin_placed_by = NULL, updated_at = now()
   WHERE id = _profile_id;

  INSERT INTO public.audit_logs(event_id, actor_user_id, target_table, target_id, action, before, after)
  VALUES (v_p.event_id, v_uid, 'profiles', v_p.id::text, 'pin_cleared',
          jsonb_build_object('pin_code', v_prev_pin, 'pin_placed', true),
          jsonb_build_object('pin_code', NULL, 'pin_placed', false,
                             'note', NULLIF(btrim(coalesce(_note,'')),'')));

  RETURN jsonb_build_object('profile_id', v_p.id, 'changed', true);
END $function$;

-- ------------------------------------------------------------
-- Registro físico da conexão (pins ligados no painel)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.staff_mark_connection_mapped(
  _connection_id uuid,
  _note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_c public.connections;
  v_note text := NULLIF(btrim(coalesce(_note,'')),'');
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;

  SELECT * INTO v_c FROM public.connections WHERE id = _connection_id FOR UPDATE;
  IF v_c.id IS NULL THEN RAISE EXCEPTION 'connection_not_found' USING ERRCODE='P0001'; END IF;
  IF NOT public.has_any_event_role(v_c.event_id, v_uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  IF v_note IS NOT NULL AND char_length(v_note) > 500 THEN
    RAISE EXCEPTION 'note_too_long' USING ERRCODE='22023';
  END IF;
  IF v_c.status = 'cancelado' THEN
    RAISE EXCEPTION 'connection_cancelled' USING ERRCODE='P0001';
  END IF;
  IF v_c.status NOT IN ('apresentados','contato_trocado','concluido') THEN
    RAISE EXCEPTION 'map_requires_presented' USING ERRCODE='P0001';
  END IF;

  IF v_c.mapped_at IS NOT NULL THEN
    RETURN jsonb_build_object('connection_id', v_c.id, 'mapped_at', v_c.mapped_at, 'changed', false);
  END IF;

  UPDATE public.connections
     SET mapped_at = now(), mapped_by = v_uid, updated_at = now()
   WHERE id = _connection_id
   RETURNING * INTO v_c;

  INSERT INTO public.connection_events(event_id, connection_id, actor_user_id, action,
    previous_status, new_status, note, metadata)
  VALUES (v_c.event_id, v_c.id, v_uid, 'map_linked', v_c.status, v_c.status, v_note,
          jsonb_build_object('mapped_at', v_c.mapped_at));

  INSERT INTO public.audit_logs(event_id, actor_user_id, target_table, target_id, action, before, after)
  VALUES (v_c.event_id, v_uid, 'connections', v_c.id::text, 'map_linked',
          jsonb_build_object('mapped', false),
          jsonb_build_object('mapped', true, 'mapped_at', v_c.mapped_at, 'note', v_note));

  RETURN jsonb_build_object('connection_id', v_c.id, 'mapped_at', v_c.mapped_at, 'changed', true);
END $function$;

CREATE OR REPLACE FUNCTION public.staff_unmark_connection_mapped(
  _connection_id uuid,
  _note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_c public.connections;
  v_note text := NULLIF(btrim(coalesce(_note,'')),'');
  v_prev timestamptz;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;

  SELECT * INTO v_c FROM public.connections WHERE id = _connection_id FOR UPDATE;
  IF v_c.id IS NULL THEN RAISE EXCEPTION 'connection_not_found' USING ERRCODE='P0001'; END IF;
  IF NOT public.has_any_event_role(v_c.event_id, v_uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  IF NOT public.has_event_role(v_c.event_id, v_uid, 'admin')
     AND v_c.assigned_to IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'not_assignee' USING ERRCODE='42501';
  END IF;
  IF v_note IS NOT NULL AND char_length(v_note) > 500 THEN
    RAISE EXCEPTION 'note_too_long' USING ERRCODE='22023';
  END IF;

  IF v_c.mapped_at IS NULL THEN
    RETURN jsonb_build_object('connection_id', v_c.id, 'changed', false);
  END IF;

  v_prev := v_c.mapped_at;

  UPDATE public.connections
     SET mapped_at = NULL, mapped_by = NULL, updated_at = now()
   WHERE id = _connection_id;

  INSERT INTO public.connection_events(event_id, connection_id, actor_user_id, action,
    previous_status, new_status, note, metadata)
  VALUES (v_c.event_id, v_c.id, v_uid, 'map_unlinked', v_c.status, v_c.status, v_note,
          jsonb_build_object('previous_mapped_at', v_prev));

  INSERT INTO public.audit_logs(event_id, actor_user_id, target_table, target_id, action, before, after)
  VALUES (v_c.event_id, v_uid, 'connections', v_c.id::text, 'map_unlinked',
          jsonb_build_object('mapped', true, 'mapped_at', v_prev),
          jsonb_build_object('mapped', false, 'note', v_note));

  RETURN jsonb_build_object('connection_id', v_c.id, 'changed', true);
END $function$;

-- ------------------------------------------------------------
-- Lista de pins (sem PII de contato)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.staff_list_pins(
  _event_id text,
  _search text DEFAULT NULL,
  _only_missing boolean DEFAULT false,
  _limit integer DEFAULT 25,
  _offset integer DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_search text := NULLIF(btrim(coalesce(_search,'')),'');
  v_limit int := LEAST(GREATEST(coalesce(_limit,25),1),100);
  v_offset int := GREATEST(coalesce(_offset,0),0);
  v_items jsonb; v_total int; v_missing int; v_placed int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;
  IF NOT public.has_any_event_role(_event_id, v_uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  WITH filtered AS (
    SELECT p.id, p.name, p.company, p.city, p.segment_id,
           p.pin_code, p.pin_placed_at, p.created_at,
           (SELECT u.email::text FROM auth.users u WHERE u.id = p.pin_placed_by) AS pin_placed_by_email
      FROM public.profiles p
     WHERE p.event_id = _event_id
       AND (NOT coalesce(_only_missing,false) OR p.pin_placed_at IS NULL)
       AND (v_search IS NULL
            OR p.name ILIKE '%'||v_search||'%'
            OR p.company ILIKE '%'||v_search||'%'
            OR p.pin_code ILIKE '%'||v_search||'%')
  ), ordered AS (
    SELECT f.*, ROW_NUMBER() OVER (
      ORDER BY (f.pin_placed_at IS NOT NULL) ASC, f.created_at ASC, f.id ASC) AS rn
      FROM filtered f
  )
  SELECT COALESCE(jsonb_agg((to_jsonb(o) - 'rn') ORDER BY o.rn), '[]'::jsonb),
         (SELECT count(*)::int FROM filtered)
    INTO v_items, v_total
    FROM ordered o
   WHERE o.rn > v_offset AND o.rn <= v_offset + v_limit;

  SELECT count(*) FILTER (WHERE pin_placed_at IS NULL)::int,
         count(*) FILTER (WHERE pin_placed_at IS NOT NULL)::int
    INTO v_missing, v_placed
    FROM public.profiles WHERE event_id = _event_id;

  RETURN jsonb_build_object(
    'items', COALESCE(v_items,'[]'::jsonb),
    'total', v_total, 'limit', v_limit, 'offset', v_offset,
    'pins_missing', COALESCE(v_missing,0), 'pins_placed', COALESCE(v_placed,0));
END $function$;

-- ------------------------------------------------------------
-- Fila operacional: expõe estado do mapa + escopos novos
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.staff_list_connections_v2(
  _event_id text,
  _statuses connection_status[] DEFAULT NULL::connection_status[],
  _segment_ids text[] DEFAULT NULL::text[],
  _search text DEFAULT NULL::text,
  _scope text DEFAULT 'all'::text,
  _sort text DEFAULT 'priority'::text,
  _limit integer DEFAULT 25,
  _offset integer DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
  IF v_scope NOT IN ('all','mine','unassigned','pending','closed','map_pending','mapped') THEN
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
      c.mapped_at, c.mapped_by,
      (SELECT u.email::text FROM auth.users u WHERE u.id = c.mapped_by) AS mapped_by_email,
      pa.name AS a_name, pa.company AS a_company, pa.city AS a_city, pa.segment_id AS a_segment,
      pa.pin_code AS a_pin_code, pa.pin_placed_at AS a_pin_placed_at,
      pb.name AS b_name, pb.company AS b_company, pb.city AS b_city, pb.segment_id AS b_segment,
      pb.pin_code AS b_pin_code, pb.pin_placed_at AS b_pin_placed_at,
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
        OR pb.city    ILIKE '%'||v_search||'%'
        OR pa.pin_code ILIKE '%'||v_search||'%'
        OR pb.pin_code ILIKE '%'||v_search||'%')
      AND (v_scope = 'all'
        OR (v_scope = 'mine'        AND c.assigned_to = v_uid)
        OR (v_scope = 'unassigned'  AND c.assigned_to IS NULL AND c.status='aguardando')
        OR (v_scope = 'pending'     AND c.status NOT IN ('concluido','cancelado'))
        OR (v_scope = 'closed'      AND c.status IN ('concluido','cancelado'))
        OR (v_scope = 'map_pending' AND c.mapped_at IS NULL
              AND c.status IN ('apresentados','contato_trocado','concluido'))
        OR (v_scope = 'mapped'      AND c.mapped_at IS NOT NULL))
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
    SELECT * FROM ordered WHERE rn > v_offset AND rn <= v_offset + v_limit
  )
  SELECT
    COALESCE(jsonb_agg((to_jsonb(p) - 'rn' - 'status_order') ORDER BY p.rn), '[]'::jsonb),
    (SELECT count(*)::int FROM filtered)
    INTO v_items, v_total
  FROM page p;

  SELECT COALESCE(jsonb_object_agg(status::text, cnt), '{}'::jsonb)
    INTO v_counts
    FROM (
      SELECT status, count(*)::int cnt
        FROM public.connections
       WHERE event_id = _event_id
       GROUP BY status
    ) t;

  SELECT jsonb_build_object(
    'all',         count(*),
    'mine',        count(*) FILTER (WHERE assigned_to = v_uid),
    'unassigned',  count(*) FILTER (WHERE assigned_to IS NULL AND status='aguardando'),
    'pending',     count(*) FILTER (WHERE status NOT IN ('concluido','cancelado')),
    'closed',      count(*) FILTER (WHERE status IN ('concluido','cancelado')),
    'map_pending', count(*) FILTER (WHERE mapped_at IS NULL
                                      AND status IN ('apresentados','contato_trocado','concluido')),
    'mapped',      count(*) FILTER (WHERE mapped_at IS NOT NULL)
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
END $function$;

-- ------------------------------------------------------------
-- Detalhe da conexão: estado do mapa + pins das duas partes
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- Privilégios: somente sessões autenticadas (staff é validado dentro)
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public.staff_set_participant_pin(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staff_clear_participant_pin(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staff_mark_connection_mapped(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staff_unmark_connection_mapped(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staff_list_pins(text,text,boolean,integer,integer) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.staff_set_participant_pin(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_clear_participant_pin(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_mark_connection_mapped(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_unmark_connection_mapped(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_list_pins(text,text,boolean,integer,integer) TO authenticated;