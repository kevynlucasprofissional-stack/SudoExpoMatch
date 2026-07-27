-- 1. schema privado (idempotente)
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM anon;
REVOKE ALL ON SCHEMA private FROM authenticated;
GRANT USAGE ON SCHEMA private TO service_role;

-- 2. cache persistente da IA de onboarding
CREATE TABLE IF NOT EXISTS private.ai_onboarding_cache (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  input_hash text NOT NULL,
  prompt_version text NOT NULL,
  model text NOT NULL,
  result jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (input_hash, prompt_version, model)
);
CREATE INDEX IF NOT EXISTS ai_onboarding_cache_expires_at_idx
  ON private.ai_onboarding_cache (expires_at);

REVOKE ALL ON TABLE private.ai_onboarding_cache FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE private.ai_onboarding_cache TO service_role;
ALTER TABLE private.ai_onboarding_cache ENABLE ROW LEVEL SECURITY;
-- sem policies para anon/authenticated => sem acesso via PostgREST

-- 3. contador atômico para rate limit
CREATE TABLE IF NOT EXISTS private.ai_rate_counters (
  actor_user_id uuid NOT NULL,
  bucket_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (actor_user_id, bucket_start)
);
CREATE INDEX IF NOT EXISTS ai_rate_counters_bucket_idx
  ON private.ai_rate_counters (bucket_start);

REVOKE ALL ON TABLE private.ai_rate_counters FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE private.ai_rate_counters TO service_role;
ALTER TABLE private.ai_rate_counters ENABLE ROW LEVEL SECURITY;

-- 4. função atômica: consome 1 slot da janela; retorna true se dentro do limite
CREATE OR REPLACE FUNCTION private.consume_ai_rate_limit(
  _actor uuid,
  _window_sec integer DEFAULT 300,
  _max_calls integer DEFAULT 10
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, pg_temp
AS $$
DECLARE
  _bucket timestamptz;
  _current integer;
BEGIN
  _bucket := date_trunc('second', now())
             - make_interval(secs => extract(epoch from now())::bigint % _window_sec);
  INSERT INTO private.ai_rate_counters(actor_user_id, bucket_start, count)
  VALUES (_actor, _bucket, 1)
  ON CONFLICT (actor_user_id, bucket_start)
  DO UPDATE SET count = private.ai_rate_counters.count + 1
  RETURNING count INTO _current;

  -- housekeeping barato: apaga buckets antigos (>1h)
  DELETE FROM private.ai_rate_counters
  WHERE bucket_start < now() - interval '1 hour';

  RETURN _current <= _max_calls;
END;
$$;

REVOKE ALL ON FUNCTION private.consume_ai_rate_limit(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.consume_ai_rate_limit(uuid, integer, integer) TO service_role;

-- 5. Ampliação de public.ai_runs (aditivo, preserva registros existentes)
ALTER TABLE public.ai_runs
  ADD COLUMN IF NOT EXISTS actor_user_id uuid,
  ADD COLUMN IF NOT EXISTS input_hash text,
  ADD COLUMN IF NOT EXISTS prompt_version text,
  ADD COLUMN IF NOT EXISTS tokens_input integer,
  ADD COLUMN IF NOT EXISTS tokens_output integer,
  ADD COLUMN IF NOT EXISTS cache_hit boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fallback_used boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS ai_runs_actor_created_idx
  ON public.ai_runs (actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_runs_input_hash_idx
  ON public.ai_runs (input_hash);