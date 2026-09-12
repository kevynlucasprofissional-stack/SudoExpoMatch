-- =====================================================================
-- Migração: Liberação Automática de WhatsApp em Interesse Mútuo
-- Data: 2026-09-12
--
-- Regra de negócio:
-- Quando duas pessoas demonstram interesse mútuo (ambas marcaram 'interesse'),
-- o WhatsApp é liberado de forma imediata e automática para ambos os lados.
-- A conexão é criada ou promovida para status 'apresentados' e o timestamp
-- contact_released_at é preenchido no exato instante do match mútuo.
-- =====================================================================

-- 1) Atualiza record_match_decision_v2 para liberar contato automaticamente no match mútuo
CREATE OR REPLACE FUNCTION public.record_match_decision_v2(_match_id uuid, _decision public.decision)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_m public.matches%ROWTYPE;
  v_a_owner uuid; v_b_owner uuid;
  v_my_pid uuid; v_other_pid uuid;
  v_my_dec public.decision;
  v_other_dec public.decision;
  v_connection_id uuid := NULL;
  v_connection_status public.connection_status := NULL;
  v_created boolean := false;
  v_inserted int := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;

  SELECT * INTO v_m FROM public.matches WHERE id=_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'match_not_found' USING ERRCODE='P0001'; END IF;
  IF NOT v_m.is_active THEN RAISE EXCEPTION 'match_inactive' USING ERRCODE='P0001'; END IF;

  SELECT owner_id INTO v_a_owner FROM public.profiles WHERE id=v_m.a_profile_id;
  SELECT owner_id INTO v_b_owner FROM public.profiles WHERE id=v_m.b_profile_id;

  IF v_a_owner = v_uid THEN v_my_pid := v_m.a_profile_id; v_other_pid := v_m.b_profile_id;
  ELSIF v_b_owner = v_uid THEN v_my_pid := v_m.b_profile_id; v_other_pid := v_m.a_profile_id;
  ELSE RAISE EXCEPTION 'not_a_participant' USING ERRCODE='42501';
  END IF;

  SELECT id, status INTO v_connection_id, v_connection_status
    FROM public.connections WHERE match_id=_match_id FOR UPDATE;

  IF v_connection_id IS NOT NULL
     AND _decision = 'agora_nao'
     AND v_connection_status <> 'aguardando' THEN
    RAISE EXCEPTION 'decision_locked_by_connection' USING ERRCODE='P0001';
  END IF;

  INSERT INTO public.match_decisions(match_id, profile_id, decision)
  VALUES (_match_id, v_my_pid, _decision)
  ON CONFLICT (match_id, profile_id) DO UPDATE
    SET decision = EXCLUDED.decision, decided_at = now();

  INSERT INTO public.match_status_history(match_id, actor_user_id, actor_profile_id, event_type, payload)
  VALUES (_match_id, v_uid, v_my_pid, 'decision', jsonb_build_object('decision', _decision));

  SELECT decision INTO v_my_dec FROM public.match_decisions WHERE match_id=_match_id AND profile_id=v_my_pid;
  SELECT decision INTO v_other_dec FROM public.match_decisions WHERE match_id=_match_id AND profile_id=v_other_pid;
  v_my_dec := COALESCE(v_my_dec, 'sem_decisao'::public.decision);
  v_other_dec := COALESCE(v_other_dec, 'sem_decisao'::public.decision);

  -- Liberação automática de WhatsApp em caso de interesse mútuo
  IF v_my_dec = 'interesse' AND v_other_dec = 'interesse' THEN
    IF v_connection_id IS NULL THEN
      INSERT INTO public.connections (
        match_id, event_id, a_profile_id, b_profile_id, status,
        presented_at, contact_released_at, contact_released_by, contact_release_reason
      )
      VALUES (
        _match_id, v_m.event_id, v_m.a_profile_id, v_m.b_profile_id, 'apresentados',
        now(), now(), v_uid, 'Liberação automática por interesse mútuo'
      )
      ON CONFLICT (match_id) DO UPDATE
        SET status = CASE WHEN connections.status = 'cancelado' THEN connections.status ELSE 'apresentados'::public.connection_status END,
            presented_at = COALESCE(connections.presented_at, now()),
            contact_released_at = COALESCE(connections.contact_released_at, now()),
            contact_release_reason = COALESCE(connections.contact_release_reason, 'Liberação automática por interesse mútuo'),
            updated_at = now()
      RETURNING id, status INTO v_connection_id, v_connection_status;

      v_created := true;
    ELSE
      IF v_connection_status <> 'cancelado' THEN
        UPDATE public.connections
           SET status = CASE WHEN status IN ('contato_trocado', 'concluido') THEN status ELSE 'apresentados'::public.connection_status END,
               presented_at = COALESCE(presented_at, now()),
               contact_released_at = COALESCE(contact_released_at, now()),
               contact_released_by = COALESCE(contact_released_by, v_uid),
               contact_release_reason = COALESCE(contact_release_reason, 'Liberação automática por interesse mútuo'),
               updated_at = now()
         WHERE id = v_connection_id
         RETURNING status INTO v_connection_status;
      END IF;
    END IF;

    -- Registro no log de eventos da conexão
    INSERT INTO public.connection_events (connection_id, actor_user_id, action, notes)
    VALUES (v_connection_id, v_uid, 'auto_release_mutual_interest', 'WhatsApp liberado automaticamente por interesse mútuo');

    INSERT INTO public.connection_status_history (connection_id, actor_user_id, from_status, to_status, notes)
    VALUES (v_connection_id, v_uid, 'aguardando'::public.connection_status, v_connection_status, 'Liberação automática por interesse mútuo');
  END IF;

  RETURN jsonb_build_object(
    'my_decision', v_my_dec,
    'other_decision', v_other_dec,
    'mutual', (v_my_dec='interesse' AND v_other_dec='interesse'),
    'connection_id', v_connection_id,
    'connection_status', v_connection_status,
    'connection_created', v_created
  );
