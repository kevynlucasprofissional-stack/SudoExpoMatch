-- ============================================================================
-- MIGRATION: 20260909155500_multi_eventos_separacao_e_checkin.sql
-- Objetivo:
-- 1. Separar formalmente os dados do teste piloto (Agosto/2026) para o evento
--    'cafe-entre-amigos-ago-2026', liberando 'sudoexpo-2026' com base limpa.
-- 2. Suporte a Lookup Multi-Evento por telefone (reconhece participantes de eventos anteriores).
-- 3. Check-in com 1 clique (participant_checkin_by_phone e staff_checkin_participant).
-- 4. Governança administrativa com listagem e estatísticas por evento.
-- ============================================================================

-- 1. Criação do evento do Café Entre Amigos e confirmação da SudoExpo 2026
INSERT INTO public.events (id, name, city, starts_at, ends_at, is_active)
VALUES (
  'cafe-entre-amigos-ago-2026',
  'Café Entre Amigos — ACIRV (Agosto 2026)',
  'Rio Verde',
  '2026-08-01 00:00:00+00',
  '2026-08-31 23:59:59+00',
  false
)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    city = EXCLUDED.city,
    is_active = false;

INSERT INTO public.events (id, name, city, starts_at, ends_at, is_active)
VALUES (
  'sudoexpo-2026',
  'SudoExpo 2026',
  'Rio Verde',
  '2026-09-01 00:00:00+00',
  '2026-12-31 23:59:59+00',
  true
)
ON CONFLICT (id) DO UPDATE
SET is_active = true;

-- Concede aos membros da equipe da SudoExpo o mesmo papel no Café Entre Amigos
INSERT INTO public.event_staff (event_id, user_id, role)
SELECT 'cafe-entre-amigos-ago-2026', user_id, role
  FROM public.event_staff
 WHERE event_id = 'sudoexpo-2026'
ON CONFLICT DO NOTHING;

-- 2. Migração dos dados históricos do piloto de Agosto
DO $$
DECLARE
  v_pilot_profile_ids uuid[];
BEGIN
  -- Seleciona todos os perfis reais (não demo) atualmente em 'sudoexpo-2026'
  SELECT array_agg(id) INTO v_pilot_profile_ids
    FROM public.profiles
   WHERE event_id = 'sudoexpo-2026'
     AND is_demo = false;

  IF v_pilot_profile_ids IS NOT NULL AND array_length(v_pilot_profile_ids, 1) > 0 THEN
    -- Atualiza profile_offers
    UPDATE public.profile_offers
       SET event_id = 'cafe-entre-amigos-ago-2026'
     WHERE profile_id = ANY(v_pilot_profile_ids);

    -- Atualiza profile_needs
    UPDATE public.profile_needs
       SET event_id = 'cafe-entre-amigos-ago-2026'
     WHERE profile_id = ANY(v_pilot_profile_ids);

    -- Atualiza private.profile_contacts
    UPDATE private.profile_contacts
       SET event_id = 'cafe-entre-amigos-ago-2026'
     WHERE profile_id = ANY(v_pilot_profile_ids);

    -- Atualiza consents
    UPDATE public.consents
       SET event_id = 'cafe-entre-amigos-ago-2026'
     WHERE profile_id = ANY(v_pilot_profile_ids);

    -- Atualiza matches que envolvam perfis do piloto
    UPDATE public.matches
       SET event_id = 'cafe-entre-amigos-ago-2026'
     WHERE a_profile_id = ANY(v_pilot_profile_ids)
        OR b_profile_id = ANY(v_pilot_profile_ids);

    -- Atualiza connections
    UPDATE public.connections
       SET event_id = 'cafe-entre-amigos-ago-2026'
     WHERE a_profile_id = ANY(v_pilot_profile_ids)
        OR b_profile_id = ANY(v_pilot_profile_ids);

    -- Atualiza connection_events
    UPDATE public.connection_events
       SET event_id = 'cafe-entre-amigos-ago-2026'
     WHERE connection_id IN (
       SELECT id FROM public.connections WHERE event_id = 'cafe-entre-amigos-ago-2026'
     );

    -- Atualiza connection_notes
    UPDATE public.connection_notes
       SET event_id = 'cafe-entre-amigos-ago-2026'
     WHERE connection_id IN (
       SELECT id FROM public.connections WHERE event_id = 'cafe-entre-amigos-ago-2026'
     );

    -- Atualiza match_admin_reviews
    UPDATE public.match_admin_reviews
       SET event_id = 'cafe-entre-amigos-ago-2026'
     WHERE match_id IN (
       SELECT id FROM public.matches WHERE event_id = 'cafe-entre-amigos-ago-2026'
     );

    -- Atualiza match_briefings
    UPDATE public.match_briefings
       SET event_id = 'cafe-entre-amigos-ago-2026'
     WHERE match_id IN (
       SELECT id FROM public.matches WHERE event_id = 'cafe-entre-amigos-ago-2026'
     );

    -- Por fim, atualiza os próprios profiles
    UPDATE public.profiles
       SET event_id = 'cafe-entre-amigos-ago-2026'
     WHERE id = ANY(v_pilot_profile_ids);

    -- Registra na auditoria a migração
    INSERT INTO public.audit_logs(event_id, target_table, target_id, action, after)
    VALUES (
      'cafe-entre-amigos-ago-2026',
      'profiles',
      'migration',
      'migrate_pilot_to_cafe_entre_amigos',
      jsonb_build_object(
        'count_migrated', array_length(v_pilot_profile_ids, 1),
        'source_event', 'sudoexpo-2026',
        'target_event', 'cafe-entre-amigos-ago-2026'
      )
    );
  END IF;
