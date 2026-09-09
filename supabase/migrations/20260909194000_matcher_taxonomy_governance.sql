-- Matcher v2.4 — governança da taxonomia e invalidação explícita de snapshots.
--
-- Problema resolvido:
-- matches são snapshots persistidos. Alterar itens, sinônimos ou relações de taxonomia
-- muda a semântica do matcher, mas não recalculava os pares já existentes. Esta migration
-- cria uma revisão global da configuração taxonômica, marca eventos implicitamente como
-- desatualizados e oferece RPCs admin-only para diagnóstico e rebuild completo por evento.

CREATE TABLE IF NOT EXISTS public.matcher_config_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  taxonomy_revision bigint NOT NULL DEFAULT 1 CHECK (taxonomy_revision >= 1),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.matcher_config_state(singleton, taxonomy_revision)
VALUES (true, 1)
ON CONFLICT (singleton) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.matcher_event_state (
  event_id text PRIMARY KEY REFERENCES public.events(id) ON DELETE CASCADE,
  applied_taxonomy_revision bigint NOT NULL DEFAULT 0 CHECK (applied_taxonomy_revision >= 0),
  last_rebuilt_at timestamptz,
  last_rebuilt_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  last_rebuilt_profiles integer NOT NULL DEFAULT 0 CHECK (last_rebuilt_profiles >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Estado interno: somente service_role e RPCs SECURITY DEFINER acessam diretamente.
REVOKE ALL ON public.matcher_config_state FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.matcher_event_state FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.matcher_config_state TO service_role;
GRANT ALL ON public.matcher_event_state TO service_role;

ALTER TABLE public.matcher_config_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matcher_event_state ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public._bump_matcher_taxonomy_revision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.matcher_config_state(singleton, taxonomy_revision, updated_at)
  VALUES (true, 2, now())
  ON CONFLICT (singleton) DO UPDATE
    SET taxonomy_revision = public.matcher_config_state.taxonomy_revision + 1,
        updated_at = now();
  RETURN COALESCE(NEW, OLD);
END;
$function$;

REVOKE ALL ON FUNCTION public._bump_matcher_taxonomy_revision() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._bump_matcher_taxonomy_revision() TO service_role;

DROP TRIGGER IF EXISTS bump_matcher_revision_taxonomy_items ON public.taxonomy_items;
CREATE TRIGGER bump_matcher_revision_taxonomy_items
  AFTER INSERT OR UPDATE OR DELETE ON public.taxonomy_items
  FOR EACH STATEMENT EXECUTE FUNCTION public._bump_matcher_taxonomy_revision();

DROP TRIGGER IF EXISTS bump_matcher_revision_taxonomy_relations ON public.taxonomy_relations;
CREATE TRIGGER bump_matcher_revision_taxonomy_relations
  AFTER INSERT OR UPDATE OR DELETE ON public.taxonomy_relations
  FOR EACH STATEMENT EXECUTE FUNCTION public._bump_matcher_taxonomy_revision();

-- Diagnóstico único para o painel de taxonomia. Além do estado dirty/clean, devolve
-- cobertura canônica real do evento: relações complementares só funcionam quando
-- necessidade e oferta possuem taxonomy_item_id.
CREATE OR REPLACE FUNCTION public.admin_get_matcher_taxonomy_status(_event_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := public._admin_require_event_admin(_event_id);
  v_revision bigint;
  v_applied bigint := 0;
  v_last_rebuilt_at timestamptz;
  v_last_rebuilt_profiles int := 0;
  v_eligible_profiles int := 0;
  v_offers_total int := 0;
  v_offers_canonical int := 0;
  v_needs_total int := 0;
  v_needs_canonical int := 0;
  v_active_items int := 0;
  v_items_with_synonyms int := 0;
  v_active_relations int := 0;
  v_effective_relations int := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.events e WHERE e.id = _event_id) THEN
    RAISE EXCEPTION 'event_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT taxonomy_revision INTO v_revision
    FROM public.matcher_config_state WHERE singleton = true;
  v_revision := COALESCE(v_revision, 1);

  SELECT s.applied_taxonomy_revision, s.last_rebuilt_at, s.last_rebuilt_profiles
    INTO v_applied, v_last_rebuilt_at, v_last_rebuilt_profiles
    FROM public.matcher_event_state s
   WHERE s.event_id = _event_id;
  v_applied := COALESCE(v_applied, 0);
  v_last_rebuilt_profiles := COALESCE(v_last_rebuilt_profiles, 0);

  SELECT count(*)::int INTO v_eligible_profiles
    FROM public.profiles p
   WHERE p.event_id = _event_id
     AND (
       p.is_demo = true
       OR EXISTS (
         SELECT 1
           FROM public.consents cs
          WHERE cs.profile_id = p.id
            AND cs.event_id = _event_id
            AND cs.consent_type = 'matchmaking'
            AND cs.granted = true
            AND cs.created_at = (
              SELECT max(cs2.created_at)
                FROM public.consents cs2
               WHERE cs2.profile_id = p.id
                 AND cs2.event_id = _event_id
                 AND cs2.consent_type = 'matchmaking'
            )
       )
     );

  SELECT count(*)::int,
         count(*) FILTER (WHERE po.taxonomy_item_id IS NOT NULL)::int
    INTO v_offers_total, v_offers_canonical
    FROM public.profile_offers po
   WHERE po.event_id = _event_id AND po.active;

  SELECT count(*)::int,
         count(*) FILTER (WHERE pn.taxonomy_item_id IS NOT NULL)::int
    INTO v_needs_total, v_needs_canonical
    FROM public.profile_needs pn
   WHERE pn.event_id = _event_id AND pn.active;

  SELECT count(*) FILTER (WHERE ti.active)::int,
         count(*) FILTER (
           WHERE ti.active AND COALESCE(array_length(ti.synonyms, 1), 0) > 0
         )::int
    INTO v_active_items, v_items_with_synonyms
    FROM public.taxonomy_items ti;

  SELECT count(*) FILTER (WHERE r.active)::int,
         count(*) FILTER (WHERE r.active AND r.weight >= 40)::int
    INTO v_active_relations, v_effective_relations
    FROM public.taxonomy_relations r
   WHERE r.relation_type = 'complements';

  RETURN jsonb_build_object(
    'event_id', _event_id,
    'taxonomy_revision', v_revision,
    'applied_taxonomy_revision', v_applied,
    'dirty', v_applied < v_revision,
    'last_rebuilt_at', v_last_rebuilt_at,
    'last_rebuilt_profiles', v_last_rebuilt_profiles,
    'eligible_profiles', v_eligible_profiles,
    'offers_total', v_offers_total,
    'offers_canonical', v_offers_canonical,
    'offers_coverage_pct', CASE WHEN v_offers_total = 0 THEN 0 ELSE round((100.0 * v_offers_canonical / v_offers_total)::numeric, 1) END,
    'needs_total', v_needs_total,
    'needs_canonical', v_needs_canonical,
    'needs_coverage_pct', CASE WHEN v_needs_total = 0 THEN 0 ELSE round((100.0 * v_needs_canonical / v_needs_total)::numeric, 1) END,
    'active_items', v_active_items,
    'items_with_synonyms', v_items_with_synonyms,
    'active_relations', v_active_relations,
    'effective_relations', v_effective_relations
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_get_matcher_taxonomy_status(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_matcher_taxonomy_status(text) TO authenticated;

-- Rebuild explícito do evento. A revisão é capturada no início; se a taxonomia mudar
-- concorrentemente, o evento continuará dirty e um novo rebuild será pedido.
CREATE OR REPLACE FUNCTION public.admin_recompute_event_matches(_event_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := public._admin_require_event_admin(_event_id);
  v_revision bigint;
  v_current_revision bigint;
  v_profile record;
  v_profiles int := 0;
  v_matches_touched int := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.events e WHERE e.id = _event_id) THEN
    RAISE EXCEPTION 'event_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Impede dois rebuilds simultâneos do mesmo evento na mesma base.
  PERFORM pg_advisory_xact_lock(hashtext('matcher-rebuild:' || _event_id));

  SELECT taxonomy_revision INTO v_revision
    FROM public.matcher_config_state WHERE singleton = true;
  v_revision := COALESCE(v_revision, 1);

  FOR v_profile IN
    SELECT p.id
      FROM public.profiles p
     WHERE p.event_id = _event_id
       AND (
         p.is_demo = true
         OR EXISTS (
           SELECT 1
             FROM public.consents cs
            WHERE cs.profile_id = p.id
              AND cs.event_id = _event_id
              AND cs.consent_type = 'matchmaking'
              AND cs.granted = true
              AND cs.created_at = (
                SELECT max(cs2.created_at)
                  FROM public.consents cs2
                 WHERE cs2.profile_id = p.id
                   AND cs2.event_id = _event_id
                   AND cs2.consent_type = 'matchmaking'
              )
         )
       )
     ORDER BY p.id
  LOOP
    v_matches_touched := v_matches_touched
      + COALESCE(public._recompute_matches_for_profile(v_profile.id, _event_id), 0);
    v_profiles := v_profiles + 1;
  END LOOP;

  INSERT INTO public.matcher_event_state(
    event_id, applied_taxonomy_revision, last_rebuilt_at, last_rebuilt_by,
    last_rebuilt_profiles, updated_at
  ) VALUES (
    _event_id, v_revision, now(), v_uid, v_profiles, now()
  )
  ON CONFLICT (event_id) DO UPDATE
    SET applied_taxonomy_revision = EXCLUDED.applied_taxonomy_revision,
        last_rebuilt_at = EXCLUDED.last_rebuilt_at,
        last_rebuilt_by = EXCLUDED.last_rebuilt_by,
        last_rebuilt_profiles = EXCLUDED.last_rebuilt_profiles,
        updated_at = now();

  INSERT INTO public.audit_logs(
    event_id, actor_user_id, target_table, target_id, action, before, after
  ) VALUES (
    _event_id, v_uid, 'matcher_event_state', _event_id, 'matcher_event_rebuild',
    NULL,
    jsonb_build_object(
      'applied_taxonomy_revision', v_revision,
      'profiles_rebuilt', v_profiles,
      'matches_touched', v_matches_touched
    )
  );

  SELECT taxonomy_revision INTO v_current_revision
    FROM public.matcher_config_state WHERE singleton = true;
  v_current_revision := COALESCE(v_current_revision, v_revision);

  RETURN jsonb_build_object(
    'event_id', _event_id,
    'applied_taxonomy_revision', v_revision,
    'current_taxonomy_revision', v_current_revision,
    'dirty', v_revision < v_current_revision,
    'profiles_rebuilt', v_profiles,
    'matches_touched', v_matches_touched,
    'rebuilt_at', now()
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_recompute_event_matches(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_recompute_event_matches(text) TO authenticated;

COMMENT ON TABLE public.matcher_config_state IS
  'Revisão global da configuração taxonômica que influencia o matcher.';
COMMENT ON TABLE public.matcher_event_state IS
  'Última revisão taxonômica aplicada por rebuild completo em cada evento.';
COMMENT ON FUNCTION public.admin_recompute_event_matches(text) IS
  'Admin-only: recalcula snapshots de matches de todos os perfis elegíveis do evento.';
