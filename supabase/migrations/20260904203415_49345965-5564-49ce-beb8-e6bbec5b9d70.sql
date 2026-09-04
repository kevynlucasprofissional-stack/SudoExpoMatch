CREATE OR REPLACE FUNCTION public._phone_hash_candidates(_raw text)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH d AS (SELECT regexp_replace(coalesce(_raw, ''), '\D', '', 'g') AS digits),
  variants AS (
    SELECT digits AS v FROM d WHERE digits <> ''
    UNION
    SELECT '55' || digits FROM d WHERE length(digits) IN (10, 11)
    UNION
    SELECT substring(digits from 3) FROM d
      WHERE left(digits, 2) = '55' AND length(digits) IN (12, 13)
  )
  SELECT array_agg(DISTINCT public.hash_phone(v)) FROM variants;
$$;

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
  IF v_recent >= 5 THEN
    RAISE EXCEPTION 'rate_limited' USING ERRCODE='P0001';
  END IF;

  SELECT pc.profile_id INTO v_pid FROM private.profile_contacts pc
    WHERE pc.event_id = _event_id AND pc.phone_hash = ANY(v_hashes) LIMIT 1;

  IF v_pid IS NULL THEN
    INSERT INTO private.phone_claim_attempts(event_id, user_id, phone_hash, succeeded, reason)
      VALUES(_event_id, v_uid, v_hash, false, 'lookup_no_profile');
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT p.name, p.company, p.is_demo INTO v_name, v_company, v_is_demo
    FROM public.profiles p WHERE p.id = v_pid;

  IF v_is_demo IS DISTINCT FROM false THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  v_parts := regexp_split_to_array(btrim(coalesce(v_name, '')), '\s+');

  RETURN jsonb_build_object(
    'found', true,
    'display_name', btrim(
      coalesce(v_parts[1], '') ||
      CASE WHEN array_length(v_parts, 1) > 1
        THEN ' ' || upper(left(v_parts[array_length(v_parts, 1)], 1)) || '.'
        ELSE '' END
    ),
    'company', coalesce(v_company, '')
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_profile_by_phone_simple(_event_id text, _phone_e164 text)
RETURNS TABLE(profile_id uuid, claimed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_norm text;
  v_hash text;
  v_hashes text[];
  v_recent int;
  v_pid uuid;
  v_prev_owner uuid;
  v_is_demo boolean;
  v_profile_event text;
  v_active boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501';
  END IF;

  SELECT e.is_active INTO v_active FROM public.events e WHERE e.id = _event_id;
  IF v_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'event_not_active' USING ERRCODE='P0001';
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
  IF v_recent >= 5 THEN
    RAISE EXCEPTION 'rate_limited' USING ERRCODE='P0001';
  END IF;

  SELECT pc.profile_id INTO v_pid FROM private.profile_contacts pc
    WHERE pc.event_id = _event_id AND pc.phone_hash = ANY(v_hashes) LIMIT 1;

  IF v_pid IS NULL THEN
    INSERT INTO private.phone_claim_attempts(event_id, user_id, phone_hash, succeeded, reason)
      VALUES(_event_id, v_uid, v_hash, false, 'no_profile');
    RAISE EXCEPTION 'claim_failed' USING ERRCODE='P0001';
  END IF;

  SELECT p.owner_id, p.is_demo, p.event_id
    INTO v_prev_owner, v_is_demo, v_profile_event
    FROM public.profiles p WHERE p.id = v_pid FOR UPDATE;

  IF v_profile_event IS DISTINCT FROM _event_id OR v_is_demo THEN
    INSERT INTO private.phone_claim_attempts(event_id, user_id, phone_hash, succeeded, reason)
      VALUES(_event_id, v_uid, v_hash, false, 'not_claimable');
    RAISE EXCEPTION 'claim_failed' USING ERRCODE='P0001';
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles p2
              WHERE p2.event_id = _event_id AND p2.owner_id = v_uid
                AND p2.is_demo = false AND p2.id <> v_pid) THEN
    INSERT INTO private.phone_claim_attempts(event_id, user_id, phone_hash, succeeded, reason)
      VALUES(_event_id, v_uid, v_hash, false, 'ownership_conflict');
    RAISE EXCEPTION 'current_user_already_has_profile' USING ERRCODE='P0001';
  END IF;

  IF v_prev_owner IS NOT DISTINCT FROM v_uid THEN
    INSERT INTO private.phone_claim_attempts(event_id, user_id, phone_hash, succeeded, reason)
      VALUES(_event_id, v_uid, v_hash, true, 'already_owner');
    RETURN QUERY SELECT v_pid, false;
    RETURN;
  END IF;

  UPDATE public.profiles p SET owner_id = v_uid, updated_at = now() WHERE p.id = v_pid;

  UPDATE private.profile_recovery pr
     SET failed_attempts = 0, locked_until = NULL,
         last_recovered_at = now(), updated_at = now()
   WHERE pr.profile_id = v_pid;

  INSERT INTO private.phone_claim_attempts(event_id, user_id, phone_hash, succeeded, reason)
    VALUES(_event_id, v_uid, v_hash, true, 'claimed_phone_only');

  INSERT INTO public.audit_logs(event_id, actor_user_id, target_table, target_id, action, before, after)
    VALUES(_event_id, v_uid, 'profiles', v_pid::text, 'ownership_transfer_phone_only',
           jsonb_build_object('owner_id', v_prev_owner),
           jsonb_build_object('owner_id', v_uid, 'method', 'phone_only',
                              'phone_masked', '****' || right(v_norm, 4)));

  RETURN QUERY SELECT v_pid, true;
END;
$$;

REVOKE ALL ON FUNCTION public._phone_hash_candidates(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._phone_hash_candidates(text) TO authenticated, service_role;