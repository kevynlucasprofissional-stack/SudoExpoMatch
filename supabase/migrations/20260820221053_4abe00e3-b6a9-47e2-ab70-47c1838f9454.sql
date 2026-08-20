-- IMPL 23: expõe wrappers públicos (service_role apenas) para o cache e o
-- limitador de IA que vivem no schema privado, que não é acessível pela API.
CREATE OR REPLACE FUNCTION public.ai_rate_limit_consume(_actor uuid, _window_sec integer, _max_calls integer)
RETURNS boolean
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT private.consume_ai_rate_limit(_actor, _window_sec, _max_calls);
$$;

REVOKE ALL ON FUNCTION public.ai_rate_limit_consume(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_rate_limit_consume(uuid, integer, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.ai_cache_lookup(_key text, _prompt_version text, _model text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT c.result
  FROM private.ai_onboarding_cache c
  WHERE c.input_hash = _key
    AND c.prompt_version = _prompt_version
    AND c.model = _model
    AND c.expires_at > now()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.ai_cache_lookup(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_cache_lookup(text, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.ai_cache_store(_key text, _prompt_version text, _model text, _result jsonb, _ttl_sec integer)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public, private
AS $$
  INSERT INTO private.ai_onboarding_cache (input_hash, prompt_version, model, result, expires_at)
  VALUES (_key, _prompt_version, _model, _result, now() + make_interval(secs => greatest(_ttl_sec, 1)))
  ON CONFLICT (input_hash, prompt_version, model)
  DO UPDATE SET result = EXCLUDED.result, expires_at = EXCLUDED.expires_at;
$$;

REVOKE ALL ON FUNCTION public.ai_cache_store(text, text, text, jsonb, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_cache_store(text, text, text, jsonb, integer) TO service_role;