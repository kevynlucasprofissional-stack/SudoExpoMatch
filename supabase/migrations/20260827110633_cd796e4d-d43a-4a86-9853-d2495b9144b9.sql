ALTER TABLE public.connections
  ADD COLUMN IF NOT EXISTS contact_released_at timestamptz,
  ADD COLUMN IF NOT EXISTS contact_released_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS contact_release_reason text;

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
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;

  SELECT m.event_id, m.a_profile_id, m.b_profile_id
    INTO v_event_id, v_a_pid, v_b_pid
    FROM public.matches m WHERE m.id = _match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'match_not_found' USING ERRCODE='P0001'; END IF;

  IF NOT public.has_event_role(v_event_id, v_uid, 'admin') THEN
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
          jsonb_build_object('match_id', _match_id));

  INSERT INTO public.audit_logs(event_id, actor_user_id, target_table, target_id, action, after)
  VALUES (v_event_id, v_uid, 'public.connections', v_conn.id::text, 'admin_release_contact',
          jsonb_build_object('match_id', _match_id, 'reason', v_reason));

  RETURN QUERY
    SELECT p.id, p.name, p.company, pc.phone_e164, pc.email
      FROM public.matches m
      JOIN public.profiles p ON p.id IN (m.a_profile_id, m.b_profile_id)
      LEFT JOIN private.profile_contacts pc ON pc.profile_id = p.id
     WHERE m.id = _match_id;
END $function$;

REVOKE ALL ON FUNCTION public.admin_release_contact_for_match(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_release_contact_for_match(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.reveal_contact_for_match(_match_id uuid)
 RETURNS TABLE(phone_e164 text, email text, name text, company text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_event_id text;
  v_a_pid uuid; v_b_pid uuid;
  v_a_owner uuid; v_b_owner uuid;
  v_other uuid;
  v_conn_status public.connection_status := NULL;
  v_released timestamptz := NULL;
  v_sharing boolean; v_phone text;
  v_mutual int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;

  SELECT m.event_id, m.a_profile_id, m.b_profile_id
    INTO v_event_id, v_a_pid, v_b_pid
    FROM public.matches m WHERE m.id = _match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'match_not_found' USING ERRCODE='P0001'; END IF;

  SELECT owner_id INTO v_a_owner FROM public.profiles WHERE id=v_a_pid;
  SELECT owner_id INTO v_b_owner FROM public.profiles WHERE id=v_b_pid;

  IF v_a_owner = v_uid THEN v_other := v_b_pid;
  ELSIF v_b_owner = v_uid THEN v_other := v_a_pid;
  ELSE RAISE EXCEPTION 'not_a_participant' USING ERRCODE='42501';
  END IF;

  SELECT status, contact_released_at INTO v_conn_status, v_released
    FROM public.connections WHERE match_id=_match_id;

  IF v_released IS NULL THEN
    SELECT count(*)::int INTO v_mutual
      FROM public.match_decisions d
     WHERE d.match_id=_match_id AND d.decision='interesse'
       AND d.profile_id IN (v_a_pid, v_b_pid);
    IF v_mutual < 2 THEN
      RAISE EXCEPTION 'not_mutual' USING ERRCODE='P0001';
    END IF;
  END IF;

  IF v_conn_status IS NULL OR v_conn_status NOT IN ('apresentados','contato_trocado','concluido') THEN
    RAISE EXCEPTION 'not_yet_introduced' USING ERRCODE='P0001';
  END IF;

  SELECT pc.contact_sharing_enabled, pc.phone_e164
    INTO v_sharing, v_phone
    FROM private.profile_contacts pc WHERE pc.profile_id = v_other;
  IF NOT FOUND OR v_phone IS NULL OR v_phone='' THEN
    RAISE EXCEPTION 'contact_unavailable' USING ERRCODE='P0001';
  END IF;
  IF v_sharing IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'contact_sharing_disabled' USING ERRCODE='P0001';
  END IF;

  INSERT INTO public.audit_logs(event_id, actor_user_id, target_table, target_id, action)
  VALUES (v_event_id, v_uid, 'private.profile_contacts', v_other::text, 'participant_reveal_contact');

  RETURN QUERY
    SELECT pc.phone_e164, pc.email, p.name, p.company
      FROM public.profiles p
      JOIN private.profile_contacts pc ON pc.profile_id = p.id
     WHERE p.id = v_other;
END $function$;