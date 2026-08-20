DO $$
DECLARE ids uuid[];
BEGIN
  SELECT array_agg(id) INTO ids FROM public.profiles WHERE name = 'Teste QA' AND company = 'QA Ltda';
  IF ids IS NULL THEN RETURN; END IF;

  DELETE FROM public.match_reasons r USING public.matches m
    WHERE r.match_id = m.id AND (m.a_profile_id = ANY(ids) OR m.b_profile_id = ANY(ids));
  DELETE FROM public.match_admin_reviews ar USING public.matches m
    WHERE ar.match_id = m.id AND (m.a_profile_id = ANY(ids) OR m.b_profile_id = ANY(ids));
  DELETE FROM public.match_decisions d USING public.matches m
    WHERE d.match_id = m.id AND (m.a_profile_id = ANY(ids) OR m.b_profile_id = ANY(ids));
  DELETE FROM public.match_status_history h USING public.matches m
    WHERE h.match_id = m.id AND (m.a_profile_id = ANY(ids) OR m.b_profile_id = ANY(ids));
  DELETE FROM public.connection_events ce USING public.connections c
    WHERE ce.connection_id = c.id AND (c.a_profile_id = ANY(ids) OR c.b_profile_id = ANY(ids));
  DELETE FROM public.connection_notes cn USING public.connections c
    WHERE cn.connection_id = c.id AND (c.a_profile_id = ANY(ids) OR c.b_profile_id = ANY(ids));
  DELETE FROM public.connection_status_history sh USING public.connections c
    WHERE sh.connection_id = c.id AND (c.a_profile_id = ANY(ids) OR c.b_profile_id = ANY(ids));
  DELETE FROM public.connections WHERE a_profile_id = ANY(ids) OR b_profile_id = ANY(ids);
  DELETE FROM public.matches WHERE a_profile_id = ANY(ids) OR b_profile_id = ANY(ids);
  DELETE FROM public.profile_offers WHERE profile_id = ANY(ids);
  DELETE FROM public.profile_needs WHERE profile_id = ANY(ids);
  DELETE FROM public.profile_segments WHERE profile_id = ANY(ids);
  DELETE FROM public.analytics_events WHERE profile_id = ANY(ids);
  DELETE FROM public.ai_runs WHERE profile_id = ANY(ids);
  DELETE FROM public.consents WHERE profile_id = ANY(ids);
  DELETE FROM private.profile_contacts WHERE profile_id = ANY(ids);
  DELETE FROM private.profile_recovery WHERE profile_id = ANY(ids);
  DELETE FROM public.profiles WHERE id = ANY(ids);
END $$;