CREATE OR REPLACE FUNCTION public._social_cache_json(_c private.social_profile_cache, _with_ai boolean)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
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
    'updated_at', _c.updated_at,
    'provider_posts_received', _c.provider_posts_received,
    'provider_posts_persisted', _c.provider_posts_persisted,
    'ai_posts_used', _c.ai_posts_used,
    'provider_payload_version', _c.provider_payload_version,
    'provider_payload_bytes', _c.provider_payload_bytes,
    'provider_payload_truncated', _c.provider_payload_truncated,
    'context_schema_version', _c.context_schema_version
  )
$function$;