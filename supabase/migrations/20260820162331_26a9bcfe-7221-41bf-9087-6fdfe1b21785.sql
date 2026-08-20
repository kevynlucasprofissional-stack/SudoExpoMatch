-- Tentativas de claim por telefone verificado (uso interno, sem PII em claro).
CREATE TABLE IF NOT EXISTS private.phone_claim_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text,
  user_id uuid,
  phone_hash text,
  succeeded boolean NOT NULL DEFAULT false,
  reason text,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS phone_claim_attempts_hash_idx
  ON private.phone_claim_attempts (phone_hash, attempted_at DESC);
CREATE INDEX IF NOT EXISTS phone_claim_attempts_user_idx
  ON private.phone_claim_attempts (user_id, attempted_at DESC);

ALTER TABLE private.phone_claim_attempts ENABLE ROW LEVEL SECURITY;

-- Assume o perfil do evento a partir do telefone JÁ VERIFICADO na identidade
-- autenticada. O cliente não envia telefone: a fonte é auth.users.
CREATE OR REPLACE FUNCTION public.claim_profile_by_verified_phone(_event_id text)
RETURNS TABLE(profile_id uuid, claimed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_phone text;
  v_confirmed timestamptz;
  v_norm text;
  v_hash text;
  v_pid uuid;
  v_prev_owner uuid;
  v_is_demo boolean;
  v_profile_event text;
  v_recent int;
  v_active boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501';
  END IF;

  SELECT u.phone, u.phone_confirmed_at INTO v_phone, v_confirmed
    FROM auth.users u WHERE u.id = v_uid;

  IF v_phone IS NULL OR v_phone = '' OR v_confirmed IS NULL THEN
    RAISE EXCEPTION 'phone_not_verified' USING ERRCODE='42501';
  END IF;

  SELECT e.is_active INTO v_active FROM public.events e WHERE e.id = _event_id;
  IF v_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'event_not_active' USING ERRCODE='P0001';
  END IF;

  v_norm := public.normalize_phone(v_phone);
  v_hash := public.hash_phone(v_norm);

  -- Rate limit por conta e por número (anti brute force / enumeração).
  SELECT COUNT(*) INTO v_recent FROM private.phone_claim_attempts a
    WHERE (a.user_id = v_uid OR a.phone_hash = v_hash)
      AND a.attempted_at > now() - interval '15 minutes';
  IF v_recent >= 10 THEN
    RAISE EXCEPTION 'rate_limited' USING ERRCODE='P0001';
  END IF;

  SELECT pc.profile_id INTO v_pid FROM private.profile_contacts pc
    WHERE pc.event_id = _event_id AND pc.phone_hash = v_hash LIMIT 1;

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

  -- Já é dono: idempotente, sem transferência nem auditoria extra.
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
    VALUES(_event_id, v_uid, v_hash, true, 'claimed');

  INSERT INTO public.audit_logs(event_id, actor_user_id, target_table, target_id, action, before, after)
    VALUES(_event_id, v_uid, 'profiles', v_pid::text, 'ownership_transfer_verified_phone',
           jsonb_build_object('owner_id', v_prev_owner),
           jsonb_build_object('owner_id', v_uid, 'method', 'verified_phone'));

  RETURN QUERY SELECT v_pid, true;
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_profile_by_verified_phone(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_profile_by_verified_phone(text) TO authenticated;