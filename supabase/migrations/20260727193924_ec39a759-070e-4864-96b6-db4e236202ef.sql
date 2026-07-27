-- Seg-3 behavioral proof. Runs as migration owner (superuser). Any RAISE aborts the whole migration.
DO $seg3$
DECLARE
  ev_a text := 'seg3-proof-a-' || substring(gen_random_uuid()::text, 1, 8);
  ev_b text := 'seg3-proof-b-' || substring(gen_random_uuid()::text, 1, 8);
  u_participant_a uuid := gen_random_uuid();
  u_participant_b uuid := gen_random_uuid();
  u_staff_a uuid := gen_random_uuid();
  u_staff_b uuid := gen_random_uuid();
  u_admin_a uuid := gen_random_uuid();
  u_admin_b uuid := gen_random_uuid();
  u_outsider uuid := gen_random_uuid();
  p_a  uuid := gen_random_uuid();
  p_a2 uuid := gen_random_uuid();
  p_b  uuid := gen_random_uuid();
  p_b2 uuid := gen_random_uuid();
  m_a  uuid := gen_random_uuid();
  m_b  uuid := gen_random_uuid();
  c_a  uuid := gen_random_uuid();
  c_b  uuid := gen_random_uuid();
  v_visible int;
  v_threw boolean;
