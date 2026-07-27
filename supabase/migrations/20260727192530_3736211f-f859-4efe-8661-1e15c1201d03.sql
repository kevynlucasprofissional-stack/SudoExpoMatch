-- =========================================================================
-- Fase Seg-1: analytics_events + taxonomy_items hardening (idempotente)
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1) analytics_events
-- -------------------------------------------------------------------------

-- Default seguro para actor_user_id
ALTER TABLE public.analytics_events
  ALTER COLUMN actor_user_id SET DEFAULT auth.uid();

-- Trigger que garante actor_user_id = auth.uid() no INSERT
CREATE OR REPLACE FUNCTION public.analytics_events_set_actor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  NEW.actor_user_id := auth.uid();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_analytics_events_set_actor ON public.analytics_events;
CREATE TRIGGER trg_analytics_events_set_actor
  BEFORE INSERT ON public.analytics_events
  FOR EACH ROW EXECUTE FUNCTION public.analytics_events_set_actor();

-- Remover policy insegura e recriar de forma restritiva.
-- Allowlist mínima documentada (frontend hoje não escreve; reservada para
-- futuros writers de instrumentação server-side ou telemetria do wizard).
DROP POLICY IF EXISTS "analytics insertable by authenticated" ON public.analytics_events;
DROP POLICY IF EXISTS "analytics_events_insert_self" ON public.analytics_events;

CREATE POLICY "analytics_events_insert_self"
ON public.analytics_events
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND actor_user_id = auth.uid()
  AND kind IS NOT NULL
  AND char_length(kind) BETWEEN 1 AND 64
  AND kind IN (
    'onboarding_started',
    'onboarding_completed',
    'ai_suggestion_requested',
    'ai_suggestion_accepted',
    'match_viewed',
    'match_decided',
    'connection_viewed'
  )
  AND jsonb_typeof(payload) = 'object'
  AND octet_length(payload::text) <= 4096
  AND (
    event_id IS NULL
    OR EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id)
  )
  AND (
    profile_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = profile_id
        AND (
          p.owner_id = auth.uid()
          OR (p.event_id IS NOT NULL AND public.has_any_event_role(p.event_id, auth.uid()))
        )
    )
  )
);

-- Bloquear UPDATE/DELETE explicitamente para authenticated/anon
DROP POLICY IF EXISTS "analytics_events_no_update" ON public.analytics_events;
DROP POLICY IF EXISTS "analytics_events_no_delete" ON public.analytics_events;
-- (RLS já bloqueia por padrão; sem policies para UPDATE/DELETE = negado)

-- Remover privilégios largos legados
REVOKE INSERT, UPDATE, DELETE ON public.analytics_events FROM anon;
REVOKE UPDATE, DELETE ON public.analytics_events FROM authenticated;
GRANT INSERT ON public.analytics_events TO authenticated;
GRANT ALL ON public.analytics_events TO service_role;

-- -------------------------------------------------------------------------
-- 2) taxonomy_items
-- -------------------------------------------------------------------------

-- Remover policies amplas antigas
DROP POLICY IF EXISTS "taxonomy readable" ON public.taxonomy_items;
DROP POLICY IF EXISTS "taxonomy staff writable" ON public.taxonomy_items;
DROP POLICY IF EXISTS "taxonomy_items_read_active" ON public.taxonomy_items;
DROP POLICY IF EXISTS "taxonomy_items_read_staff_all" ON public.taxonomy_items;
DROP POLICY IF EXISTS "taxonomy_items_insert_staff" ON public.taxonomy_items;
DROP POLICY IF EXISTS "taxonomy_items_update_staff" ON public.taxonomy_items;
DROP POLICY IF EXISTS "taxonomy_items_delete_staff" ON public.taxonomy_items;

-- Helper: authenticated não-anônimo e staff real
-- (usa is_staff já existente; anonymous sessions do Supabase têm
--  auth.jwt() ->> 'is_anonymous' = 'true')

-- Leitura de itens ativos (participantes + staff)
CREATE POLICY "taxonomy_items_read_active"
ON public.taxonomy_items
FOR SELECT
TO authenticated
USING (active = true);

-- Leitura de itens inativos apenas para staff real (não anônimo)
CREATE POLICY "taxonomy_items_read_staff_all"
ON public.taxonomy_items
FOR SELECT
TO authenticated
USING (
  active = false
  AND COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  AND public.is_staff(auth.uid())
);

-- Escritas separadas, apenas staff autenticado não anônimo
CREATE POLICY "taxonomy_items_insert_staff"
ON public.taxonomy_items
FOR INSERT
TO authenticated
WITH CHECK (
  COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  AND public.is_staff(auth.uid())
);

CREATE POLICY "taxonomy_items_update_staff"
ON public.taxonomy_items
FOR UPDATE
TO authenticated
USING (
  COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  AND public.is_staff(auth.uid())
)
WITH CHECK (
  COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  AND public.is_staff(auth.uid())
);

CREATE POLICY "taxonomy_items_delete_staff"
ON public.taxonomy_items
FOR DELETE
TO authenticated
USING (
  COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  AND public.is_staff(auth.uid())
);

-- Grants: sem anon; authenticated só SELECT + escrita filtrada por RLS
REVOKE ALL ON public.taxonomy_items FROM anon;
REVOKE ALL ON public.taxonomy_items FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.taxonomy_items TO authenticated;
GRANT ALL ON public.taxonomy_items TO service_role;

COMMENT ON POLICY "taxonomy_items_read_active" ON public.taxonomy_items
  IS 'Onboarding e wizard leem apenas itens ativos; anonymous-auth incluído (Supabase mapeia como authenticated).';
COMMENT ON POLICY "taxonomy_items_read_staff_all" ON public.taxonomy_items
  IS 'Somente staff real (não anônimo) enxerga itens inativos.';
COMMENT ON POLICY "analytics_events_insert_self" ON public.analytics_events
  IS 'Insert restrito ao próprio usuário; kind em allowlist; payload objeto <=4KB; profile/event validados.';