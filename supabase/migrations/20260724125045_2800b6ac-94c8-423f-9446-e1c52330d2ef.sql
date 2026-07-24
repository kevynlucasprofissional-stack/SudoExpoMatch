
-- ============================================================
-- Fase 2 — RPCs administrativas (event_staff)
-- ============================================================

-- LISTAR MEMBROS DA EQUIPE COM E-MAIL
CREATE OR REPLACE FUNCTION public.admin_list_event_staff(_event_id text)
RETURNS TABLE(user_id uuid, email text, role app_role, created_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_event_role(_event_id, auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT es.user_id, u.email::text, es.role, es.created_at
    FROM public.event_staff es
    JOIN auth.users u ON u.id = es.user_id
    WHERE es.event_id = _event_id
    ORDER BY es.role DESC, u.email ASC;
END;
$$;

-- ADICIONAR MEMBRO POR E-MAIL
CREATE OR REPLACE FUNCTION public.admin_add_event_staff_by_email(
  _event_id text, _email text, _role app_role
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _target_user uuid;
BEGIN
  IF NOT public.has_event_role(_event_id, auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _role NOT IN ('staff','admin') THEN
    RAISE EXCEPTION 'invalid_role' USING ERRCODE = '22023';
  END IF;
  SELECT id INTO _target_user FROM auth.users WHERE lower(email) = lower(trim(_email)) LIMIT 1;
  IF _target_user IS NULL THEN
    RAISE EXCEPTION 'user_not_found' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.event_staff (event_id, user_id, role)
  VALUES (_event_id, _target_user, _role)
  ON CONFLICT (event_id, user_id, role) DO NOTHING;

  INSERT INTO public.audit_logs (event_id, actor_user_id, target_table, target_id, action, after)
  VALUES (_event_id, auth.uid(), 'event_staff', _target_user::text, 'add',
          jsonb_build_object('role', _role, 'email', _email));
  RETURN _target_user;
END;
$$;

-- ALTERAR PAPEL
CREATE OR REPLACE FUNCTION public.admin_change_event_staff_role(
  _event_id text, _user_id uuid, _role app_role
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _prev app_role;
  _admin_count int;
BEGIN
  IF NOT public.has_event_role(_event_id, auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _role NOT IN ('staff','admin') THEN
    RAISE EXCEPTION 'invalid_role' USING ERRCODE = '22023';
  END IF;

  SELECT role INTO _prev FROM public.event_staff
    WHERE event_id = _event_id AND user_id = _user_id
    ORDER BY (role = 'admin') DESC LIMIT 1;
  IF _prev IS NULL THEN
    RAISE EXCEPTION 'not_a_member' USING ERRCODE = 'P0001';
  END IF;

  -- Se estava rebaixando o único admin, bloquear
  IF _prev = 'admin' AND _role <> 'admin' THEN
    SELECT count(*) INTO _admin_count
      FROM public.event_staff
      WHERE event_id = _event_id AND role = 'admin' AND user_id <> _user_id;
    IF _admin_count = 0 THEN
      RAISE EXCEPTION 'last_admin' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Substitui as linhas do usuário por uma única com o novo papel
  DELETE FROM public.event_staff WHERE event_id = _event_id AND user_id = _user_id;
  INSERT INTO public.event_staff (event_id, user_id, role)
  VALUES (_event_id, _user_id, _role)
  ON CONFLICT (event_id, user_id, role) DO NOTHING;

  INSERT INTO public.audit_logs (event_id, actor_user_id, target_table, target_id, action, before, after)
  VALUES (_event_id, auth.uid(), 'event_staff', _user_id::text, 'update',
          jsonb_build_object('role', _prev),
          jsonb_build_object('role', _role));
END;
$$;

-- REMOVER MEMBRO
CREATE OR REPLACE FUNCTION public.admin_remove_event_staff(
  _event_id text, _user_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _admin_count int;
  _was_admin boolean;
BEGIN
  IF NOT public.has_event_role(_event_id, auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.event_staff
    WHERE event_id = _event_id AND user_id = _user_id AND role = 'admin'
  ) INTO _was_admin;

  IF _was_admin THEN
    SELECT count(*) INTO _admin_count
      FROM public.event_staff
      WHERE event_id = _event_id AND role = 'admin' AND user_id <> _user_id;
    IF _admin_count = 0 THEN
      RAISE EXCEPTION 'last_admin' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  DELETE FROM public.event_staff WHERE event_id = _event_id AND user_id = _user_id;

  INSERT INTO public.audit_logs (event_id, actor_user_id, target_table, target_id, action)
  VALUES (_event_id, auth.uid(), 'event_staff', _user_id::text, 'remove');
END;
$$;

-- GRANTS: revoga do PUBLIC/anon, concede apenas a authenticated
REVOKE ALL ON FUNCTION public.admin_list_event_staff(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_add_event_staff_by_email(text, text, app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_change_event_staff_role(text, uuid, app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_remove_event_staff(text, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_list_event_staff(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_add_event_staff_by_email(text, text, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_change_event_staff_role(text, uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_remove_event_staff(text, uuid) TO authenticated;

-- event_stats: garantir grant a authenticated + anon (usado pela tela pública)
GRANT EXECUTE ON FUNCTION public.event_stats(text) TO anon, authenticated;
