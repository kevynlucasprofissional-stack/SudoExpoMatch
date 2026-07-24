
-- =============================================================
-- 1. DEDUP + UNIQUE (event_id, user_id) em event_staff
-- =============================================================
WITH ranked AS (
  SELECT id, event_id, user_id, role, created_at,
         row_number() OVER (
           PARTITION BY event_id, user_id
           ORDER BY (role = 'admin') DESC, created_at ASC, id ASC
         ) AS rn
  FROM public.event_staff
)
DELETE FROM public.event_staff es
USING ranked r
WHERE es.id = r.id AND r.rn > 1;

ALTER TABLE public.event_staff
  DROP CONSTRAINT IF EXISTS event_staff_event_id_user_id_role_key;

ALTER TABLE public.event_staff
  ADD CONSTRAINT event_staff_event_user_unique UNIQUE (event_id, user_id);

-- =============================================================
-- 2. admin_add_event_staff_by_email — sem duplicar linhas
-- =============================================================
CREATE OR REPLACE FUNCTION public.admin_add_event_staff_by_email(
  _event_id text, _email text, _role app_role
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _target_user uuid;
  _existing app_role;
BEGIN
  IF NOT public.has_event_role(_event_id, auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _role NOT IN ('staff','admin') THEN
    RAISE EXCEPTION 'invalid_role' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO _target_user
  FROM auth.users
  WHERE lower(email) = lower(trim(_email))
  LIMIT 1;
  IF _target_user IS NULL THEN
    RAISE EXCEPTION 'user_not_found' USING ERRCODE = 'P0001';
  END IF;

  SELECT role INTO _existing
  FROM public.event_staff
  WHERE event_id = _event_id AND user_id = _target_user;

  IF _existing IS NOT NULL THEN
    IF _existing = _role THEN
      RAISE EXCEPTION 'already_member' USING ERRCODE = 'P0001';
    ELSE
      RAISE EXCEPTION 'already_member_different_role' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  INSERT INTO public.event_staff (event_id, user_id, role)
  VALUES (_event_id, _target_user, _role);

  INSERT INTO public.audit_logs (event_id, actor_user_id, target_table, target_id, action, after)
  VALUES (_event_id, auth.uid(), 'event_staff', _target_user::text, 'add',
          jsonb_build_object('role', _role, 'email', _email));
  RETURN _target_user;
END;
$$;

-- =============================================================
-- 3. admin_change_event_staff_role — UPDATE simples da linha única
-- =============================================================
CREATE OR REPLACE FUNCTION public.admin_change_event_staff_role(
  _event_id text, _user_id uuid, _role app_role
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _prev app_role;
  _admin_count int;
BEGIN
  IF NOT public.has_event_role(_event_id, auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _role NOT IN ('staff','admin') THEN
    RAISE EXCEPTION 'invalid_role' USING ERRCODE = '22023';
  END IF;

  SELECT role INTO _prev
  FROM public.event_staff
  WHERE event_id = _event_id AND user_id = _user_id
  FOR UPDATE;

  IF _prev IS NULL THEN
    RAISE EXCEPTION 'not_a_member' USING ERRCODE = 'P0001';
  END IF;

  IF _prev = _role THEN
    RETURN; -- idempotente
  END IF;

  IF _prev = 'admin' AND _role <> 'admin' THEN
    SELECT count(*) INTO _admin_count
    FROM public.event_staff
    WHERE event_id = _event_id AND role = 'admin' AND user_id <> _user_id;
    IF _admin_count = 0 THEN
      RAISE EXCEPTION 'last_admin' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  UPDATE public.event_staff
     SET role = _role
   WHERE event_id = _event_id AND user_id = _user_id;

  INSERT INTO public.audit_logs (event_id, actor_user_id, target_table, target_id, action, before, after)
  VALUES (_event_id, auth.uid(), 'event_staff', _user_id::text, 'update',
          jsonb_build_object('role', _prev),
          jsonb_build_object('role', _role));
END;
$$;

-- =============================================================
-- 4. staff_advance_connection — máquina de estados
-- =============================================================
CREATE OR REPLACE FUNCTION public.staff_advance_connection(
  _connection_id uuid,
  _new_status connection_status,
  _note text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_c RECORD;
  v_note_trim text;
  v_ok boolean := false;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;

  SELECT * INTO v_c FROM public.connections WHERE id = _connection_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'connection_not_found' USING ERRCODE = 'P0001'; END IF;

  IF NOT public.has_any_event_role(v_c.event_id, v_uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Estados terminais não avançam nem retrocedem
  IF v_c.status IN ('concluido','cancelado') THEN
    RAISE EXCEPTION 'invalid_transition:%->%', v_c.status, _new_status USING ERRCODE = 'P0001';
  END IF;

  -- Cancelamento é permitido a partir de qualquer estado ativo, exige observação
  IF _new_status = 'cancelado' THEN
    v_note_trim := trim(coalesce(_note, ''));
    IF length(v_note_trim) < 3 OR length(v_note_trim) > 500 THEN
      RAISE EXCEPTION 'note_required' USING ERRCODE = '22023';
    END IF;
    v_ok := true;
  ELSE
    v_ok := (
      (v_c.status = 'aguardando'       AND _new_status = 'em_atendimento') OR
      (v_c.status = 'em_atendimento'   AND _new_status = 'apresentados') OR
      (v_c.status = 'apresentados'     AND _new_status = 'contato_trocado') OR
      (v_c.status = 'contato_trocado'  AND _new_status = 'concluido')
    );
  END IF;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'invalid_transition:%->%', v_c.status, _new_status USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.connections
     SET status = _new_status,
         notes = CASE WHEN _new_status = 'cancelado' THEN v_note_trim ELSE COALESCE(_note, notes) END,
         assigned_to = COALESCE(assigned_to, v_uid),
         updated_at = now()
   WHERE id = _connection_id;

  INSERT INTO public.connection_status_history(connection_id, from_status, to_status, actor_user_id, note)
  VALUES (_connection_id, v_c.status, _new_status, v_uid,
          CASE WHEN _new_status = 'cancelado' THEN v_note_trim ELSE _note END);

  IF _new_status IN ('cancelado','concluido') THEN
    INSERT INTO public.audit_logs(event_id, actor_user_id, target_table, target_id, action, before, after)
    VALUES (v_c.event_id, v_uid, 'connections', _connection_id::text,
            'status_' || _new_status::text,
            jsonb_build_object('status', v_c.status),
            jsonb_build_object('status', _new_status));
  END IF;
END;
$$;

-- =============================================================
-- 5. reveal_contact_for_match — erros específicos + auditoria
-- =============================================================
CREATE OR REPLACE FUNCTION public.reveal_contact_for_match(_match_id uuid)
RETURNS TABLE(phone_e164 text, email text, name text, company text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_m RECORD;
  v_conn RECORD;
  v_other uuid;
  v_sharing boolean;
  v_phone text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;

  SELECT m.*, pa.owner_id AS a_owner, pb.owner_id AS b_owner
    INTO v_m FROM public.matches m
    JOIN public.profiles pa ON pa.id = m.a_profile_id
    JOIN public.profiles pb ON pb.id = m.b_profile_id
    WHERE m.id = _match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'match_not_found' USING ERRCODE = 'P0001'; END IF;

  IF v_m.a_owner = v_uid THEN v_other := v_m.b_profile_id;
  ELSIF v_m.b_owner = v_uid THEN v_other := v_m.a_profile_id;
  ELSE RAISE EXCEPTION 'not_a_participant' USING ERRCODE = '42501'; END IF;

  IF v_m.decision_a <> 'interesse' OR v_m.decision_b <> 'interesse' THEN
    RAISE EXCEPTION 'not_mutual' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_conn FROM public.connections WHERE match_id = _match_id;
  IF v_conn IS NULL OR v_conn.status NOT IN ('apresentados','contato_trocado','concluido') THEN
    RAISE EXCEPTION 'not_yet_introduced' USING ERRCODE = 'P0001';
  END IF;

  SELECT pc.contact_sharing_enabled, pc.phone_e164
    INTO v_sharing, v_phone
    FROM private.profile_contacts pc
    WHERE pc.profile_id = v_other;

  IF NOT FOUND OR v_phone IS NULL OR v_phone = '' THEN
    RAISE EXCEPTION 'contact_unavailable' USING ERRCODE = 'P0001';
  END IF;
  IF v_sharing IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'contact_sharing_disabled' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.audit_logs(event_id, actor_user_id, target_table, target_id, action)
  VALUES (v_m.event_id, v_uid, 'private.profile_contacts', v_other::text, 'participant_reveal_contact');

  RETURN QUERY
    SELECT pc.phone_e164, pc.email, p.name, p.company
    FROM public.profiles p
    JOIN private.profile_contacts pc ON pc.profile_id = p.id
    WHERE p.id = v_other;
END;
$$;

-- =============================================================
-- 6. staff_reveal_contact_for_match — exige match mútuo + conexão
-- =============================================================
CREATE OR REPLACE FUNCTION public.staff_reveal_contact_for_match(_match_id uuid)
RETURNS TABLE(profile_id uuid, name text, company text, phone_e164 text, email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_m RECORD;
  v_c RECORD;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;

  SELECT * INTO v_m FROM public.matches WHERE id = _match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'match_not_found' USING ERRCODE = 'P0001'; END IF;

  IF NOT public.has_any_event_role(v_m.event_id, v_uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_m.decision_a <> 'interesse' OR v_m.decision_b <> 'interesse' THEN
    RAISE EXCEPTION 'not_mutual' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_c FROM public.connections WHERE match_id = _match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no_connection' USING ERRCODE = 'P0001';
  END IF;
  IF v_c.status = 'cancelado' THEN
    RAISE EXCEPTION 'connection_cancelled' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.audit_logs(event_id, actor_user_id, target_table, target_id, action)
  VALUES (v_m.event_id, v_uid, 'private.profile_contacts', _match_id::text, 'staff_reveal_contact');

  RETURN QUERY
    SELECT p.id, p.name, p.company, pc.phone_e164, pc.email
    FROM public.matches m
    JOIN public.profiles p ON p.id IN (m.a_profile_id, m.b_profile_id)
    LEFT JOIN private.profile_contacts pc ON pc.profile_id = p.id
    WHERE m.id = _match_id;
END;
$$;

-- =============================================================
-- 7. Grants — apenas authenticated (garantir estado limpo)
-- =============================================================
REVOKE ALL ON FUNCTION public.admin_add_event_staff_by_email(text, text, app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_change_event_staff_role(text, uuid, app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staff_advance_connection(uuid, connection_status, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reveal_contact_for_match(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.staff_reveal_contact_for_match(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_add_event_staff_by_email(text, text, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_change_event_staff_role(text, uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_advance_connection(uuid, connection_status, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reveal_contact_for_match(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_reveal_contact_for_match(uuid) TO authenticated;
