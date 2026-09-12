-- ==============================================================================
-- Migration: Unificação Equipe/Admin & Automação de Abordagem WhatsApp
-- Data: 2026-09-12
-- Descrição:
--   1. Cria a tabela public.outreach_logs para rastreamento de mensagens via WhatsApp
--   2. Implementa RPC public.admin_get_match_contacts para consulta de contatos de abordagem
--   3. Implementa RPC public.record_outreach_attempt para registrar envios/cópias
--   4. Implementa RPC public.admin_quick_confirm_connection para efetivação em 1 clique
--   5. Unifica admin_list_matches e admin_get_match_detail para uso por staff e admin (has_any_event_role)
-- ==============================================================================

-- 1. Tabela de logs de abordagem via WhatsApp
CREATE TABLE IF NOT EXISTS public.outreach_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  match_id uuid REFERENCES public.matches(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_phone text,
  sender_user_id uuid NOT NULL,
  template_type text NOT NULL CHECK (template_type IN ('first_contact', 'recurrent_contact', 'custom')),
  message_preview text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outreach_logs_event_profile ON public.outreach_logs(event_id, profile_id);
CREATE INDEX IF NOT EXISTS idx_outreach_logs_match ON public.outreach_logs(match_id);

ALTER TABLE public.outreach_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff can read outreach_logs" ON public.outreach_logs
  FOR SELECT TO authenticated
  USING (public.has_any_event_role(event_id, auth.uid()));

CREATE POLICY "staff can insert outreach_logs" ON public.outreach_logs
  FOR INSERT TO authenticated
  WITH CHECK (public.has_any_event_role(event_id, auth.uid()));

GRANT SELECT, INSERT ON public.outreach_logs TO authenticated;

-- 2. RPC para buscar contatos de ambos os lados com histórico de abordagens
CREATE OR REPLACE FUNCTION public.admin_get_match_contacts(_match_id uuid)
RETURNS TABLE(
  profile_id uuid,
  name text,
  company text,
  phone_e164 text,
  email text,
  outreach_count int,
  last_outreach_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_event_id text;
  v_a_pid uuid;
  v_b_pid uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT m.event_id, m.a_profile_id, m.b_profile_id
    INTO v_event_id, v_a_pid, v_b_pid
    FROM public.matches m
   WHERE m.id = _match_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_not_found' USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.has_any_event_role(v_event_id, v_uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.audit_logs(event_id, actor_user_id, target_table, target_id, action)
  VALUES (v_event_id, v_uid, 'private.profile_contacts', _match_id::text, 'admin_get_match_contacts');

  RETURN QUERY
    SELECT
      p.id AS profile_id,
      p.name,
      p.company,
      pc.phone_e164,
      pc.email,
      COALESCE((
        SELECT count(*)::int
          FROM public.outreach_logs ol
         WHERE ol.profile_id = p.id
           AND ol.event_id = v_event_id
      ), 0) AS outreach_count,
      (
        SELECT max(ol.created_at)
          FROM public.outreach_logs ol
         WHERE ol.profile_id = p.id
           AND ol.event_id = v_event_id
      ) AS last_outreach_at
    FROM public.profiles p
    LEFT JOIN private.profile_contacts pc ON pc.profile_id = p.id
   WHERE p.id IN (v_a_pid, v_b_pid);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_get_match_contacts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_match_contacts(uuid) TO authenticated;

-- 3. RPC para registrar tentativa/disparo de abordagem
CREATE OR REPLACE FUNCTION public.record_outreach_attempt(
  _event_id text,
  _match_id uuid,
  _profile_id uuid,
  _template_type text,
  _message_preview text
)
RETURNS TABLE(
  new_outreach_count int,
  logged_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_target_phone text;
  v_created_at timestamptz := now();
  v_count int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_any_event_role(_event_id, v_uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT pc.phone_e164 INTO v_target_phone
    FROM private.profile_contacts pc
   WHERE pc.profile_id = _profile_id;

  INSERT INTO public.outreach_logs(
    event_id,
    match_id,
    profile_id,
    target_phone,
    sender_user_id,
    template_type,
    message_preview,
    created_at
  ) VALUES (
    _event_id,
    _match_id,
    _profile_id,
    v_target_phone,
    v_uid,
    _template_type,
    _message_preview,
    v_created_at
  );

  SELECT count(*)::int INTO v_count
    FROM public.outreach_logs
   WHERE profile_id = _profile_id
     AND event_id = _event_id;

  RETURN QUERY SELECT v_count, v_created_at;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_outreach_attempt(text, uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_outreach_attempt(text, uuid, uuid, text, text) TO authenticated;

-- 4. RPC para confirmação rápida de conexão e liberação de contatos em 1 clique
CREATE OR REPLACE FUNCTION public.admin_quick_confirm_connection(
  _match_id uuid,
  _reason text DEFAULT 'Confirmado via atendimento WhatsApp'::text
)
RETURNS TABLE(profile_id uuid, name text, company text, phone_e164 text, email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_event_id text;
  v_a_pid uuid;
  v_b_pid uuid;
  v_conn public.connections;
  v_prev public.connection_status;
  v_reason text := NULLIF(btrim(coalesce(_reason, '')), '');
  v_role text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT m.event_id, m.a_profile_id, m.b_profile_id
    INTO v_event_id, v_a_pid, v_b_pid
    FROM public.matches m
   WHERE m.id = _match_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_not_found' USING ERRCODE = 'P0001';
  END IF;

  IF public.has_event_role(v_event_id, v_uid, 'admin') THEN
    v_role := 'admin';
  ELSIF public.has_event_role(v_event_id, v_uid, 'staff') THEN
    v_role := 'staff';
  ELSE
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- 1. Garante que ambos os lados tenham decisão 'interesse' registrada
  INSERT INTO public.match_decisions(match_id, profile_id, decision)
  VALUES (_match_id, v_a_pid, 'interesse')
  ON CONFLICT (match_id, profile_id) DO UPDATE
    SET decision = 'interesse', decided_at = now();

  INSERT INTO public.match_decisions(match_id, profile_id, decision)
  VALUES (_match_id, v_b_pid, 'interesse')
  ON CONFLICT (match_id, profile_id) DO UPDATE
    SET decision = 'interesse', decided_at = now();

  -- 2. Localiza ou cria a conexão
  SELECT * INTO v_conn FROM public.connections WHERE match_id = _match_id FOR UPDATE;

  IF v_conn.id IS NULL THEN
    INSERT INTO public.connections (match_id, event_id, a_profile_id, b_profile_id, status)
    VALUES (_match_id, v_event_id, v_a_pid, v_b_pid, 'aguardando')
    RETURNING * INTO v_conn;
  END IF;

  v_prev := v_conn.status;

  -- 3. Avança a conexão para 'apresentados' e libera contatos
  UPDATE public.connections
     SET status = 'apresentados',
         presented_at = COALESCE(presented_at, now()),
         contact_released_at = COALESCE(contact_released_at, now()),
         contact_released_by = COALESCE(contact_released_by, v_uid),
         contact_release_reason = COALESCE(v_reason, contact_release_reason),
         updated_at = now()
   WHERE id = v_conn.id
  RETURNING * INTO v_conn;

  IF v_prev <> 'apresentados' THEN
    INSERT INTO public.connection_status_history(connection_id, from_status, to_status, actor_user_id, note)
    VALUES (v_conn.id, v_prev, 'apresentados', v_uid, v_reason);
  END IF;

  INSERT INTO public.connection_events(event_id, connection_id, actor_user_id, action, previous_status, new_status, note, metadata)
  VALUES (
    v_event_id,
    v_conn.id,
    v_uid,
    'quick_confirm_connection',
    v_prev,
    'apresentados',
    v_reason,
    jsonb_build_object('match_id', _match_id, 'actor_role', v_role)
  );

  INSERT INTO public.audit_logs(event_id, actor_user_id, target_table, target_id, action, after)
  VALUES (
    v_event_id,
    v_uid,
    'public.connections',
    v_conn.id::text,
    'quick_confirm_connection',
    jsonb_build_object('match_id', _match_id, 'reason', v_reason, 'actor_role', v_role)
  );

  RETURN QUERY
    SELECT p.id, p.name, p.company, pc.phone_e164, pc.email
      FROM public.matches m
      JOIN public.profiles p ON p.id IN (m.a_profile_id, m.b_profile_id)
      LEFT JOIN private.profile_contacts pc ON pc.profile_id = p.id
     WHERE m.id = _match_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_quick_confirm_connection(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_quick_confirm_connection(uuid, text) TO authenticated;

-- 5. Atualizar admin_list_matches para permitir acesso de equipe (has_any_event_role)
CREATE OR REPLACE FUNCTION public.admin_list_matches(
  _event_id text,
  _search text DEFAULT NULL::text,
  _kinds text[] DEFAULT NULL::text[],
  _labels text[] DEFAULT NULL::text[],
  _score_side text DEFAULT 'any'::text,
  _min_score integer DEFAULT NULL::integer,
  _max_score integer DEFAULT NULL::integer,
  _segment_ids text[] DEFAULT NULL::text[],
  _decisions text[] DEFAULT NULL::text[],
  _mutual_only boolean DEFAULT false,
  _connection text DEFAULT 'any'::text,
  _connection_statuses text[] DEFAULT NULL::text[],
  _algorithm_versions text[] DEFAULT NULL::text[],
  _sort text DEFAULT 'score_desc'::text,
  _limit integer DEFAULT 20,
  _offset integer DEFAULT 0,
  _reviewed boolean DEFAULT NULL::boolean,
  _briefing text DEFAULT 'any'::text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_limit int := LEAST(GREATEST(COALESCE(_limit, 20), 1), 100);
  v_offset int := GREATEST(COALESCE(_offset, 0), 0);
  v_search text := NULLIF(btrim(COALESCE(_search, '')), '');
  v_pattern text;
  v_side text := lower(COALESCE(NULLIF(btrim(_score_side), ''), 'any'));
  v_conn text := lower(COALESCE(NULLIF(btrim(_connection), ''), 'any'));
  v_sort text := lower(COALESCE(NULLIF(btrim(_sort), ''), 'score_desc'));
  v_brief text := lower(COALESCE(NULLIF(btrim(_briefing), ''), 'any'));
  v_kinds text[] := CASE WHEN _kinds IS NULL OR array_length(_kinds,1) IS NULL THEN NULL ELSE _kinds END;
  v_labels text[] := CASE WHEN _labels IS NULL OR array_length(_labels,1) IS NULL THEN NULL ELSE _labels END;
  v_segs text[] := CASE WHEN _segment_ids IS NULL OR array_length(_segment_ids,1) IS NULL THEN NULL ELSE _segment_ids END;
  v_decs text[] := CASE WHEN _decisions IS NULL OR array_length(_decisions,1) IS NULL THEN NULL ELSE _decisions END;
  v_cstat text[] := CASE WHEN _connection_statuses IS NULL OR array_length(_connection_statuses,1) IS NULL THEN NULL ELSE _connection_statuses END;
  v_vers text[] := CASE WHEN _algorithm_versions IS NULL OR array_length(_algorithm_versions,1) IS NULL THEN NULL ELSE _algorithm_versions END;
  v_total int;
  v_items jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  -- Unificação: staff e admin têm acesso à auditoria de matches
  IF NOT public.has_any_event_role(_event_id, v_uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_side NOT IN ('any','a','b','both') THEN v_side := 'any'; END IF;
  IF v_conn NOT IN ('any','with','without') THEN v_conn := 'any'; END IF;
  IF v_sort NOT IN ('score_desc','score_asc','gap_desc','recent') THEN v_sort := 'score_desc'; END IF;
  IF v_brief NOT IN ('any','with','without') THEN v_brief := 'any'; END IF;

  IF v_search IS NOT NULL THEN
    v_pattern := '%' || replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  END IF;

  WITH base AS (
    SELECT m.id, m.event_id, m.kind::text AS kind, m.algorithm_version,
           m.score_for_a, m.score_for_b, m.generated_at, m.updated_at,
           m.a_profile_id, m.b_profile_id,
           public.match_label_for_score(m.score_for_a)::text AS label_a,
           public.match_label_for_score(m.score_for_b)::text AS label_b,
           GREATEST(m.score_for_a, m.score_for_b) AS score_max,
           abs(m.score_for_a - m.score_for_b) AS score_gap,
           pa.name AS a_name, pa.company AS a_company, pa.segment_id AS a_segment_id,
           pa.city AS a_city,
           pb.name AS b_name, pb.company AS b_company, pb.segment_id AS b_segment_id,
           pb.city AS b_city,
           COALESCE(da.decision::text, 'sem_decisao') AS decision_a,
           COALESCE(db.decision::text, 'sem_decisao') AS decision_b,
           c.id AS connection_id, c.status::text AS connection_status,
           COALESCE(r.reviewed, false) AS reviewed,
           CASE WHEN COALESCE(r.reviewed, false) THEN r.reviewed_at END AS reviewed_at,
           CASE WHEN COALESCE(r.reviewed, false) THEN r.reviewed_by END AS reviewed_by,
           bf.summary AS briefing_summary,
           bf.generated_at AS briefing_generated_at,
           (bf.match_id IS NOT NULL) AS has_briefing,
           (bf.match_id IS NOT NULL
              AND bf.inputs_fingerprint IS DISTINCT FROM public._match_inputs_fingerprint(m.id)) AS briefing_stale
      FROM public.matches m
      JOIN public.profiles pa ON pa.id = m.a_profile_id
      JOIN public.profiles pb ON pb.id = m.b_profile_id
      LEFT JOIN public.match_admin_reviews r ON r.match_id = m.id
      LEFT JOIN public.match_briefings bf ON bf.match_id = m.id
      LEFT JOIN LATERAL (
        SELECT d.decision FROM public.match_decisions d
         WHERE d.match_id = m.id AND d.profile_id = m.a_profile_id
         ORDER BY d.decided_at DESC LIMIT 1
      ) da ON true
      LEFT JOIN LATERAL (
        SELECT d.decision FROM public.match_decisions d
         WHERE d.match_id = m.id AND d.profile_id = m.b_profile_id
         ORDER BY d.decided_at DESC LIMIT 1
      ) db ON true
      LEFT JOIN LATERAL (
        SELECT cc.id, cc.status FROM public.connections cc
         WHERE cc.match_id = m.id ORDER BY cc.created_at DESC LIMIT 1
      ) c ON true
     WHERE m.event_id = _event_id
       AND m.is_active
  ),
  filtered AS (
    SELECT b.*, (b.decision_a = 'interesse' AND b.decision_b = 'interesse') AS mutual
      FROM base b
     WHERE (v_pattern IS NULL
            OR b.a_name ILIKE v_pattern OR b.a_company ILIKE v_pattern
            OR b.b_name ILIKE v_pattern OR b.b_company ILIKE v_pattern)
       AND (v_kinds IS NULL OR b.kind = ANY (v_kinds))
       AND (v_vers IS NULL OR b.algorithm_version = ANY (v_vers))
       AND (v_segs IS NULL OR b.a_segment_id = ANY (v_segs) OR b.b_segment_id = ANY (v_segs))
       AND (v_labels IS NULL OR CASE v_side
              WHEN 'a' THEN b.label_a = ANY (v_labels)
              WHEN 'b' THEN b.label_b = ANY (v_labels)
              WHEN 'both' THEN b.label_a = ANY (v_labels) AND b.label_b = ANY (v_labels)
              ELSE b.label_a = ANY (v_labels) OR b.label_b = ANY (v_labels) END)
       AND (_min_score IS NULL OR CASE v_side
              WHEN 'a' THEN b.score_for_a >= _min_score
              WHEN 'b' THEN b.score_for_b >= _min_score
              WHEN 'both' THEN b.score_for_a >= _min_score AND b.score_for_b >= _min_score
              ELSE GREATEST(b.score_for_a, b.score_for_b) >= _min_score END)
       AND (_max_score IS NULL OR CASE v_side
              WHEN 'a' THEN b.score_for_a <= _max_score
              WHEN 'b' THEN b.score_for_b <= _max_score
              WHEN 'both' THEN b.score_for_a <= _max_score AND b.score_for_b <= _max_score
              ELSE LEAST(b.score_for_a, b.score_for_b) <= _max_score END)
       AND (v_decs IS NULL OR b.decision_a = ANY (v_decs) OR b.decision_b = ANY (v_decs))
       AND (NOT COALESCE(_mutual_only, false)
            OR (b.decision_a = 'interesse' AND b.decision_b = 'interesse'))
       AND (v_conn = 'any'
            OR (v_conn = 'with' AND b.connection_id IS NOT NULL)
            OR (v_conn = 'without' AND b.connection_id IS NULL))
       AND (v_cstat IS NULL OR b.connection_status = ANY (v_cstat))
       AND (_reviewed IS NULL OR b.reviewed = _reviewed)
       AND (v_brief = 'any'
            OR (v_brief = 'with' AND b.has_briefing)
            OR (v_brief = 'without' AND NOT b.has_briefing))
  ),
  counted AS (
    SELECT count(*)::int AS total FROM filtered
  ),
  page AS (
    SELECT f.*,
           sa.label AS a_segment_label,
           sb.label AS b_segment_label
      FROM filtered f
      LEFT JOIN public.segments sa ON sa.id = f.a_segment_id
      LEFT JOIN public.segments sb ON sb.id = f.b_segment_id
     ORDER BY
       CASE WHEN v_sort = 'score_desc' THEN f.score_max END DESC NULLS LAST,
       CASE WHEN v_sort = 'score_asc' THEN f.score_max END ASC NULLS LAST,
       CASE WHEN v_sort = 'gap_desc' THEN f.score_gap END DESC NULLS LAST,
       CASE WHEN v_sort = 'recent' THEN f.generated_at END DESC NULLS LAST,
       f.generated_at DESC, f.id
     LIMIT v_limit OFFSET v_offset
  )
  SELECT (SELECT total FROM counted),
         COALESCE(jsonb_agg(jsonb_build_object(
           'id', p.id,
           'event_id', p.event_id,
           'kind', p.kind,
           'algorithm_version', p.algorithm_version,
           'a_profile_id', p.a_profile_id,
           'a_name', p.a_name,
           'a_company', p.a_company,
           'a_city', p.a_city,
           'a_segment_id', p.a_segment_id,
           'a_segment_label', COALESCE(p.a_segment_label, p.a_segment_id),
           'b_profile_id', p.b_profile_id,
           'b_name', p.b_name,
           'b_company', p.b_company,
           'b_city', p.b_city,
           'b_segment_id', p.b_segment_id,
           'b_segment_label', COALESCE(p.b_segment_label, p.b_segment_id),
           'score_for_a', p.score_for_a,
           'label_a', p.label_a,
           'score_for_b', p.score_for_b,
           'label_b', p.label_b,
           'score_gap', p.score_gap,
           'decision_a', p.decision_a,
           'decision_b', p.decision_b,
           'mutual', p.mutual,
           'connection_id', p.connection_id,
           'connection_status', p.connection_status,
           'reviewed', p.reviewed,
           'reviewed_at', p.reviewed_at,
           'reviewed_by', p.reviewed_by,
           'generated_at', p.generated_at,
           'updated_at', p.updated_at,
           'why_a', public._match_top_reasons(p.id, p.a_profile_id, 2),
           'why_b', public._match_top_reasons(p.id, p.b_profile_id, 2),
           'has_briefing', p.has_briefing,
           'briefing_summary', p.briefing_summary,
           'briefing_generated_at', p.briefing_generated_at,
           'briefing_stale', COALESCE(p.briefing_stale, false)
         ) ORDER BY
           CASE WHEN v_sort = 'score_desc' THEN p.score_max END DESC NULLS LAST,
           CASE WHEN v_sort = 'score_asc' THEN p.score_max END ASC NULLS LAST,
           CASE WHEN v_sort = 'gap_desc' THEN p.score_gap END DESC NULLS LAST,
           CASE WHEN v_sort = 'recent' THEN p.generated_at END DESC NULLS LAST,
           p.generated_at DESC, p.id), '[]'::jsonb)
    INTO v_total, v_items
    FROM page p;

  RETURN jsonb_build_object(
    'items', COALESCE(v_items, '[]'::jsonb),
    'total', COALESCE(v_total, 0),
    'limit', v_limit,
    'offset', v_offset,
    'score_side', v_side,
    'sort', v_sort,
    'reviewed_filter', _reviewed,
    'briefing_filter', v_brief
  );
END;
$function$;

-- 6. Atualizar admin_get_match_detail para permitir acesso de equipe (has_any_event_role)
CREATE OR REPLACE FUNCTION public.admin_get_match_detail(_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_m record;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT m.* INTO v_m FROM public.matches m WHERE m.id = _match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Unificação: staff e admin têm acesso ao detalhe completo do match
  IF NOT public.has_any_event_role(v_m.event_id, v_uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'match', jsonb_build_object(
      'id', v_m.id,
      'event_id', v_m.event_id,
      'kind', v_m.kind,
      'algorithm_version', v_m.algorithm_version,
      'is_active', v_m.is_active,
      'score_for_a', v_m.score_for_a,
      'label_a', public.match_label_for_score(v_m.score_for_a),
      'score_for_b', v_m.score_for_b,
      'label_b', public.match_label_for_score(v_m.score_for_b),
      'score_gap', abs(v_m.score_for_a - v_m.score_for_b),
      'decision_a', COALESCE((
        SELECT d.decision::text FROM public.match_decisions d
         WHERE d.match_id = v_m.id AND d.profile_id = v_m.a_profile_id
         ORDER BY d.decided_at DESC LIMIT 1), 'sem_decisao'),
      'decision_b', COALESCE((
        SELECT d.decision::text FROM public.match_decisions d
         WHERE d.match_id = v_m.id AND d.profile_id = v_m.b_profile_id
         ORDER BY d.decided_at DESC LIMIT 1), 'sem_decisao'),
      'mutual', (
        COALESCE((SELECT d.decision::text FROM public.match_decisions d
                   WHERE d.match_id = v_m.id AND d.profile_id = v_m.a_profile_id
                   ORDER BY d.decided_at DESC LIMIT 1), 'x') = 'interesse'
        AND
        COALESCE((SELECT d.decision::text FROM public.match_decisions d
                   WHERE d.match_id = v_m.id AND d.profile_id = v_m.b_profile_id
                   ORDER BY d.decided_at DESC LIMIT 1), 'x') = 'interesse'),
      'generated_at', v_m.generated_at,
      'updated_at', v_m.updated_at
    ),
    'profile_a', (
      SELECT jsonb_build_object(
        'id', p.id, 'name', p.name, 'company', p.company, 'city', p.city,
        'segment_id', p.segment_id,
        'segment_label', COALESCE(s.label, p.segment_id),
        'business_size', p.business_size,
        'business_type', p.business_type,
        'niche', p.niche,
        'target_business_size', p.target_business_size,
        'target_business_type', p.target_business_type,
        'target_segment_id', p.target_segment_id,
        'target_segment_label', (SELECT ts.label FROM public.segments ts WHERE ts.id = p.target_segment_id),
        'summary', p.summary, 'is_demo', p.is_demo, 'updated_at', p.updated_at)
        FROM public.profiles p LEFT JOIN public.segments s ON s.id = p.segment_id
       WHERE p.id = v_m.a_profile_id),
    'profile_b', (
      SELECT jsonb_build_object(
        'id', p.id, 'name', p.name, 'company', p.company, 'city', p.city,
        'segment_id', p.segment_id,
        'segment_label', COALESCE(s.label, p.segment_id),
        'business_size', p.business_size,
        'business_type', p.business_type,
        'niche', p.niche,
        'target_business_size', p.target_business_size,
        'target_business_type', p.target_business_type,
        'target_segment_id', p.target_segment_id,
        'target_segment_label', (SELECT ts.label FROM public.segments ts WHERE ts.id = p.target_segment_id),
        'summary', p.summary, 'is_demo', p.is_demo, 'updated_at', p.updated_at)
        FROM public.profiles p LEFT JOIN public.segments s ON s.id = p.segment_id
       WHERE p.id = v_m.b_profile_id),
    'connection', (
      SELECT jsonb_build_object(
        'id', c.id, 'status', c.status, 'assigned_to', c.assigned_to,
        'created_at', c.created_at, 'updated_at', c.updated_at,
        'presented_at', c.presented_at, 'contact_exchanged_at', c.contact_exchanged_at,
        'completed_at', c.completed_at, 'cancelled_at', c.cancelled_at)
        FROM public.connections c WHERE c.match_id = v_m.id
       ORDER BY c.created_at DESC LIMIT 1),
    'reasons_a', public._admin_match_reasons(v_m.id, v_m.a_profile_id),
    'reasons_b', public._admin_match_reasons(v_m.id, v_m.b_profile_id),
    'briefing', (
      SELECT jsonb_build_object(
        'match_id', bf.match_id,
        'summary', bf.summary,
        'sides', bf.sides,
        'evidence', bf.evidence,
        'risks', bf.risks,
        'approach', bf.approach,
        'source', bf.source,
        'model', bf.model,
        'generated_at', bf.generated_at,
        'stale', bf.inputs_fingerprint IS DISTINCT FROM public._match_inputs_fingerprint(v_m.id))
        FROM public.match_briefings bf WHERE bf.match_id = v_m.id)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;
