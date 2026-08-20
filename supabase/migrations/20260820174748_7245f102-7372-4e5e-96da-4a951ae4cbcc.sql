-- ============ 1. tabelas privadas ============
CREATE TABLE IF NOT EXISTS private.social_profile_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  network text NOT NULL DEFAULT 'instagram',
  normalized_handle text NOT NULL,
  canonical_url text,
  provider text,
  provider_version text,
  public_profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  extracted_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  ai_analysis jsonb,
  content_fingerprint text,
  ai_prompt_version text,
  ai_model text,
  fetched_at timestamptz,
  analyzed_at timestamptz,
  expires_at timestamptz,
  last_status text NOT NULL DEFAULT 'unknown',
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT social_profile_cache_network_chk CHECK (network IN ('instagram')),
  CONSTRAINT social_profile_cache_handle_chk CHECK (normalized_handle ~ '^[a-z0-9._]{1,30}$'),
  CONSTRAINT social_profile_cache_unique UNIQUE (network, normalized_handle)
);

CREATE TABLE IF NOT EXISTS private.profile_social_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_id text NOT NULL REFERENCES public.events(id),
  network text NOT NULL DEFAULT 'instagram',
  normalized_handle text NOT NULL,
  original_input text,
  social_cache_id uuid REFERENCES private.social_profile_cache(id) ON DELETE SET NULL,
  context_snapshot jsonb,
  analysis_snapshot jsonb,
  linked_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profile_social_network_chk CHECK (network IN ('instagram')),
  CONSTRAINT profile_social_handle_chk CHECK (normalized_handle ~ '^[a-z0-9._]{1,30}$'),
  CONSTRAINT profile_social_unique UNIQUE (profile_id, network)
);

CREATE INDEX IF NOT EXISTS profile_social_profiles_event_idx
  ON private.profile_social_profiles (event_id, normalized_handle);

ALTER TABLE private.social_profile_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.profile_social_profiles ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON private.social_profile_cache FROM anon, authenticated;
REVOKE ALL ON private.profile_social_profiles FROM anon, authenticated;
GRANT ALL ON private.social_profile_cache TO service_role;
GRANT ALL ON private.profile_social_profiles TO service_role;

DROP TRIGGER IF EXISTS set_updated_at_social_cache ON private.social_profile_cache;
CREATE TRIGGER set_updated_at_social_cache BEFORE UPDATE ON private.social_profile_cache
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS set_updated_at_profile_social ON private.profile_social_profiles;
CREATE TRIGGER set_updated_at_profile_social BEFORE UPDATE ON private.profile_social_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ 2. helpers ============
CREATE OR REPLACE FUNCTION public._normalize_social_handle(_raw text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE v text := lower(btrim(COALESCE(_raw,'')));
BEGIN
  IF v = '' THEN RETURN NULL; END IF;
  v := regexp_replace(v, '^https?://', '');
  v := regexp_replace(v, '^(www\.)?instagram\.com/', '');
  v := split_part(v, '?', 1);
  v := split_part(v, '/', 1);
  v := regexp_replace(v, '^@+', '');
  IF v !~ '^[a-z0-9._]{1,30}$' THEN RETURN NULL; END IF;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public._social_cache_json(_c private.social_profile_cache, _with_ai boolean)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'network', _c.network,
    'handle', _c.normalized_handle,
    'canonical_url', _c.canonical_url,
    'provider', _c.provider,
    'provider_version', _c.provider_version,
    'public_profile', _c.public_profile,
    'extracted_context', _c.extracted_context,
    'ai_analysis', CASE WHEN _with_ai THEN _c.ai_analysis ELSE NULL END,
    'ai_prompt_version', CASE WHEN _with_ai THEN _c.ai_prompt_version ELSE NULL END,
    'ai_model', CASE WHEN _with_ai THEN _c.ai_model ELSE NULL END,
    'content_fingerprint', _c.content_fingerprint,
    'fetched_at', _c.fetched_at,
    'analyzed_at', _c.analyzed_at,
    'expires_at', _c.expires_at,
    'last_status', _c.last_status,
    'last_error_code', _c.last_error_code,
    'updated_at', _c.updated_at
  )
$$;

