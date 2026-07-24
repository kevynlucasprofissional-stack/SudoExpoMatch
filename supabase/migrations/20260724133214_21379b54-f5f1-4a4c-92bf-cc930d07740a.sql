
CREATE OR REPLACE FUNCTION public.recover_profile_v2(_event_id text, _phone_e164 text, _code text)
RETURNS TABLE(profile_id uuid, new_recovery_code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_norm text; v_hash text; v_pid uuid; v_prev_owner uuid;
  v_is_demo boolean;
  v_locked_until timestamptz;
  v_failed_attempts int;
  v_recovery_hash text;
  v_recent int;
  v_new_code text;
  v_profile_event text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;
  v_norm := public.normalize_phone(_phone_e164);
  IF v_norm IS NULL OR _code IS NULL OR length(_code) < 4 THEN
    RAISE EXCEPTION 'invalid_input' USING ERRCODE='22023';
  END IF;
  v_hash := public.hash_phone(v_norm);

  SELECT COUNT(*) INTO v_recent FROM private.recovery_attempts ra
    WHERE ra.event_id=_event_id AND ra.phone_hash=v_hash
      AND ra.attempted_at > now() - interval '15 minutes';
  IF v_recent >= 10 THEN RAISE EXCEPTION 'rate_limited' USING ERRCODE='P0001'; END IF;

  SELECT pc.profile_id INTO v_pid FROM private.profile_contacts pc
   WHERE pc.event_id=_event_id AND pc.phone_hash=v_hash LIMIT 1;
  IF v_pid IS NULL THEN
    INSERT INTO private.recovery_attempts(event_id, phone_hash, succeeded) VALUES(_event_id, v_hash, false);
    RAISE EXCEPTION 'not_found' USING ERRCODE='P0001';
  END IF;

  SELECT p.owner_id, p.is_demo, p.event_id INTO v_prev_owner, v_is_demo, v_profile_event
    FROM public.profiles p WHERE p.id = v_pid FOR UPDATE;
  IF v_profile_event IS DISTINCT FROM _event_id THEN
    INSERT INTO private.recovery_attempts(event_id, phone_hash, succeeded) VALUES(_event_id, v_hash, false);
    RAISE EXCEPTION 'not_found' USING ERRCODE='P0001';
  END IF;
  IF v_is_demo THEN
    RAISE EXCEPTION 'demo_not_recoverable' USING ERRCODE='P0001';
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles p2
              WHERE p2.event_id=_event_id AND p2.owner_id=v_uid
                AND p2.is_demo=false AND p2.id <> v_pid) THEN
    RAISE EXCEPTION 'current_user_already_has_profile' USING ERRCODE='P0001';
  END IF;

  SELECT pr.locked_until, pr.failed_attempts, pr.recovery_code_hash
    INTO v_locked_until, v_failed_attempts, v_recovery_hash
    FROM private.profile_recovery pr WHERE pr.profile_id=v_pid FOR UPDATE;

  IF v_recovery_hash IS NULL THEN
    RAISE EXCEPTION 'recovery_not_configured' USING ERRCODE='P0001';
  END IF;
  IF v_locked_until IS NOT NULL AND v_locked_until > now() THEN
    RAISE EXCEPTION 'locked' USING ERRCODE='P0001';
  END IF;

  IF NOT public.verify_recovery_code(_code, v_recovery_hash) THEN
    UPDATE private.profile_recovery pr
      SET failed_attempts = pr.failed_attempts + 1,
          locked_until = CASE WHEN pr.failed_attempts+1 >= 5 THEN now()+interval '15 minutes' ELSE pr.locked_until END,
          updated_at = now()
     WHERE pr.profile_id = v_pid;
    INSERT INTO private.recovery_attempts(event_id, phone_hash, succeeded) VALUES(_event_id, v_hash, false);
    RAISE EXCEPTION 'invalid_code' USING ERRCODE='P0001';
  END IF;

  v_new_code := upper(substring(encode(extensions.gen_random_bytes(6),'hex') from 1 for 8));
  UPDATE private.profile_recovery pr
     SET recovery_code_hash = public.hash_recovery_code(v_new_code),
         code_rotated_at = now(), failed_attempts = 0, locked_until = NULL,
         last_recovered_at = now(), updated_at = now()
   WHERE pr.profile_id = v_pid;

  INSERT INTO private.recovery_attempts(event_id, phone_hash, succeeded) VALUES(_event_id, v_hash, true);

  UPDATE public.profiles p SET owner_id = v_uid, updated_at = now() WHERE p.id = v_pid;

  INSERT INTO public.audit_logs(event_id, actor_user_id, target_table, target_id, action, before, after)
  VALUES (_event_id, v_uid, 'profiles', v_pid::text, 'ownership_transfer',
          jsonb_build_object('previous_owner', v_prev_owner),
          jsonb_build_object('new_owner', v_uid));

  profile_id := v_pid;
  new_recovery_code := v_new_code;
  RETURN NEXT;
END $function$;
