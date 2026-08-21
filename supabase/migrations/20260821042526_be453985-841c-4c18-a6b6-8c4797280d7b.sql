-- 1) link_own_social_profile: o cliente NUNCA escreve contexto no cache global.
CREATE OR REPLACE FUNCTION public.link_own_social_profile(_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_event text := _payload->>'event_id';
  v_network text := COALESCE(NULLIF(_payload->>'network',''), 'instagram');
  v_raw text := _payload->>'handle';
  v_handle text;
  v_profile_id uuid;
  v_cache private.social_profile_cache;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;
  IF v_network <> 'instagram' THEN RAISE EXCEPTION 'invalid_input' USING ERRCODE='22023'; END IF;

  SELECT id INTO v_profile_id FROM public.profiles
   WHERE event_id = v_event AND owner_id = v_uid AND is_demo = false
   LIMIT 1;
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'profile_not_found' USING ERRCODE='P0002'; END IF;

  v_handle := public._normalize_social_handle(v_raw);

  IF v_handle IS NULL THEN
    DELETE FROM private.profile_social_profiles
     WHERE profile_id = v_profile_id AND network = v_network;
    RETURN jsonb_build_object('status','unlinked');
  END IF;

  -- Cria a linha do cache apenas se ela ainda nao existir, SEM conteudo.
  -- Nenhum campo de conteudo do cache existente e alterado aqui.
  INSERT INTO private.social_profile_cache (
    network, normalized_handle, canonical_url,
    public_profile, extracted_context, last_status
  ) VALUES (
    v_network, v_handle,
    'https://www.instagram.com/' || v_handle || '/',
    '{}'::jsonb, '{}'::jsonb, 'informed'
  )
  ON CONFLICT (network, normalized_handle) DO NOTHING;

  SELECT * INTO v_cache FROM private.social_profile_cache
   WHERE network = v_network AND normalized_handle = v_handle;

  INSERT INTO private.profile_social_profiles AS l (
    profile_id, event_id, network, normalized_handle, original_input,
    social_cache_id, context_snapshot, analysis_snapshot
  ) VALUES (
    v_profile_id, v_event, v_network, v_handle,
    left(COALESCE(v_raw,''), 300),
    v_cache.id, v_cache.extracted_context, v_cache.ai_analysis
  )
  ON CONFLICT (profile_id, network) DO UPDATE
     SET normalized_handle = EXCLUDED.normalized_handle,
         original_input    = EXCLUDED.original_input,
         social_cache_id   = EXCLUDED.social_cache_id,
         context_snapshot  = EXCLUDED.context_snapshot,
         analysis_snapshot = EXCLUDED.analysis_snapshot,
         updated_at        = now();

  RETURN jsonb_build_object(
    'status','linked',
    'handle', v_handle,
    'cache_id', v_cache.id,
    'reused_cache', (v_cache.extracted_context <> '{}'::jsonb)
  );
END;
$fn$;

-- 2) service_refresh_profile_social: vira PORTAO de recoleta real.
DROP FUNCTION IF EXISTS public.service_refresh_profile_social(uuid, uuid, text);
CREATE OR REPLACE FUNCTION public.service_refresh_profile_social(
  _profile_id uuid, _actor_user_id uuid, _network text DEFAULT 'instagram'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_net   text := lower(COALESCE(_network, 'instagram'));
  v_link  private.profile_social_profiles;
  v_cache private.social_profile_cache;
BEGIN
  SELECT * INTO v_link
    FROM private.profile_social_profiles
   WHERE profile_id = _profile_id AND network = v_net;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'social_not_linked' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (public.has_event_role(v_link.event_id, _actor_user_id, 'admin')
          OR public.has_event_role(v_link.event_id, _actor_user_id, 'staff')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_link.updated_at > now() - interval '10 minutes' THEN
    RAISE EXCEPTION 'refresh_too_soon' USING ERRCODE = '55000';
  END IF;

  -- Invalida o cache para que o servidor faca coleta REAL no provider.
  UPDATE private.social_profile_cache
     SET expires_at = now(), updated_at = now()
   WHERE network = v_net AND normalized_handle = v_link.normalized_handle
  RETURNING * INTO v_cache;

  UPDATE private.profile_social_profiles
     SET updated_at = now()
   WHERE profile_id = _profile_id AND network = v_net;

  INSERT INTO public.audit_logs (event_id, actor_user_id, target_table, target_id, action, after)
  VALUES (
    v_link.event_id, _actor_user_id, 'profile_social_profiles', _profile_id::text,
    'social_refresh_requested',
    jsonb_build_object('handle', v_link.normalized_handle, 'network', v_net)
  );

  RETURN jsonb_build_object(
    'status', 'refresh_authorized',
    'allowed', true,
    'handle', v_link.normalized_handle,
    'network', v_net,
    'event_id', v_link.event_id
  );
END;
$fn$;

-- 3) Reparo: contexto legado (snake_case) vira vencido para forcar recoleta.
UPDATE private.social_profile_cache
   SET expires_at = now(),
       last_status = 'stale_shape',
       updated_at = now()
 WHERE extracted_context IS NOT NULL
   AND (extracted_context ? 'recent_media'
        OR extracted_context ? 'display_name'
        OR extracted_context ? 'followers_count'
        OR extracted_context ? 'fetched_at');
