-- ====================================================================
-- MIGRATION: 20260909171500_sandbox_e_delecao_participante.sql
-- Finalidade:
--  1) Criação do evento 'sandbox-sudoexpo' para testes e homologação isolada
--  2) RPC admin_delete_participant: exclusão atômica de participante pelo admin
--  3) RPC admin_clear_sandbox: limpeza rápida de dados do sandbox
-- ====================================================================

-- 1. Criação do evento de Sandbox
INSERT INTO public.events (id, name, city, starts_at, ends_at, is_active)
VALUES (
  'sandbox-sudoexpo',
  'Sandbox SudoExpo (Ambiente de Testes)',
  'Rio Verde',
  now(),
  now() + interval '2 years',
  true
)
ON CONFLICT (id) DO UPDATE
SET is_active = true,
    name = EXCLUDED.name;

-- 2. Propagar permissões de staff para o sandbox
INSERT INTO public.event_staff (event_id, user_id, role)
SELECT 'sandbox-sudoexpo', user_id, role
FROM public.event_staff
WHERE event_id = 'sudoexpo-2026'
ON CONFLICT (event_id, user_id) DO NOTHING;

-- 3. RPC: admin_delete_participant
-- Permite que a equipe/admin exclua qualquer participante de teste (inclusive o próprio)
-- de forma transacional, liberando imediatamente o WhatsApp e resetando rate limits.
CREATE OR REPLACE FUNCTION public.admin_delete_participant(_profile_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_p public.profiles%ROWTYPE;
  v_phone text;
  v_phone_hash text;
  v_name text;
  v_event text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501';
  END IF;

  IF NOT public.is_staff(v_uid) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_p FROM public.profiles WHERE id = _profile_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found' USING ERRCODE='P0001';
  END IF;

  v_name := v_p.name;
  v_event := v_p.event_id;

  -- Obter dados de contato antes da deleção
  SELECT phone_e164, phone_hash INTO v_phone, v_phone_hash
    FROM private.profile_contacts WHERE profile_id = _profile_id;

  -- 1. Limpar tentativas de claim e rate-limit para liberar o telefone de teste imediatamente
  IF v_phone_hash IS NOT NULL THEN
    DELETE FROM private.phone_claim_attempts WHERE phone_hash = v_phone_hash;
  END IF;
  IF v_p.owner_id IS NOT NULL THEN
    DELETE FROM private.phone_claim_attempts WHERE user_id = v_p.owner_id;
  END IF;

  -- 2. Limpar dados sociais
  DELETE FROM private.profile_social_profiles WHERE profile_id = _profile_id;

  -- 3. Deletar perfil (ON DELETE CASCADE cuida de offers, needs, matches, connections, profile_contacts, consents)
  DELETE FROM public.profiles WHERE id = _profile_id;

  RETURN jsonb_build_object(
    'success', true,
    'profile_id', _profile_id,
    'name', v_name,
    'event_id', v_event,
    'phone', v_phone
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_participant(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_participant(uuid) TO authenticated;

-- 4. RPC: admin_clear_sandbox
-- Exclui todos os participantes e conexões do evento 'sandbox-sudoexpo', deixando-o zerado
CREATE OR REPLACE FUNCTION public.admin_clear_sandbox()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_count int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501';
  END IF;

  IF NOT public.is_staff(v_uid) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE='42501';
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.profiles WHERE event_id = 'sandbox-sudoexpo';

  -- Deletar tentativas de claim do sandbox
  DELETE FROM private.phone_claim_attempts WHERE event_id = 'sandbox-sudoexpo';

  -- Deletar perfis sociais do sandbox
  DELETE FROM private.profile_social_profiles WHERE event_id = 'sandbox-sudoexpo';

  -- Deletar perfis do sandbox (cascateia para matches, conexões, ofertas, necessidades e contatos)
  DELETE FROM public.profiles WHERE event_id = 'sandbox-sudoexpo';

  RETURN jsonb_build_object(
    'success', true,
    'deleted_profiles_count', v_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_clear_sandbox() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_clear_sandbox() TO authenticated;
