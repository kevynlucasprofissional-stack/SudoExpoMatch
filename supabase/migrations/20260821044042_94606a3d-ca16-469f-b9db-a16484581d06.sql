ALTER TABLE private.social_profile_cache
  ADD COLUMN IF NOT EXISTS provider_payload jsonb,
  ADD COLUMN IF NOT EXISTS provider_payload_version text,
  ADD COLUMN IF NOT EXISTS provider_payload_bytes integer,
  ADD COLUMN IF NOT EXISTS provider_payload_truncated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS provider_posts_received integer,
  ADD COLUMN IF NOT EXISTS provider_posts_persisted integer,
  ADD COLUMN IF NOT EXISTS ai_posts_used integer,
  ADD COLUMN IF NOT EXISTS context_schema_version text;

ALTER TABLE private.profile_social_profiles
  ADD COLUMN IF NOT EXISTS provider_payload_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS provider_payload_version text,
  ADD COLUMN IF NOT EXISTS provider_fetched_at timestamptz;

CREATE OR REPLACE FUNCTION public.social_cache_lookup(_network text, _handle text)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT to_jsonb(c) - 'id' - 'provider_payload'
    FROM private.social_profile_cache c
   WHERE c.network = lower(_network)
     AND c.normalized_handle = lower(_handle)
$function$;

CREATE OR REPLACE FUNCTION public.social_cache_store(_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    last_status, last_error_code,
    provider_payload, provider_payload_version, provider_payload_bytes,
    provider_payload_truncated, provider_posts_received,
    provider_posts_persisted, ai_posts_used, context_schema_version
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
    NULLIF(_payload->>'last_error_code',''),
    CASE WHEN jsonb_typeof(_payload->'provider_payload') = 'object'
         THEN _payload->'provider_payload' END,
    NULLIF(_payload->>'provider_payload_version',''),
    NULLIF(_payload->>'provider_payload_bytes','')::integer,
    COALESCE((_payload->>'provider_payload_truncated')::boolean, false),
    NULLIF(_payload->>'provider_posts_received','')::integer,
    NULLIF(_payload->>'provider_posts_persisted','')::integer,
    NULLIF(_payload->>'ai_posts_used','')::integer,
    NULLIF(_payload->>'context_schema_version','')
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
    provider_payload           = COALESCE(EXCLUDED.provider_payload, c.provider_payload),
    provider_payload_version   = COALESCE(EXCLUDED.provider_payload_version, c.provider_payload_version),
    provider_payload_bytes     = COALESCE(EXCLUDED.provider_payload_bytes, c.provider_payload_bytes),
    provider_payload_truncated = CASE WHEN EXCLUDED.provider_payload IS NOT NULL
                                      THEN EXCLUDED.provider_payload_truncated
                                      ELSE c.provider_payload_truncated END,
    provider_posts_received    = COALESCE(EXCLUDED.provider_posts_received, c.provider_posts_received),
    provider_posts_persisted   = COALESCE(EXCLUDED.provider_posts_persisted, c.provider_posts_persisted),
    ai_posts_used              = COALESCE(EXCLUDED.ai_posts_used, c.ai_posts_used),
    context_schema_version     = COALESCE(EXCLUDED.context_schema_version, c.context_schema_version),
    updated_at         = now()
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row) - 'id' - 'provider_payload';
END;
$function$;

CREATE OR REPLACE FUNCTION public.link_own_social_profile(_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    social_cache_id, context_snapshot, analysis_snapshot,
    provider_payload_snapshot, provider_payload_version, provider_fetched_at
  ) VALUES (
    v_profile_id, v_event, v_network, v_handle,
    left(COALESCE(v_raw,''), 300),
    v_cache.id, v_cache.extracted_context, v_cache.ai_analysis,
    v_cache.provider_payload, v_cache.provider_payload_version, v_cache.fetched_at
  )
  ON CONFLICT (profile_id, network) DO UPDATE
     SET normalized_handle = EXCLUDED.normalized_handle,
         original_input    = EXCLUDED.original_input,
         social_cache_id   = EXCLUDED.social_cache_id,
         context_snapshot  = EXCLUDED.context_snapshot,
         analysis_snapshot = EXCLUDED.analysis_snapshot,
         provider_payload_snapshot = COALESCE(EXCLUDED.provider_payload_snapshot, l.provider_payload_snapshot),
         provider_payload_version  = COALESCE(EXCLUDED.provider_payload_version, l.provider_payload_version),
         provider_fetched_at       = COALESCE(EXCLUDED.provider_fetched_at, l.provider_fetched_at),
         updated_at        = now();

  RETURN jsonb_build_object(
    'status','linked',
    'handle', v_handle,
    'cache_id', v_cache.id,
    'reused_cache', (v_cache.extracted_context <> '{}'::jsonb)
  );
END;
$function$;