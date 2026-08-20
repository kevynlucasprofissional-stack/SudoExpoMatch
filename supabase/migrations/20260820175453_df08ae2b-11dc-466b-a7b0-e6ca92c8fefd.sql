-- ============================================================
-- L2 (cache persistente) — acesso exclusivo do servidor
-- ============================================================
CREATE OR REPLACE FUNCTION public.social_cache_lookup(_network text, _handle text)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT to_jsonb(c) - 'id'
    FROM private.social_profile_cache c
   WHERE c.network = lower(_network)
     AND c.normalized_handle = lower(_handle)
$$;

REVOKE ALL ON FUNCTION public.social_cache_lookup(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.social_cache_lookup(text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.social_cache_store(_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_network text := lower(COALESCE(_payload->>'network', 'instagram'));
  v_handle  text := lower(COALESCE(_payload->>'normalized_handle', ''));
  v_row     private.social_profile_cache;
BEGIN
  IF v_handle = '' THEN
    RAISE EXCEPTION 'invalid_handle' USING ERRCODE = '22023';
  END IF;

  INSERT INTO private.social_profile_cache AS c (
    network, normalized_handle, canonical_url, provider, provider_version,
    public_profile, extracted_context, ai_analysis, content_fingerprint,
    ai_prompt_version, ai_model, fetched_at, analyzed_at, expires_at,
    last_status, last_error_code
  ) VALUES (
    v_network, v_handle,
    NULLIF(_payload->>'canonical_url',''),
    NULLIF(_payload->>'provider',''),
    NULLIF(_payload->>'provider_version',''),
    COALESCE(_payload->'public_profile', 'null'::jsonb),
    COALESCE(_payload->'extracted_context', 'null'::jsonb),
    COALESCE(_payload->'ai_analysis', 'null'::jsonb),
    NULLIF(_payload->>'content_fingerprint',''),
    NULLIF(_payload->>'ai_prompt_version',''),
    NULLIF(_payload->>'ai_model',''),
    COALESCE((_payload->>'fetched_at')::timestamptz, now()),
    (_payload->>'analyzed_at')::timestamptz,
    (_payload->>'expires_at')::timestamptz,
    COALESCE(NULLIF(_payload->>'last_status',''), 'ok'),
    NULLIF(_payload->>'last_error_code','')
  )
  ON CONFLICT (network, normalized_handle) DO UPDATE SET
    canonical_url      = COALESCE(EXCLUDED.canonical_url, c.canonical_url),
    provider           = COALESCE(EXCLUDED.provider, c.provider),
    provider_version   = COALESCE(EXCLUDED.provider_version, c.provider_version),
    public_profile     = COALESCE(EXCLUDED.public_profile, c.public_profile),
    extracted_context  = COALESCE(EXCLUDED.extracted_context, c.extracted_context),
    ai_analysis        = COALESCE(EXCLUDED.ai_analysis, c.ai_analysis),
    content_fingerprint= COALESCE(EXCLUDED.content_fingerprint, c.content_fingerprint),
    ai_prompt_version  = COALESCE(EXCLUDED.ai_prompt_version, c.ai_prompt_version),
    ai_model           = COALESCE(EXCLUDED.ai_model, c.ai_model),
    fetched_at         = COALESCE(EXCLUDED.fetched_at, c.fetched_at),
    analyzed_at        = COALESCE(EXCLUDED.analyzed_at, c.analyzed_at),
    expires_at         = EXCLUDED.expires_at,
    last_status        = EXCLUDED.last_status,
    last_error_code    = EXCLUDED.last_error_code,
    updated_at         = now()
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row) - 'id';
END;
$$;

REVOKE ALL ON FUNCTION public.social_cache_store(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.social_cache_store(jsonb) TO service_role;

-- ============================================================
-- Atualização administrativa do vínculo (rate-limited + auditada)
-- ============================================================
CREATE OR REPLACE FUNCTION public.service_refresh_profile_social(
  _profile_id uuid,
  _actor_user_id uuid,
  _network text DEFAULT 'instagram'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_net    text := lower(COALESCE(_network, 'instagram'));
  v_link   private.profile_social_profiles;
  v_cache  private.social_profile_cache;
BEGIN
  SELECT * INTO v_link
    FROM private.profile_social_profiles
   WHERE profile_id = _profile_id AND network = v_net;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'social_not_linked' USING ERRCODE = 'P0002';
  END IF;

  -- Anti-spam: no máximo uma atualização a cada 10 minutos por perfil.
  IF v_link.updated_at > now() - interval '10 minutes' THEN
    RAISE EXCEPTION 'refresh_too_soon' USING ERRCODE = '55000';
  END IF;

  SELECT * INTO v_cache
    FROM private.social_profile_cache
   WHERE network = v_net AND normalized_handle = v_link.normalized_handle;

  UPDATE private.profile_social_profiles
     SET social_cache_id    = COALESCE(v_cache.id, social_cache_id),
         context_snapshot   = COALESCE(v_cache.extracted_context, context_snapshot),
         analysis_snapshot  = COALESCE(v_cache.ai_analysis, analysis_snapshot),
         updated_at         = now()
   WHERE profile_id = _profile_id AND network = v_net;

  INSERT INTO public.audit_logs (event_id, actor_user_id, target_table, target_id, action, after)
  VALUES (
    v_link.event_id, _actor_user_id, 'profile_social_profiles', _profile_id::text,
    'social_refresh',
    jsonb_build_object('handle', v_link.normalized_handle, 'network', v_net,
                       'provider', v_cache.provider, 'fetched_at', v_cache.fetched_at)
  );

  RETURN jsonb_build_object('status', 'refreshed', 'handle', v_link.normalized_handle);
END;
$$;

REVOKE ALL ON FUNCTION public.service_refresh_profile_social(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_refresh_profile_social(uuid, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.service_get_profile_social_handle(_profile_id uuid, _network text DEFAULT 'instagram')
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
           'handle', l.normalized_handle,
           'event_id', l.event_id,
           'updated_at', l.updated_at
         )
    FROM private.profile_social_profiles l
   WHERE l.profile_id = _profile_id AND l.network = lower(_network)
$$;

REVOKE ALL ON FUNCTION public.service_get_profile_social_handle(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.service_get_profile_social_handle(uuid, text) TO service_role;