END $$;

-- 3. Lookup Inteligente Multi-Evento por Telefone
CREATE OR REPLACE FUNCTION public.lookup_profile_by_phone(_event_id text, _phone_e164 text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_norm text;
  v_hashes text[];
  v_hash text;
  v_recent int;
  v_pid uuid;
  v_name text;
  v_company text;
  v_is_demo boolean;
  v_parts text[];

  -- Variáveis de eventos anteriores
  v_prev_pid uuid;
  v_prev_event_id text;
  v_prev_event_name text;
  v_prev_name text;
  v_prev_company text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501';
  END IF;

  v_norm := public._normalize_br_phone(_phone_e164);
  IF v_norm IS NULL OR length(v_norm) < 10 THEN
    RAISE EXCEPTION 'invalid_phone' USING ERRCODE='P0001';
  END IF;
  v_hash := public.hash_phone(v_norm);
  v_hashes := public._phone_hash_candidates(_phone_e164);

  SELECT COUNT(*) INTO v_recent FROM private.phone_claim_attempts a
    WHERE (a.user_id = v_uid OR a.phone_hash = v_hash)
      AND a.attempted_at > now() - interval '15 minutes';
  IF v_recent >= 15 THEN
    RAISE EXCEPTION 'rate_limited' USING ERRCODE='P0001';
  END IF;

  -- 1. Verifica se já existe perfil no evento solicitado (_event_id)
  SELECT pc.profile_id INTO v_pid FROM private.profile_contacts pc
    WHERE pc.event_id = _event_id AND pc.phone_hash = ANY(v_hashes) LIMIT 1;

  IF v_pid IS NOT NULL THEN
    SELECT p.name, p.company, p.is_demo INTO v_name, v_company, v_is_demo
      FROM public.profiles p WHERE p.id = v_pid;

    IF v_is_demo IS FALSE THEN
      v_parts := regexp_split_to_array(btrim(coalesce(v_name, '')), '\s+');
      RETURN jsonb_build_object(
        'found', true,
        'has_previous_event', false,
        'profile_id', v_pid,
        'display_name', btrim(
          coalesce(v_parts[1], '') ||
          CASE WHEN array_length(v_parts, 1) > 1
            THEN ' ' || upper(left(v_parts[array_length(v_parts, 1)], 1)) || '.'
            ELSE '' END
        ),
        'company', coalesce(v_company, '')
      );
    END IF;
  END IF;

  -- 2. Não encontrado no evento atual: busca em eventos anteriores
  SELECT pc.profile_id, pc.event_id, p.name, p.company, e.name
    INTO v_prev_pid, v_prev_event_id, v_prev_name, v_prev_company, v_prev_event_name
    FROM private.profile_contacts pc
    JOIN public.profiles p ON p.id = pc.profile_id
    JOIN public.events e ON e.id = pc.event_id
   WHERE pc.phone_hash = ANY(v_hashes)
     AND pc.event_id <> _event_id
     AND p.is_demo = false
   ORDER BY pc.created_at DESC
   LIMIT 1;

  IF v_prev_pid IS NOT NULL THEN
    v_parts := regexp_split_to_array(btrim(coalesce(v_prev_name, '')), '\s+');
    RETURN jsonb_build_object(
      'found', false,
      'has_previous_event', true,
      'previous_event_id', v_prev_event_id,
      'previous_event_name', v_prev_event_name,
      'previous_profile_id', v_prev_pid,
      'display_name', btrim(
        coalesce(v_parts[1], '') ||
        CASE WHEN array_length(v_parts, 1) > 1
          THEN ' ' || upper(left(v_parts[array_length(v_parts, 1)], 1)) || '.'
          ELSE '' END
      ),
      'company', coalesce(v_prev_company, '')
    );
  END IF;

  -- 3. Não encontrado em nenhum evento
  INSERT INTO private.phone_claim_attempts(event_id, user_id, phone_hash, succeeded, reason)
    VALUES(_event_id, v_uid, v_hash, false, 'lookup_no_profile');
  RETURN jsonb_build_object('found', false, 'has_previous_event', false);
END;
$$;

-- 4. RPC de Check-in Transacional por Telefone
CREATE OR REPLACE FUNCTION public.participant_checkin_by_phone(
  _target_event_id text,
  _phone_e164 text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_norm text;
  v_hashes text[];
  v_hash text;
  v_source_pid uuid;
  v_src_profile RECORD;
  v_src_contact RECORD;
  v_new_profile_id uuid;
  v_existing_target_pid uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501';
  END IF;

  -- Valida se o evento de destino existe e está ativo
  IF NOT EXISTS (SELECT 1 FROM public.events WHERE id = _target_event_id AND is_active = true) THEN
    RAISE EXCEPTION 'event_not_active' USING ERRCODE='P0001';
  END IF;

  v_norm := public._normalize_br_phone(_phone_e164);
  IF v_norm IS NULL OR length(v_norm) < 10 THEN
    RAISE EXCEPTION 'invalid_phone' USING ERRCODE='P0001';
  END IF;
  v_hash := public.hash_phone(v_norm);
  v_hashes := public._phone_hash_candidates(_phone_e164);

  -- Verifica se já está no evento de destino
  SELECT pc.profile_id INTO v_existing_target_pid
    FROM private.profile_contacts pc
   WHERE pc.event_id = _target_event_id
     AND pc.phone_hash = ANY(v_hashes)
   LIMIT 1;

  IF v_existing_target_pid IS NOT NULL THEN
    UPDATE public.profiles SET owner_id = v_uid, updated_at = now()
     WHERE id = v_existing_target_pid;
    RETURN jsonb_build_object(
      'profile_id', v_existing_target_pid,
      'already_registered', true,
      'event_id', _target_event_id
    );
  END IF;

  -- Localiza o perfil de origem mais recente em evento anterior
  SELECT pc.profile_id INTO v_source_pid
    FROM private.profile_contacts pc
    JOIN public.profiles p ON p.id = pc.profile_id
   WHERE pc.phone_hash = ANY(v_hashes)
     AND pc.event_id <> _target_event_id
     AND p.is_demo = false
   ORDER BY pc.created_at DESC
   LIMIT 1;

  IF v_source_pid IS NULL THEN
    RAISE EXCEPTION 'source_profile_not_found' USING ERRCODE='P0001';
  END IF;

  SELECT * INTO v_src_profile FROM public.profiles WHERE id = v_source_pid;
  SELECT * INTO v_src_contact FROM private.profile_contacts WHERE profile_id = v_source_pid LIMIT 1;

  v_new_profile_id := gen_random_uuid();

  -- Cria novo perfil no evento de destino
  INSERT INTO public.profiles (
    id, event_id, owner_id, name, company, city, neighborhood, niche,
    segment_id, target_segment_id, business_type, business_size,
    target_business_type, target_business_size, summary, is_demo,
    created_at, updated_at
  ) VALUES (
    v_new_profile_id, _target_event_id, v_uid,
    v_src_profile.name, v_src_profile.company, v_src_profile.city,
    v_src_profile.neighborhood, v_src_profile.niche,
    v_src_profile.segment_id, v_src_profile.target_segment_id,
    v_src_profile.business_type, v_src_profile.business_size,
    v_src_profile.target_business_type, v_src_profile.target_business_size,
    v_src_profile.summary, false,
    now(), now()
  );

  -- Copia profile_segments
  INSERT INTO public.profile_segments (profile_id, segment_id, is_primary)
  SELECT v_new_profile_id, segment_id, is_primary
    FROM public.profile_segments
   WHERE profile_id = v_source_pid
  ON CONFLICT DO NOTHING;

  -- Copia ofertas
  INSERT INTO public.profile_offers (
    profile_id, event_id, segment_id, text, sort_order,
    label, taxonomy_item_id, source, user_confirmed, active
  )
  SELECT
    v_new_profile_id, _target_event_id, segment_id, text, sort_order,
    label, taxonomy_item_id, 'checkin_cloned', user_confirmed, active
    FROM public.profile_offers
   WHERE profile_id = v_source_pid AND active = true;

  -- Copia necessidades
  INSERT INTO public.profile_needs (
    profile_id, event_id, segment_id, text, sort_order,
    label, taxonomy_item_id, need_kind, is_priority, source, user_confirmed, active
  )
  SELECT
    v_new_profile_id, _target_event_id, segment_id, text, sort_order,
    label, taxonomy_item_id, need_kind, is_priority, 'checkin_cloned', user_confirmed, active
    FROM public.profile_needs
   WHERE profile_id = v_source_pid AND active = true;

  -- Cria contato em private.profile_contacts
  INSERT INTO private.profile_contacts (
    profile_id, event_id, phone_e164, phone_hash, email, contact_sharing_enabled
  ) VALUES (
    v_new_profile_id, _target_event_id,
    v_src_contact.phone_e164, v_src_contact.phone_hash,
    v_src_contact.email, coalesce(v_src_contact.contact_sharing_enabled, true)
  );

  -- Registra consentimento para o novo evento
  INSERT INTO public.consents (
    profile_id, event_id, consent_type, granted, version
  ) VALUES (
    v_new_profile_id, _target_event_id, 'matchmaking', true, 'v2-checkin'
  );

  -- Dispara matchmaking imediato no evento de destino
  PERFORM public._recompute_matches_for_profile(v_new_profile_id, _target_event_id);

  -- Log de auditoria
  INSERT INTO public.audit_logs (event_id, actor_user_id, target_table, target_id, action, after)
  VALUES (
    _target_event_id, v_uid, 'profiles', v_new_profile_id::text, 'participant_checkin_cloned',
    jsonb_build_object(
      'source_profile_id', v_source_pid,
      'source_event_id', v_src_profile.event_id,
      'target_event_id', _target_event_id
    )
  );

  RETURN jsonb_build_object(
    'profile_id', v_new_profile_id,
    'checked_in', true,
    'event_id', _target_event_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.participant_checkin_by_phone(text, text) TO authenticated, service_role;

-- 5. RPC de Check-in Manual por Staff/Admin
CREATE OR REPLACE FUNCTION public.staff_checkin_participant(
  _target_event_id text,
  _source_profile_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_src_profile RECORD;
  v_src_contact RECORD;
  v_new_profile_id uuid;
  v_existing_pid uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501';
  END IF;

  IF NOT (public.has_event_role(_target_event_id, v_uid, 'admin') OR
          public.has_event_role(_target_event_id, v_uid, 'staff') OR
          public.is_staff(v_uid)) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_src_profile FROM public.profiles WHERE id = _source_profile_id;
  IF v_src_profile.id IS NULL THEN
    RAISE EXCEPTION 'source_profile_not_found' USING ERRCODE='P0001';
  END IF;

  SELECT * INTO v_src_contact FROM private.profile_contacts WHERE profile_id = _source_profile_id LIMIT 1;

  -- Se já tiver perfil em _target_event_id com o mesmo phone_hash
  IF v_src_contact.phone_hash IS NOT NULL THEN
    SELECT pc.profile_id INTO v_existing_pid
      FROM private.profile_contacts pc
     WHERE pc.event_id = _target_event_id
       AND pc.phone_hash = v_src_contact.phone_hash
     LIMIT 1;

    IF v_existing_pid IS NOT NULL THEN
      RETURN jsonb_build_object('profile_id', v_existing_pid, 'already_registered', true);
    END IF;
  END IF;

  v_new_profile_id := gen_random_uuid();

  INSERT INTO public.profiles (
    id, event_id, owner_id, name, company, city, neighborhood, niche,
    segment_id, target_segment_id, business_type, business_size,
    target_business_type, target_business_size, summary, is_demo,
    created_at, updated_at
  ) VALUES (
    v_new_profile_id, _target_event_id, v_src_profile.owner_id,
    v_src_profile.name, v_src_profile.company, v_src_profile.city,
    v_src_profile.neighborhood, v_src_profile.niche,
    v_src_profile.segment_id, v_src_profile.target_segment_id,
    v_src_profile.business_type, v_src_profile.business_size,
    v_src_profile.target_business_type, v_src_profile.target_business_size,
    v_src_profile.summary, false,
    now(), now()
  );

  INSERT INTO public.profile_segments (profile_id, segment_id, is_primary)
  SELECT v_new_profile_id, segment_id, is_primary
    FROM public.profile_segments
   WHERE profile_id = _source_profile_id
  ON CONFLICT DO NOTHING;

  INSERT INTO public.profile_offers (
    profile_id, event_id, segment_id, text, sort_order,
    label, taxonomy_item_id, source, user_confirmed, active
  )
  SELECT
    v_new_profile_id, _target_event_id, segment_id, text, sort_order,
    label, taxonomy_item_id, 'staff_checkin', user_confirmed, active
    FROM public.profile_offers
   WHERE profile_id = _source_profile_id AND active = true;

  INSERT INTO public.profile_needs (
    profile_id, event_id, segment_id, text, sort_order,
    label, taxonomy_item_id, need_kind, is_priority, source, user_confirmed, active
  )
  SELECT
    v_new_profile_id, _target_event_id, segment_id, text, sort_order,
    label, taxonomy_item_id, need_kind, is_priority, 'staff_checkin', user_confirmed, active
    FROM public.profile_needs
   WHERE profile_id = _source_profile_id AND active = true;

  IF v_src_contact.profile_id IS NOT NULL THEN
    INSERT INTO private.profile_contacts (
      profile_id, event_id, phone_e164, phone_hash, email, contact_sharing_enabled
    ) VALUES (
      v_new_profile_id, _target_event_id,
      v_src_contact.phone_e164, v_src_contact.phone_hash,
      v_src_contact.email, coalesce(v_src_contact.contact_sharing_enabled, true)
    );
  END IF;

  INSERT INTO public.consents (
    profile_id, event_id, consent_type, granted, version
  ) VALUES (
    v_new_profile_id, _target_event_id, 'matchmaking', true, 'staff-checkin'
  );

  PERFORM public._recompute_matches_for_profile(v_new_profile_id, _target_event_id);

  INSERT INTO public.audit_logs (event_id, actor_user_id, target_table, target_id, action, after)
  VALUES (
    _target_event_id, v_uid, 'profiles', v_new_profile_id::text, 'staff_checkin_participant',
    jsonb_build_object(
      'source_profile_id', _source_profile_id,
      'target_event_id', _target_event_id
    )
  );

  RETURN jsonb_build_object('profile_id', v_new_profile_id, 'checked_in', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.staff_checkin_participant(text, uuid) TO authenticated, service_role;

-- 6. RPC para Listar Eventos Disponíveis no Admin
CREATE OR REPLACE FUNCTION public.admin_list_events()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_res jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501';
  END IF;

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', e.id,
      'name', e.name,
      'city', e.city,
      'starts_at', e.starts_at,
      'ends_at', e.ends_at,
      'is_active', e.is_active,
      'created_at', e.created_at,
      'participants_count', (SELECT count(*)::int FROM public.profiles p WHERE p.event_id = e.id AND p.is_demo = false),
      'matches_count', (SELECT count(*)::int FROM public.matches m WHERE m.event_id = e.id AND m.is_active = true)
    ) ORDER BY e.is_active DESC, e.starts_at DESC NULLS LAST
  ), '[]'::jsonb) INTO v_res
  FROM public.events e;

  RETURN v_res;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_events() TO authenticated, service_role;