BEGIN
  -- Users
  INSERT INTO auth.users (id, aud, role, email, encrypted_password, created_at, updated_at, email_confirmed_at)
  VALUES
    (u_participant_a,'authenticated','authenticated','seg3-pa@test.local','',now(),now(),now()),
    (u_participant_b,'authenticated','authenticated','seg3-pb@test.local','',now(),now(),now()),
    (u_staff_a,'authenticated','authenticated','seg3-sa@test.local','',now(),now(),now()),
    (u_staff_b,'authenticated','authenticated','seg3-sb@test.local','',now(),now(),now()),
    (u_admin_a,'authenticated','authenticated','seg3-aa@test.local','',now(),now(),now()),
    (u_admin_b,'authenticated','authenticated','seg3-ab@test.local','',now(),now(),now()),
    (u_outsider,'authenticated','authenticated','seg3-out@test.local','',now(),now(),now());

  INSERT INTO public.events (id, name, city, is_active)
  VALUES (ev_a,'Seg3 Proof A','A',true), (ev_b,'Seg3 Proof B','B',true);

  INSERT INTO public.profiles (id, owner_id, event_id, name, company, city, whatsapp, segment_id, summary, offers, needs, consent, is_demo, recovery_code)
  VALUES
    (p_a,  u_participant_a, ev_a,'Alice A','Emp A','A','','industria','r','[]'::jsonb,'[]'::jsonb,true,false,''),
    (p_a2, NULL,            ev_a,'Comp A','Emp A2','A','','industria','r','[]'::jsonb,'[]'::jsonb,true,true,''),
    (p_b,  u_participant_b, ev_b,'Bob B','Emp B','B','','industria','r','[]'::jsonb,'[]'::jsonb,true,false,''),
    (p_b2, NULL,            ev_b,'Comp B','Emp B2','B','','industria','r','[]'::jsonb,'[]'::jsonb,true,true,'');

  INSERT INTO public.event_staff (event_id, user_id, role) VALUES
    (ev_a, u_staff_a,'staff'),
    (ev_a, u_admin_a,'admin'),
    (ev_b, u_staff_b,'staff'),
    (ev_b, u_admin_b,'admin');

  INSERT INTO public.matches (id, event_id, a_profile_id, b_profile_id, kind, score_for_a, score_for_b, label, reasons_for_a, reasons_for_b, algorithm_version, is_active, generated_at)
  VALUES
    (m_a, ev_a, LEAST(p_a,p_a2), GREATEST(p_a,p_a2),'direto',60,60,'boa_oportunidade','[]'::jsonb,'[]'::jsonb,'v2.2',true,now()),
    (m_b, ev_b, LEAST(p_b,p_b2), GREATEST(p_b,p_b2),'direto',60,60,'boa_oportunidade','[]'::jsonb,'[]'::jsonb,'v2.2',true,now());

  INSERT INTO public.connections (id, match_id, event_id, a_profile_id, b_profile_id, status)
  VALUES
    (c_a, m_a, ev_a, LEAST(p_a,p_a2), GREATEST(p_a,p_a2),'aguardando'),
    (c_b, m_b, ev_b, LEAST(p_b,p_b2), GREATEST(p_b,p_b2),'aguardando');

  ---------- Behavioral assertions ----------
  -- participant A on profiles of B => 0
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_participant_a, 'role','authenticated')::text, true);
  SELECT count(*) INTO v_visible FROM public.profiles WHERE event_id = ev_b;
  IF v_visible <> 0 THEN RAISE EXCEPTION 'SEG3 FAIL: participant A viu % perfis do evento B', v_visible; END IF;
  SELECT count(*) INTO v_visible FROM public.matches WHERE id = m_b;
  IF v_visible <> 0 THEN RAISE EXCEPTION 'SEG3 FAIL: participant A viu match do evento B'; END IF;
  SELECT count(*) INTO v_visible FROM public.connections WHERE id = c_b;
  IF v_visible <> 0 THEN RAISE EXCEPTION 'SEG3 FAIL: participant A viu connection do evento B'; END IF;
  -- participant A vê o próprio match/conn
  SELECT count(*) INTO v_visible FROM public.matches WHERE id = m_a;
  IF v_visible <> 1 THEN RAISE EXCEPTION 'SEG3 FAIL: participant A não viu próprio match (esperado 1, veio %)', v_visible; END IF;
  SELECT count(*) INTO v_visible FROM public.connections WHERE id = c_a;
  IF v_visible <> 1 THEN RAISE EXCEPTION 'SEG3 FAIL: participant A não viu própria connection'; END IF;
  RESET role;

  -- staff A vê tudo do evento A e nada do B
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_staff_a, 'role','authenticated')::text, true);
  SELECT count(*) INTO v_visible FROM public.profiles WHERE event_id = ev_a;
  IF v_visible <> 2 THEN RAISE EXCEPTION 'SEG3 FAIL: staff A viu % perfis do próprio evento (esperado 2)', v_visible; END IF;
  SELECT count(*) INTO v_visible FROM public.profiles WHERE event_id = ev_b;
  IF v_visible <> 0 THEN RAISE EXCEPTION 'SEG3 FAIL: staff A viu perfis do evento B'; END IF;
  SELECT count(*) INTO v_visible FROM public.matches WHERE event_id = ev_b;
  IF v_visible <> 0 THEN RAISE EXCEPTION 'SEG3 FAIL: staff A viu matches do evento B'; END IF;
  SELECT count(*) INTO v_visible FROM public.connections WHERE event_id = ev_b;
  IF v_visible <> 0 THEN RAISE EXCEPTION 'SEG3 FAIL: staff A viu connections do evento B'; END IF;
  RESET role;

  -- staff B só do evento B
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_staff_b, 'role','authenticated')::text, true);
  SELECT count(*) INTO v_visible FROM public.profiles WHERE event_id = ev_b;
  IF v_visible <> 2 THEN RAISE EXCEPTION 'SEG3 FAIL: staff B viu % perfis do próprio evento (esperado 2)', v_visible; END IF;
  SELECT count(*) INTO v_visible FROM public.profiles WHERE event_id = ev_a;
  IF v_visible <> 0 THEN RAISE EXCEPTION 'SEG3 FAIL: staff B viu perfis do evento A'; END IF;
  RESET role;

  -- outsider
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_outsider, 'role','authenticated')::text, true);
  SELECT count(*) INTO v_visible FROM public.profiles WHERE event_id IN (ev_a, ev_b);
  IF v_visible <> 0 THEN RAISE EXCEPTION 'SEG3 FAIL: outsider viu % perfis', v_visible; END IF;
  RESET role;

  -- anon
  PERFORM set_config('role','anon',true);
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  -- anon não tem grants, então SELECT falha por permission_denied (que já é isolamento forte).
  BEGIN
    SELECT count(*) INTO v_visible FROM public.profiles WHERE event_id IN (ev_a, ev_b);
    IF v_visible <> 0 THEN RAISE EXCEPTION 'SEG3 FAIL: anon viu % perfis', v_visible; END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    SELECT count(*) INTO v_visible FROM public.matches WHERE event_id IN (ev_a, ev_b);
    IF v_visible <> 0 THEN RAISE EXCEPTION 'SEG3 FAIL: anon viu % matches', v_visible; END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    SELECT count(*) INTO v_visible FROM public.connections WHERE event_id IN (ev_a, ev_b);
    IF v_visible <> 0 THEN RAISE EXCEPTION 'SEG3 FAIL: anon viu % connections', v_visible; END IF;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  RESET role;

  -- admin A tentando inserir staff no evento B => deve falhar por RLS/WITH CHECK
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', u_admin_a, 'role','authenticated')::text, true);
  v_threw := false;
  BEGIN
    INSERT INTO public.event_staff (event_id, user_id, role) VALUES (ev_b, u_outsider, 'staff');
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    v_threw := true;
  END;
  RESET role;
  IF NOT v_threw THEN RAISE EXCEPTION 'SEG3 FAIL: admin A conseguiu inserir staff no evento B'; END IF;
  -- Confirma que nada foi inserido
  SELECT count(*) INTO v_visible FROM public.event_staff WHERE event_id = ev_b;
  IF v_visible <> 2 THEN RAISE EXCEPTION 'SEG3 FAIL: roster do evento B mudou (%)', v_visible; END IF;

  -- Confirma publication
  SELECT count(*) INTO v_visible FROM pg_publication_tables
   WHERE pubname='supabase_realtime' AND schemaname='public'
     AND tablename IN ('profiles','matches','connections');
  IF v_visible <> 3 THEN RAISE EXCEPTION 'SEG3 FAIL: publication Realtime não tem as 3 tabelas'; END IF;

  ---------- Registrar prova + cleanup ----------
  INSERT INTO public.audit_logs (event_id, actor_user_id, target_table, target_id, action, after)
  VALUES (NULL, NULL, 'public.profiles/matches/connections/event_staff', NULL, 'seg3_behavioral_proof',
    jsonb_build_object(
      'checks_passed', 15,
      'events_tested', jsonb_build_array(ev_a, ev_b),
      'note', 'RLS isolation by event_id validated for participant/staff/admin/outsider/anon.'
    ));

  DELETE FROM public.connections WHERE event_id IN (ev_a, ev_b);
  DELETE FROM public.matches     WHERE event_id IN (ev_a, ev_b);
  DELETE FROM public.profiles    WHERE event_id IN (ev_a, ev_b);
  DELETE FROM public.event_staff WHERE event_id IN (ev_a, ev_b);
  DELETE FROM public.events      WHERE id IN (ev_a, ev_b);
  DELETE FROM auth.users WHERE id IN (
    u_participant_a, u_participant_b, u_staff_a, u_staff_b, u_admin_a, u_admin_b, u_outsider
  );
END
$seg3$;