END $function$;

REVOKE ALL ON FUNCTION public.record_match_decision_v2(uuid, public.decision) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_match_decision_v2(uuid, public.decision) TO authenticated;

-- 2) Atualiza reveal_contact_for_match para liberar contatos em matches mútuos sem barreira manual
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

  SELECT count(*)::int INTO v_mutual
    FROM public.match_decisions d
   WHERE d.match_id=_match_id AND d.decision='interesse'
     AND d.profile_id IN (v_a_pid, v_b_pid);

  -- Bloqueia revelação se não houver mutualidade E não houver liberação administrativa prévia
  IF v_released IS NULL AND v_mutual < 2 THEN
    RAISE EXCEPTION 'not_mutual' USING ERRCODE='P0001';
  END IF;

  -- Se o atendimento foi cancelado administrativamente
  IF v_conn_status = 'cancelado' THEN
    RAISE EXCEPTION 'contact_unavailable' USING ERRCODE='P0001';
  END IF;

  -- Auto-reparo garantido: se mútuo e a conexão ainda estava em aguardando ou sem timestamp
  IF v_mutual >= 2 AND (v_conn_status IS NULL OR v_conn_status = 'aguardando' OR v_released IS NULL) THEN
    INSERT INTO public.connections (
      match_id, event_id, a_profile_id, b_profile_id, status,
      presented_at, contact_released_at, contact_released_by, contact_release_reason
    )
    VALUES (
      _match_id, v_event_id, v_a_pid, v_b_pid, 'apresentados',
      now(), now(), v_uid, 'Liberação automática por interesse mútuo'
    )
    ON CONFLICT (match_id) DO UPDATE
      SET status = CASE WHEN connections.status = 'cancelado' THEN connections.status ELSE 'apresentados'::public.connection_status END,
          presented_at = COALESCE(connections.presented_at, now()),
          contact_released_at = COALESCE(connections.contact_released_at, now()),
          contact_release_reason = COALESCE(connections.contact_release_reason, 'Liberação automática por interesse mútuo'),
          updated_at = now();
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

REVOKE ALL ON FUNCTION public.reveal_contact_for_match(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reveal_contact_for_match(uuid) TO authenticated;

-- 3) Backfill retroativo para matches que já possuem interesse mútuo registrado
WITH mutual_matches AS (
  SELECT match_id
  FROM public.match_decisions
  WHERE decision = 'interesse'
  GROUP BY match_id
  HAVING count(DISTINCT profile_id) >= 2
)
INSERT INTO public.connections (
  match_id, event_id, a_profile_id, b_profile_id, status,
  presented_at, contact_released_at, contact_release_reason
)
SELECT
  m.id, m.event_id, m.a_profile_id, m.b_profile_id, 'apresentados',
  now(), now(), 'Liberação automática retroativa por interesse mútuo'
FROM public.matches m
JOIN mutual_matches mm ON mm.match_id = m.id
ON CONFLICT (match_id) DO UPDATE
  SET status = CASE WHEN connections.status = 'cancelado' THEN connections.status ELSE 'apresentados'::public.connection_status END,
      presented_at = COALESCE(connections.presented_at, now()),
      contact_released_at = COALESCE(connections.contact_released_at, now()),
      contact_release_reason = COALESCE(connections.contact_release_reason, 'Liberação automática retroativa por interesse mútuo'),
      updated_at = now();