-- ============ 3. participante: salvar / remover vínculo ============
CREATE OR REPLACE FUNCTION public.link_own_social_profile(_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_event text := _payload->>'event_id';
  v_network text := COALESCE(NULLIF(_payload->>'network',''), 'instagram');
  v_raw text := _payload->>'handle';
  v_handle text;
  v_profile_id uuid;
  v_cache private.social_profile_cache;
  v_ctx jsonb := CASE WHEN jsonb_typeof(_payload->'extracted_context') = 'object'
                      THEN _payload->'extracted_context' ELSE NULL END;
  v_pub jsonb := CASE WHEN jsonb_typeof(_payload->'public_profile') = 'object'
                      THEN _payload->'public_profile' ELSE NULL END;
  v_ai jsonb  := CASE WHEN jsonb_typeof(_payload->'ai_analysis') = 'object'
                      THEN _payload->'ai_analysis' ELSE NULL END;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;
  IF v_network <> 'instagram' THEN RAISE EXCEPTION 'invalid_input' USING ERRCODE='22023'; END IF;

  SELECT id INTO v_profile_id FROM public.profiles
   WHERE event_id = v_event AND owner_id = v_uid AND is_demo = false
   LIMIT 1;
  IF v_profile_id IS NULL THEN RAISE EXCEPTION 'profile_not_found' USING ERRCODE='P0002'; END IF;

  v_handle := public._normalize_social_handle(v_raw);

  -- Sem handle válido => remove o vínculo atual (nunca bloqueia o cadastro).
  IF v_handle IS NULL THEN
    DELETE FROM private.profile_social_profiles
     WHERE profile_id = v_profile_id AND network = v_network;
    RETURN jsonb_build_object('status','unlinked');
  END IF;

  INSERT INTO private.social_profile_cache AS c (
    network, normalized_handle, canonical_url, provider, provider_version,
    public_profile, extracted_context, ai_analysis, content_fingerprint,
    ai_prompt_version, ai_model, fetched_at, analyzed_at, expires_at,
    last_status, last_error_code
  ) VALUES (
    v_network, v_handle,
    'https://www.instagram.com/' || v_handle || '/',
    NULLIF(_payload->>'provider',''),
    NULLIF(_payload->>'provider_version',''),
    COALESCE(v_pub, '{}'::jsonb),
    COALESCE(v_ctx, '{}'::jsonb),
    v_ai,
    NULLIF(_payload->>'content_fingerprint',''),
    NULLIF(_payload->>'ai_prompt_version',''),
    NULLIF(_payload->>'ai_model',''),
    CASE WHEN v_ctx IS NOT NULL OR v_pub IS NOT NULL THEN now() ELSE NULL END,
    CASE WHEN v_ai IS NOT NULL THEN now() ELSE NULL END,
    CASE WHEN v_ctx IS NOT NULL OR v_pub IS NOT NULL THEN now() + interval '30 days' ELSE NULL END,
    COALESCE(NULLIF(_payload->>'last_status',''),
             CASE WHEN v_ctx IS NOT NULL THEN 'ok' ELSE 'informed' END),
    NULLIF(_payload->>'last_error_code','')
  )
  ON CONFLICT (network, normalized_handle) DO UPDATE
     SET public_profile     = COALESCE(v_pub, c.public_profile),
         extracted_context  = COALESCE(v_ctx, c.extracted_context),
         ai_analysis        = COALESCE(v_ai, c.ai_analysis),
         provider           = COALESCE(NULLIF(EXCLUDED.provider,''), c.provider),
         provider_version   = COALESCE(NULLIF(EXCLUDED.provider_version,''), c.provider_version),
         content_fingerprint= COALESCE(NULLIF(EXCLUDED.content_fingerprint,''), c.content_fingerprint),
         ai_prompt_version  = COALESCE(NULLIF(EXCLUDED.ai_prompt_version,''), c.ai_prompt_version),
         ai_model           = COALESCE(NULLIF(EXCLUDED.ai_model,''), c.ai_model),
         fetched_at         = COALESCE(EXCLUDED.fetched_at, c.fetched_at),
         analyzed_at        = COALESCE(EXCLUDED.analyzed_at, c.analyzed_at),
         expires_at         = COALESCE(EXCLUDED.expires_at, c.expires_at),
         last_status        = CASE WHEN v_ctx IS NOT NULL THEN EXCLUDED.last_status ELSE c.last_status END,
         last_error_code    = COALESCE(NULLIF(EXCLUDED.last_error_code,''), c.last_error_code),
         updated_at         = now()
  RETURNING * INTO v_cache;

  INSERT INTO private.profile_social_profiles AS l (
    profile_id, event_id, network, normalized_handle, original_input,
    social_cache_id, context_snapshot, analysis_snapshot
  ) VALUES (
    v_profile_id, v_event, v_network, v_handle,
    left(COALESCE(v_raw,''), 300),
    v_cache.id,
    COALESCE(v_ctx, v_cache.extracted_context),
    COALESCE(v_ai, v_cache.ai_analysis)
  )
  ON CONFLICT (profile_id, network) DO UPDATE
     SET normalized_handle = EXCLUDED.normalized_handle,
         original_input    = EXCLUDED.original_input,
         social_cache_id   = EXCLUDED.social_cache_id,
         context_snapshot  = CASE WHEN l.normalized_handle <> EXCLUDED.normalized_handle
                                  THEN EXCLUDED.context_snapshot
                                  ELSE COALESCE(v_ctx, l.context_snapshot) END,
         analysis_snapshot = CASE WHEN l.normalized_handle <> EXCLUDED.normalized_handle
                                  THEN EXCLUDED.analysis_snapshot
                                  ELSE COALESCE(v_ai, l.analysis_snapshot) END,
         updated_at        = now();

  RETURN jsonb_build_object(
    'status','linked',
    'handle', v_handle,
    'cache_id', v_cache.id,
    'reused_cache', (v_ctx IS NULL AND v_cache.extracted_context <> '{}'::jsonb)
  );
END $$;

CREATE OR REPLACE FUNCTION public.get_own_social_profile(_event_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_profile_id uuid;
  v_link private.profile_social_profiles;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;
  SELECT id INTO v_profile_id FROM public.profiles
   WHERE event_id = _event_id AND owner_id = v_uid AND is_demo = false LIMIT 1;
  IF v_profile_id IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO v_link FROM private.profile_social_profiles
   WHERE profile_id = v_profile_id AND network = 'instagram';
  IF v_link.id IS NULL THEN RETURN NULL; END IF;

  RETURN jsonb_build_object(
    'network', v_link.network,
    'handle', v_link.normalized_handle,
    'original_input', v_link.original_input,
    'canonical_url', 'https://www.instagram.com/' || v_link.normalized_handle || '/',
    'context_snapshot', v_link.context_snapshot,
    'linked_at', v_link.linked_at,
    'updated_at', v_link.updated_at
  );
END $$;

-- ============ 4. equipe e admin ============
CREATE OR REPLACE FUNCTION public.staff_get_participant_social(_profile_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_p public.profiles;
  v_link private.profile_social_profiles;
  v_cache private.social_profile_cache;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_p FROM public.profiles WHERE id = _profile_id;
  IF v_p.id IS NULL THEN RAISE EXCEPTION 'not_found' USING ERRCODE='P0002'; END IF;
  IF NOT public.has_any_event_role(v_p.event_id, v_uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_link FROM private.profile_social_profiles
   WHERE profile_id = v_p.id AND network = 'instagram';
  IF v_link.id IS NOT NULL THEN
    SELECT * INTO v_cache FROM private.social_profile_cache WHERE id = v_link.social_cache_id;
  END IF;

  RETURN jsonb_build_object(
    'profile', jsonb_build_object(
      'id', v_p.id,
      'event_id', v_p.event_id,
      'business_size', v_p.business_size,
      'business_type', v_p.business_type,
      'niche', v_p.niche,
      'segment_id', v_p.segment_id,
      'summary', v_p.summary
    ),
    'social', CASE WHEN v_link.id IS NULL THEN NULL ELSE jsonb_build_object(
      'network', v_link.network,
      'handle', v_link.normalized_handle,
      'canonical_url', 'https://www.instagram.com/' || v_link.normalized_handle || '/',
      'context_snapshot', v_link.context_snapshot,
      'linked_at', v_link.linked_at,
      'updated_at', v_link.updated_at,
      'cache', CASE WHEN v_cache.id IS NULL THEN NULL
                    ELSE public._social_cache_json(v_cache, false) END
    ) END
  );
END $$;

CREATE OR REPLACE FUNCTION public.admin_get_participant_social(_profile_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid;
  v_p public.profiles;
  v_link private.profile_social_profiles;
  v_cache private.social_profile_cache;
BEGIN
  SELECT * INTO v_p FROM public.profiles WHERE id = _profile_id;
  IF v_p.id IS NULL THEN RAISE EXCEPTION 'not_found' USING ERRCODE='P0002'; END IF;
  v_uid := public._admin_require_event_admin(v_p.event_id);

  SELECT * INTO v_link FROM private.profile_social_profiles
   WHERE profile_id = v_p.id AND network = 'instagram';
  IF v_link.id IS NOT NULL THEN
    SELECT * INTO v_cache FROM private.social_profile_cache WHERE id = v_link.social_cache_id;
  END IF;

  INSERT INTO public.audit_logs(event_id, actor_user_id, target_table, target_id, action)
  VALUES (v_p.event_id, v_uid, 'profile_social_profiles', v_p.id::text, 'admin_read_social');

  RETURN jsonb_build_object(
    'profile', jsonb_build_object(
      'id', v_p.id,
      'event_id', v_p.event_id,
      'business_size', v_p.business_size,
      'business_type', v_p.business_type,
      'niche', v_p.niche,
      'segment_id', v_p.segment_id,
      'summary', v_p.summary
    ),
    'social', CASE WHEN v_link.id IS NULL THEN NULL ELSE jsonb_build_object(
      'network', v_link.network,
      'handle', v_link.normalized_handle,
      'original_input', v_link.original_input,
      'canonical_url', 'https://www.instagram.com/' || v_link.normalized_handle || '/',
      'context_snapshot', v_link.context_snapshot,
      'analysis_snapshot', v_link.analysis_snapshot,
      'linked_at', v_link.linked_at,
      'updated_at', v_link.updated_at,
      'cache', CASE WHEN v_cache.id IS NULL THEN NULL
                    ELSE public._social_cache_json(v_cache, true) END
    ) END
  );
END $$;

REVOKE ALL ON FUNCTION public.link_own_social_profile(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_own_social_profile(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_get_participant_social(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_participant_social(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_own_social_profile(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_own_social_profile(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_get_participant_social(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_participant_social(uuid) TO authenticated;