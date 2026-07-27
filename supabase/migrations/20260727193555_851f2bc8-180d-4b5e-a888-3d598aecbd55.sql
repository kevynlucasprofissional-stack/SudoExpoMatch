-- Fase Seg-3: renomear políticas com nomes explícitos por evento e documentar exceções.
-- Idempotente: dropa por nome antigo e por novo antes de recriar.

-- ============ profiles ============
DROP POLICY IF EXISTS "own profile readable" ON public.profiles;
DROP POLICY IF EXISTS "own profile insert" ON public.profiles;
DROP POLICY IF EXISTS "profiles staff manage" ON public.profiles;
DROP POLICY IF EXISTS profiles_select_owner_or_event_staff ON public.profiles;
DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
DROP POLICY IF EXISTS profiles_staff_manage_same_event ON public.profiles;

CREATE POLICY profiles_select_owner_or_event_staff
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    owner_id = auth.uid()
    OR public.has_any_event_role(event_id, auth.uid())
  );
COMMENT ON POLICY profiles_select_owner_or_event_staff ON public.profiles IS
  'Escopo por evento: participante lê apenas o próprio perfil; staff lê apenas perfis do MESMO event_id (has_any_event_role compara o event_id da linha com o vínculo em event_staff). Habilita Realtime da fila operacional sem vazamento entre eventos.';

CREATE POLICY profiles_insert_own
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());
COMMENT ON POLICY profiles_insert_own ON public.profiles IS
  'Somente o próprio usuário autenticado pode inserir seu perfil (owner_id = auth.uid()).';

CREATE POLICY profiles_staff_manage_same_event
  ON public.profiles FOR ALL
  TO authenticated
  USING (public.has_any_event_role(event_id, auth.uid()))
  WITH CHECK (public.has_any_event_role(event_id, auth.uid()));
COMMENT ON POLICY profiles_staff_manage_same_event ON public.profiles IS
  'Staff/admin pode gerenciar perfis do MESMO evento (event_id). Nunca de outro evento.';

-- ============ matches ============
DROP POLICY IF EXISTS "matches readable" ON public.matches;
DROP POLICY IF EXISTS matches_select_participant_or_event_staff ON public.matches;

CREATE POLICY matches_select_participant_or_event_staff
  ON public.matches FOR SELECT
  TO authenticated
  USING (
    public.has_any_event_role(event_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = ANY (ARRAY[matches.a_profile_id, matches.b_profile_id])
        AND p.owner_id = auth.uid()
    )
  );
COMMENT ON POLICY matches_select_participant_or_event_staff ON public.matches IS
  'Escopo por evento: participante vê apenas matches em que é A ou B; staff vê apenas matches do MESMO event_id. Realtime publica esta tabela — o filtro por event_id na policy garante isolamento entre eventos.';

-- ============ connections ============
DROP POLICY IF EXISTS "connections readable" ON public.connections;
DROP POLICY IF EXISTS connections_select_participant_or_event_staff ON public.connections;

CREATE POLICY connections_select_participant_or_event_staff
  ON public.connections FOR SELECT
  TO authenticated
  USING (
    public.has_any_event_role(event_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = ANY (ARRAY[connections.a_profile_id, connections.b_profile_id])
        AND p.owner_id = auth.uid()
    )
  );
COMMENT ON POLICY connections_select_participant_or_event_staff ON public.connections IS
  'Escopo por evento: participante vê apenas connections em que é A ou B; staff vê apenas connections do MESMO event_id. Escritas ocorrem apenas via RPCs SECURITY DEFINER (staff_*). Realtime publica esta tabela — o filtro por event_id garante isolamento entre eventos.';

-- ============ event_staff ============
DROP POLICY IF EXISTS "own event_staff readable" ON public.event_staff;
DROP POLICY IF EXISTS "admins manage event_staff" ON public.event_staff;
DROP POLICY IF EXISTS event_staff_select_self_or_admin ON public.event_staff;
DROP POLICY IF EXISTS event_staff_admin_manage_same_event ON public.event_staff;

CREATE POLICY event_staff_select_self_or_admin
  ON public.event_staff FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_event_role(event_id, auth.uid(), 'admin'::public.app_role)
  );
COMMENT ON POLICY event_staff_select_self_or_admin ON public.event_staff IS
  'Usuário lê o próprio vínculo; admin lê o roster APENAS do evento em que é admin.';

CREATE POLICY event_staff_admin_manage_same_event
  ON public.event_staff FOR ALL
  TO authenticated
  USING (public.has_event_role(event_id, auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_event_role(event_id, auth.uid(), 'admin'::public.app_role));
COMMENT ON POLICY event_staff_admin_manage_same_event ON public.event_staff IS
  'Admin gerencia event_staff APENAS do MESMO event_id. Não pode alterar roster de outro evento.';

-- Garantir que anon nunca tenha grants nessas tabelas (idempotente).
REVOKE ALL ON public.profiles, public.matches, public.connections, public.event_staff FROM anon;