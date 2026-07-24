-- ============================================================
-- FASE 1: SEGURANÇA, AUTH E NORMALIZAÇÃO (aditiva, não-quebrante)
-- ============================================================

-- ---------- Extensões / schemas ----------
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO service_role;

-- ---------- Helpers de hash ----------
CREATE OR REPLACE FUNCTION public.normalize_phone(_raw text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN _raw IS NULL THEN NULL
    ELSE regexp_replace(_raw, '\D', '', 'g')
  END;
$$;

CREATE OR REPLACE FUNCTION public.hash_phone(_phone_e164 text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN _phone_e164 IS NULL OR _phone_e164 = '' THEN NULL
    ELSE encode(extensions.digest(_phone_e164, 'sha256'), 'hex')
  END;
$$;

CREATE OR REPLACE FUNCTION public.hash_recovery_code(_code text)
RETURNS text LANGUAGE sql VOLATILE AS $$
  SELECT extensions.crypt(_code, extensions.gen_salt('bf', 10));
$$;

CREATE OR REPLACE FUNCTION public.verify_recovery_code(_code text, _hash text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT _hash IS NOT NULL AND extensions.crypt(_code, _hash) = _hash;
$$;

-- ---------- Private tables ----------
CREATE TABLE IF NOT EXISTS private.profile_contacts (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_id text NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  phone_e164 text NOT NULL,
  phone_hash text NOT NULL,
  email text,
  phone_verified_at timestamptz,
  contact_sharing_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS profile_contacts_event_idx ON private.profile_contacts(event_id);
CREATE INDEX IF NOT EXISTS profile_contacts_phone_hash_idx ON private.profile_contacts(event_id, phone_hash);
GRANT ALL ON private.profile_contacts TO service_role;
ALTER TABLE private.profile_contacts ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS private.profile_recovery (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_id text NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  recovery_code_hash text NOT NULL,
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  last_recovered_at timestamptz,
  code_rotated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON private.profile_recovery TO service_role;
ALTER TABLE private.profile_recovery ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS private.recovery_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL,
  phone_hash text NOT NULL,
  succeeded boolean NOT NULL,
  ip inet,
  user_agent text,
  attempted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS recovery_attempts_lookup_idx
  ON private.recovery_attempts(event_id, phone_hash, attempted_at DESC);
GRANT ALL ON private.recovery_attempts TO service_role;
ALTER TABLE private.recovery_attempts ENABLE ROW LEVEL SECURITY;

-- ---------- Trigger updated_at reutilizável em private ----------
CREATE OR REPLACE FUNCTION private.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = private, public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_pc_updated ON private.profile_contacts;
CREATE TRIGGER trg_pc_updated BEFORE UPDATE ON private.profile_contacts
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

DROP TRIGGER IF EXISTS trg_pr_updated ON private.profile_recovery;
CREATE TRIGGER trg_pr_updated BEFORE UPDATE ON private.profile_recovery
  FOR EACH ROW EXECUTE FUNCTION private.set_updated_at();

-- ---------- Backfill de contatos e recuperação ----------
DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN SELECT id, event_id, whatsapp, recovery_code, is_demo FROM public.profiles LOOP
    -- Contato: se demo, usa telefone fictício determinístico
    INSERT INTO private.profile_contacts(profile_id, event_id, phone_e164, phone_hash, contact_sharing_enabled)
    VALUES (
      p.id,
      p.event_id,
      CASE WHEN p.is_demo THEN '+55DEMO' || replace(p.id::text,'-','') ELSE COALESCE(public.normalize_phone(p.whatsapp),'') END,
      public.hash_phone(CASE WHEN p.is_demo THEN '+55DEMO' || replace(p.id::text,'-','') ELSE COALESCE(public.normalize_phone(p.whatsapp),'') END),
      NOT p.is_demo
    )
    ON CONFLICT (profile_id) DO NOTHING;

    -- Recuperação: hash do código atual
    IF p.recovery_code IS NOT NULL AND length(p.recovery_code) > 0 THEN
      INSERT INTO private.profile_recovery(profile_id, event_id, recovery_code_hash)
      VALUES (p.id, p.event_id, public.hash_recovery_code(p.recovery_code))
      ON CONFLICT (profile_id) DO NOTHING;
    END IF;
  END LOOP;
END $$;

-- ---------- event_staff ----------
CREATE TABLE IF NOT EXISTS public.event_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id, user_id, role)
);
CREATE INDEX IF NOT EXISTS event_staff_user_idx ON public.event_staff(user_id);
GRANT SELECT ON public.event_staff TO authenticated;
GRANT ALL ON public.event_staff TO service_role;
ALTER TABLE public.event_staff ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_event_role(_event_id text, _user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.event_staff
    WHERE event_id = _event_id AND user_id = _user_id AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.has_any_event_role(_event_id text, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(
    SELECT 1 FROM public.event_staff
    WHERE event_id = _event_id AND user_id = _user_id
  );
$$;

-- Atualiza is_staff para reconhecer também event_staff (retrocompat)
CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    EXISTS(SELECT 1 FROM public.staff_roles WHERE user_id = _user_id AND role IN ('admin','staff'))
    OR EXISTS(SELECT 1 FROM public.event_staff WHERE user_id = _user_id AND role IN ('admin','staff'));
$$;

CREATE POLICY "own event_staff readable" ON public.event_staff
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR has_event_role(event_id, auth.uid(), 'admin'));

CREATE POLICY "admins manage event_staff" ON public.event_staff
  FOR ALL TO authenticated
  USING (has_event_role(event_id, auth.uid(), 'admin'))
  WITH CHECK (has_event_role(event_id, auth.uid(), 'admin'));

-- ---------- Taxonomia + normalização ----------
CREATE TABLE IF NOT EXISTS public.taxonomy_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  label text NOT NULL,
  kind text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.taxonomy_items TO anon, authenticated;
GRANT ALL ON public.taxonomy_items TO service_role;
ALTER TABLE public.taxonomy_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "taxonomy readable" ON public.taxonomy_items FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "taxonomy staff writable" ON public.taxonomy_items FOR ALL TO authenticated
  USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

CREATE TABLE IF NOT EXISTS public.profile_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  segment_id text NOT NULL REFERENCES public.segments(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(profile_id, segment_id)
);
CREATE INDEX IF NOT EXISTS profile_segments_profile_idx ON public.profile_segments(profile_id);
GRANT SELECT ON public.profile_segments TO authenticated;
GRANT ALL ON public.profile_segments TO service_role;
ALTER TABLE public.profile_segments ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.profile_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_id text NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  segment_id text REFERENCES public.segments(id) ON DELETE SET NULL,
  text text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS profile_offers_profile_idx ON public.profile_offers(profile_id);
CREATE INDEX IF NOT EXISTS profile_offers_event_idx ON public.profile_offers(event_id);
GRANT SELECT ON public.profile_offers TO anon, authenticated;
GRANT ALL ON public.profile_offers TO service_role;
ALTER TABLE public.profile_offers ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.profile_needs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_id text NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  segment_id text REFERENCES public.segments(id) ON DELETE SET NULL,
  text text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS profile_needs_profile_idx ON public.profile_needs(profile_id);
CREATE INDEX IF NOT EXISTS profile_needs_event_idx ON public.profile_needs(event_id);
GRANT SELECT ON public.profile_needs TO anon, authenticated;
GRANT ALL ON public.profile_needs TO service_role;
ALTER TABLE public.profile_needs ENABLE ROW LEVEL SECURITY;

-- Backfill offers/needs a partir do JSONB atual
INSERT INTO public.profile_segments(profile_id, segment_id, is_primary)
SELECT id, segment_id, true FROM public.profiles
ON CONFLICT DO NOTHING;

DO $$
DECLARE r RECORD; item jsonb; idx int;
BEGIN
  FOR r IN SELECT id, event_id, segment_id, offers, needs FROM public.profiles LOOP
    idx := 0;
    FOR item IN SELECT * FROM jsonb_array_elements(COALESCE(r.offers, '[]'::jsonb)) LOOP
      INSERT INTO public.profile_offers(profile_id, event_id, segment_id, text, sort_order)
      VALUES (
        r.id, r.event_id,
        COALESCE(NULLIF(item->>'segmentId','')::text, r.segment_id),
        COALESCE(item->>'text', item::text),
        idx
      );
      idx := idx + 1;
    END LOOP;
    idx := 0;
    FOR item IN SELECT * FROM jsonb_array_elements(COALESCE(r.needs, '[]'::jsonb)) LOOP
      INSERT INTO public.profile_needs(profile_id, event_id, segment_id, text, sort_order)
      VALUES (
        r.id, r.event_id,
        COALESCE(NULLIF(item->>'segmentId','')::text, r.segment_id),
        COALESCE(item->>'text', item::text),
        idx
      );
      idx := idx + 1;
    END LOOP;
  END LOOP;
END $$;

-- ---------- Match reasons + decisions + history ----------
CREATE TABLE IF NOT EXISTS public.match_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  perspective_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  code text NOT NULL,
  label text NOT NULL,
  weight integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS match_reasons_match_idx ON public.match_reasons(match_id);
GRANT SELECT ON public.match_reasons TO authenticated;
GRANT ALL ON public.match_reasons TO service_role;
ALTER TABLE public.match_reasons ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.match_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  decision public.decision NOT NULL,
  decided_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(match_id, profile_id)
);
CREATE INDEX IF NOT EXISTS match_decisions_match_idx ON public.match_decisions(match_id);
GRANT SELECT ON public.match_decisions TO authenticated;
GRANT ALL ON public.match_decisions TO service_role;
ALTER TABLE public.match_decisions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.match_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  actor_user_id uuid,
  actor_profile_id uuid,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS msh_match_idx ON public.match_status_history(match_id, created_at DESC);
GRANT SELECT ON public.match_status_history TO authenticated;
GRANT ALL ON public.match_status_history TO service_role;
ALTER TABLE public.match_status_history ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.connection_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.connections(id) ON DELETE CASCADE,
  from_status public.connection_status,
  to_status public.connection_status NOT NULL,
  actor_user_id uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS csh_conn_idx ON public.connection_status_history(connection_id, created_at DESC);
GRANT SELECT ON public.connection_status_history TO authenticated;
GRANT ALL ON public.connection_status_history TO service_role;
ALTER TABLE public.connection_status_history ENABLE ROW LEVEL SECURITY;

-- ---------- Consents, AI runs, analytics, audit ----------
CREATE TABLE IF NOT EXISTS public.consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_id text NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  consent_type text NOT NULL,
  version text NOT NULL DEFAULT '1',
  granted boolean NOT NULL,
  ip inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS consents_profile_idx ON public.consents(profile_id);
GRANT SELECT, INSERT ON public.consents TO authenticated;
GRANT ALL ON public.consents TO service_role;
ALTER TABLE public.consents ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.ai_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_id text REFERENCES public.events(id) ON DELETE CASCADE,
  run_kind text NOT NULL,
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  output jsonb NOT NULL DEFAULT '{}'::jsonb,
  model text,
  latency_ms integer,
  succeeded boolean NOT NULL DEFAULT true,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ai_runs TO authenticated;
GRANT ALL ON public.ai_runs TO service_role;
ALTER TABLE public.ai_runs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text REFERENCES public.events(id) ON DELETE CASCADE,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_user_id uuid,
  kind text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS analytics_kind_idx ON public.analytics_events(event_id, kind, created_at DESC);
GRANT INSERT ON public.analytics_events TO authenticated;
GRANT ALL ON public.analytics_events TO service_role;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text REFERENCES public.events(id) ON DELETE SET NULL,
  actor_user_id uuid,
  target_table text NOT NULL,
  target_id text,
  action text NOT NULL,
  before jsonb,
  after jsonb,
  ip inet,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_target_idx ON public.audit_logs(target_table, target_id);
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- ---------- Políticas: private (staff-only via RPCs; sem policies gerais) ----------
-- Sem policies em private.* → apenas SECURITY DEFINER RPCs conseguem ler/escrever.

-- Policies normalização: participante vê o próprio; staff vê do evento.
CREATE POLICY "own or staff read profile_segments" ON public.profile_segments
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = profile_segments.profile_id
      AND (p.owner_id = auth.uid() OR has_any_event_role(p.event_id, auth.uid())))
  );

CREATE POLICY "own or staff read profile_offers" ON public.profile_offers
  FOR SELECT TO anon, authenticated
  USING (true); -- ofertas são profissionais e públicas; sem PII

CREATE POLICY "own or staff read profile_needs" ON public.profile_needs
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY "match_reasons visible to peers/staff" ON public.match_reasons
  FOR SELECT TO authenticated
  USING (
    EXISTS(
      SELECT 1 FROM public.matches m
      JOIN public.profiles p ON p.id IN (m.a_profile_id, m.b_profile_id)
      WHERE m.id = match_reasons.match_id
        AND (p.owner_id = auth.uid() OR has_any_event_role(m.event_id, auth.uid()))
    )
  );

CREATE POLICY "match_decisions visible to peers/staff" ON public.match_decisions
  FOR SELECT TO authenticated
  USING (
    EXISTS(
      SELECT 1 FROM public.matches m
      JOIN public.profiles p ON p.id IN (m.a_profile_id, m.b_profile_id)
      WHERE m.id = match_decisions.match_id
        AND (p.owner_id = auth.uid() OR has_any_event_role(m.event_id, auth.uid()))
    )
  );

CREATE POLICY "history visible to staff" ON public.match_status_history
  FOR SELECT TO authenticated
  USING (
    EXISTS(SELECT 1 FROM public.matches m
      WHERE m.id = match_status_history.match_id
        AND has_any_event_role(m.event_id, auth.uid()))
  );

CREATE POLICY "conn history visible to staff/peers" ON public.connection_status_history
  FOR SELECT TO authenticated
  USING (
    EXISTS(SELECT 1 FROM public.connections c
      JOIN public.profiles p ON p.id IN (c.a_profile_id, c.b_profile_id)
      WHERE c.id = connection_status_history.connection_id
        AND (p.owner_id = auth.uid() OR has_any_event_role(c.event_id, auth.uid())))
  );

CREATE POLICY "own consents readable" ON public.consents
  FOR SELECT TO authenticated
  USING (EXISTS(SELECT 1 FROM public.profiles p WHERE p.id = consents.profile_id AND p.owner_id = auth.uid()));

CREATE POLICY "own consents insertable" ON public.consents
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS(SELECT 1 FROM public.profiles p WHERE p.id = consents.profile_id AND p.owner_id = auth.uid()));

CREATE POLICY "ai_runs staff readable" ON public.ai_runs
  FOR SELECT TO authenticated
  USING (event_id IS NULL OR has_any_event_role(event_id, auth.uid()));

CREATE POLICY "analytics insertable by authenticated" ON public.analytics_events
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "audit staff readable" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (event_id IS NOT NULL AND has_any_event_role(event_id, auth.uid()));

-- ============================================================
-- Endurecimento: profiles, matches, connections
-- ============================================================

-- Remove policies antigas frouxas
DROP POLICY IF EXISTS "profiles publicly readable" ON public.profiles;
DROP POLICY IF EXISTS "anyone can create own profile" ON public.profiles;
DROP POLICY IF EXISTS "own or staff can update profile" ON public.profiles;

DROP POLICY IF EXISTS "match insertable by anyone" ON public.matches;
DROP POLICY IF EXISTS "match updatable by participants and staff" ON public.matches;
DROP POLICY IF EXISTS "match visible to participants and staff" ON public.matches;
DROP POLICY IF EXISTS "match deletable by staff" ON public.matches;

DROP POLICY IF EXISTS "connection insertable by anyone" ON public.connections;
DROP POLICY IF EXISTS "connection updatable by staff" ON public.connections;
DROP POLICY IF EXISTS "connection visible to participants and staff" ON public.connections;

-- Profiles: leitura só para dono, staff, ou peer via match (não expõe contato pois whatsapp/recovery estão revogados).
CREATE POLICY "own profile readable" ON public.profiles
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR has_any_event_role(event_id, auth.uid()));

-- INSERT/UPDATE de profile só via RPC upsert_own_profile (SECURITY DEFINER); frontend não escreve direto.
CREATE POLICY "profiles staff manage" ON public.profiles
  FOR ALL TO authenticated
  USING (has_any_event_role(event_id, auth.uid()))
  WITH CHECK (has_any_event_role(event_id, auth.uid()));

-- Revoga acesso direto às colunas sensíveis
REVOKE ALL ON public.profiles FROM anon, authenticated;
GRANT SELECT (id, owner_id, event_id, name, company, city, neighborhood, segment_id, summary, offers, needs, consent, is_demo, created_at, updated_at) ON public.profiles TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.profiles TO service_role;
GRANT ALL ON public.profiles TO service_role;

-- Matches: leitura para participantes/staff; escrita só via RPC.
CREATE POLICY "matches readable" ON public.matches
  FOR SELECT TO authenticated
  USING (
    has_any_event_role(event_id, auth.uid())
    OR EXISTS(SELECT 1 FROM public.profiles p
      WHERE p.id IN (matches.a_profile_id, matches.b_profile_id) AND p.owner_id = auth.uid())
  );

-- Connections: leitura para participantes/staff; escrita só via RPC.
CREATE POLICY "connections readable" ON public.connections
  FOR SELECT TO authenticated
  USING (
    has_any_event_role(event_id, auth.uid())
    OR EXISTS(SELECT 1 FROM public.profiles p
      WHERE p.id IN (connections.a_profile_id, connections.b_profile_id) AND p.owner_id = auth.uid())
  );

REVOKE INSERT, UPDATE, DELETE ON public.matches FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.connections FROM anon, authenticated;

-- ============================================================
-- RPCs seguras
-- ============================================================

-- upsert do próprio perfil (participante autenticado)
CREATE OR REPLACE FUNCTION public.upsert_own_profile(
  _event_id text,
  _name text,
  _company text,
  _city text,
  _neighborhood text,
  _segment_id text,
  _summary text,
  _consent boolean,
  _offers jsonb,
  _needs jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
  v_item jsonb;
  v_idx int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _consent IS NOT TRUE THEN RAISE EXCEPTION 'consent_required'; END IF;

  SELECT id INTO v_id FROM public.profiles
    WHERE event_id = _event_id AND owner_id = v_uid AND is_demo = false LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO public.profiles(owner_id, event_id, name, company, city, neighborhood,
      whatsapp, segment_id, summary, offers, needs, consent, is_demo, recovery_code)
    VALUES (v_uid, _event_id, _name, _company, _city, _neighborhood,
      '', _segment_id, _summary, COALESCE(_offers,'[]'::jsonb), COALESCE(_needs,'[]'::jsonb),
      true, false, '')
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.profiles
      SET name=_name, company=_company, city=_city, neighborhood=_neighborhood,
          segment_id=_segment_id, summary=_summary, offers=COALESCE(_offers,'[]'::jsonb),
          needs=COALESCE(_needs,'[]'::jsonb), consent=true, updated_at=now()
      WHERE id=v_id;
  END IF;

  -- Repopula segments/offers/needs normalizados
  DELETE FROM public.profile_segments WHERE profile_id = v_id;
  INSERT INTO public.profile_segments(profile_id, segment_id, is_primary) VALUES (v_id, _segment_id, true);

  DELETE FROM public.profile_offers WHERE profile_id = v_id;
  v_idx := 0;
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(_offers,'[]'::jsonb)) LOOP
    INSERT INTO public.profile_offers(profile_id, event_id, segment_id, text, sort_order)
    VALUES (v_id, _event_id, COALESCE(NULLIF(v_item->>'segmentId','')::text, _segment_id),
            COALESCE(v_item->>'text', v_item::text), v_idx);
    v_idx := v_idx + 1;
  END LOOP;

  DELETE FROM public.profile_needs WHERE profile_id = v_id;
  v_idx := 0;
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(_needs,'[]'::jsonb)) LOOP
    INSERT INTO public.profile_needs(profile_id, event_id, segment_id, text, sort_order)
    VALUES (v_id, _event_id, COALESCE(NULLIF(v_item->>'segmentId','')::text, _segment_id),
            COALESCE(v_item->>'text', v_item::text), v_idx);
    v_idx := v_idx + 1;
  END LOOP;

  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.upsert_own_profile(text,text,text,text,text,text,text,boolean,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_own_profile(text,text,text,text,text,text,text,boolean,jsonb,jsonb) TO authenticated;

-- Definir contato próprio
CREATE OR REPLACE FUNCTION public.set_own_contact(_phone_e164 text, _email text DEFAULT NULL, _sharing boolean DEFAULT true)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE v_uid uuid := auth.uid(); v_pid uuid; v_event text; v_norm text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT id, event_id INTO v_pid, v_event FROM public.profiles
    WHERE owner_id = v_uid AND is_demo = false LIMIT 1;
  IF v_pid IS NULL THEN RAISE EXCEPTION 'profile_not_found'; END IF;
  v_norm := public.normalize_phone(_phone_e164);
  IF v_norm IS NULL OR length(v_norm) < 10 THEN RAISE EXCEPTION 'invalid_phone'; END IF;

  INSERT INTO private.profile_contacts(profile_id, event_id, phone_e164, phone_hash, email, contact_sharing_enabled)
  VALUES (v_pid, v_event, v_norm, public.hash_phone(v_norm), _email, _sharing)
  ON CONFLICT (profile_id) DO UPDATE
    SET phone_e164 = EXCLUDED.phone_e164,
        phone_hash = EXCLUDED.phone_hash,
        email = EXCLUDED.email,
        contact_sharing_enabled = EXCLUDED.contact_sharing_enabled,
        updated_at = now();
END $$;
REVOKE ALL ON FUNCTION public.set_own_contact(text,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_own_contact(text,text,boolean) TO authenticated;

-- Definir/rotacionar código de recuperação; retorna código em texto plano UMA vez
CREATE OR REPLACE FUNCTION public.rotate_own_recovery_code()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE v_uid uuid := auth.uid(); v_pid uuid; v_event text; v_code text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT id, event_id INTO v_pid, v_event FROM public.profiles
    WHERE owner_id = v_uid AND is_demo = false LIMIT 1;
  IF v_pid IS NULL THEN RAISE EXCEPTION 'profile_not_found'; END IF;
  v_code := upper(substring(encode(extensions.gen_random_bytes(6), 'hex') from 1 for 8));
  INSERT INTO private.profile_recovery(profile_id, event_id, recovery_code_hash, code_rotated_at)
  VALUES (v_pid, v_event, public.hash_recovery_code(v_code), now())
  ON CONFLICT (profile_id) DO UPDATE
    SET recovery_code_hash = EXCLUDED.recovery_code_hash,
        code_rotated_at = now(), failed_attempts = 0, locked_until = NULL, updated_at = now();
  RETURN v_code;
END $$;
REVOKE ALL ON FUNCTION public.rotate_own_recovery_code() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rotate_own_recovery_code() TO authenticated;

-- Recuperação: identifica perfil por telefone+código com rate limit
CREATE OR REPLACE FUNCTION public.recover_profile(_event_id text, _phone_e164 text, _code text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE v_norm text; v_hash text; v_pid uuid; v_rec RECORD; v_recent int;
BEGIN
  v_norm := public.normalize_phone(_phone_e164);
  IF v_norm IS NULL OR _code IS NULL OR length(_code) < 4 THEN RAISE EXCEPTION 'invalid_input'; END IF;
  v_hash := public.hash_phone(v_norm);

  SELECT COUNT(*) INTO v_recent FROM private.recovery_attempts
    WHERE event_id = _event_id AND phone_hash = v_hash
      AND attempted_at > now() - interval '15 minutes';
  IF v_recent >= 10 THEN RAISE EXCEPTION 'rate_limited'; END IF;

  SELECT pc.profile_id INTO v_pid FROM private.profile_contacts pc
    WHERE pc.event_id = _event_id AND pc.phone_hash = v_hash LIMIT 1;

  IF v_pid IS NULL THEN
    INSERT INTO private.recovery_attempts(event_id, phone_hash, succeeded) VALUES (_event_id, v_hash, false);
    RAISE EXCEPTION 'not_found';
  END IF;

  SELECT * INTO v_rec FROM private.profile_recovery WHERE profile_id = v_pid;
  IF v_rec.locked_until IS NOT NULL AND v_rec.locked_until > now() THEN
    RAISE EXCEPTION 'locked';
  END IF;

  IF NOT public.verify_recovery_code(_code, v_rec.recovery_code_hash) THEN
    UPDATE private.profile_recovery
      SET failed_attempts = failed_attempts + 1,
          locked_until = CASE WHEN failed_attempts + 1 >= 5 THEN now() + interval '15 minutes' ELSE locked_until END,
          updated_at = now()
      WHERE profile_id = v_pid;
    INSERT INTO private.recovery_attempts(event_id, phone_hash, succeeded) VALUES (_event_id, v_hash, false);
    RAISE EXCEPTION 'invalid_code';
  END IF;

  UPDATE private.profile_recovery
    SET failed_attempts = 0, locked_until = NULL, last_recovered_at = now(), updated_at = now()
    WHERE profile_id = v_pid;
  INSERT INTO private.recovery_attempts(event_id, phone_hash, succeeded) VALUES (_event_id, v_hash, true);

  -- Vincula o perfil ao usuário autenticado atual (se houver)
  IF auth.uid() IS NOT NULL THEN
    UPDATE public.profiles SET owner_id = auth.uid()
      WHERE id = v_pid AND (owner_id IS NULL OR owner_id = auth.uid()) AND is_demo = false;
  END IF;

  RETURN v_pid;
END $$;
REVOKE ALL ON FUNCTION public.recover_profile(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recover_profile(text,text,text) TO anon, authenticated;

-- Decisão do próprio lado do match
CREATE OR REPLACE FUNCTION public.record_match_decision(_match_id uuid, _decision public.decision)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_m RECORD; v_side char;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT m.*, pa.owner_id AS a_owner, pb.owner_id AS b_owner
    INTO v_m
    FROM public.matches m
    JOIN public.profiles pa ON pa.id = m.a_profile_id
    JOIN public.profiles pb ON pb.id = m.b_profile_id
    WHERE m.id = _match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'match_not_found'; END IF;

  IF v_m.a_owner = v_uid THEN v_side := 'a';
  ELSIF v_m.b_owner = v_uid THEN v_side := 'b';
  ELSE RAISE EXCEPTION 'not_a_participant'; END IF;

  IF v_side = 'a' THEN
    UPDATE public.matches SET decision_a = _decision, updated_at = now() WHERE id = _match_id;
    INSERT INTO public.match_decisions(match_id, profile_id, decision)
      VALUES (_match_id, v_m.a_profile_id, _decision)
      ON CONFLICT (match_id, profile_id) DO UPDATE SET decision = EXCLUDED.decision, decided_at = now();
  ELSE
    UPDATE public.matches SET decision_b = _decision, updated_at = now() WHERE id = _match_id;
    INSERT INTO public.match_decisions(match_id, profile_id, decision)
      VALUES (_match_id, v_m.b_profile_id, _decision)
      ON CONFLICT (match_id, profile_id) DO UPDATE SET decision = EXCLUDED.decision, decided_at = now();
  END IF;

  INSERT INTO public.match_status_history(match_id, actor_user_id, actor_profile_id, event_type, payload)
    VALUES (_match_id, v_uid, CASE WHEN v_side='a' THEN v_m.a_profile_id ELSE v_m.b_profile_id END,
            'decision', jsonb_build_object('side', v_side, 'decision', _decision));
END $$;
REVOKE ALL ON FUNCTION public.record_match_decision(uuid, public.decision) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_match_decision(uuid, public.decision) TO authenticated;

-- Armazena matches computados envolvendo o próprio perfil (bridge para o cálculo atual no cliente)
CREATE OR REPLACE FUNCTION public.store_computed_matches(_matches jsonb)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_item jsonb; v_a uuid; v_b uuid; v_swap uuid; v_count int := 0; v_mid uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(_matches,'[]'::jsonb)) LOOP
    v_a := (v_item->>'a_profile_id')::uuid;
    v_b := (v_item->>'b_profile_id')::uuid;
    -- Precisa envolver perfil do usuário (ou demo)
    IF NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id IN (v_a, v_b) AND (p.owner_id = v_uid OR p.is_demo)) THEN
      CONTINUE;
    END IF;
    IF v_a > v_b THEN v_swap := v_a; v_a := v_b; v_b := v_swap; END IF;

    INSERT INTO public.matches(event_id, a_profile_id, b_profile_id, kind, score_for_a, score_for_b, label, reasons_for_a, reasons_for_b)
    VALUES (
      v_item->>'event_id', v_a, v_b,
      (v_item->>'kind')::public.match_kind,
      COALESCE((v_item->>'score_for_a')::int, 0),
      COALESCE((v_item->>'score_for_b')::int, 0),
      (v_item->>'label')::public.match_label,
      COALESCE(v_item->'reasons_for_a', '[]'::jsonb),
      COALESCE(v_item->'reasons_for_b', '[]'::jsonb)
    )
    ON CONFLICT (a_profile_id, b_profile_id) DO UPDATE
      SET kind = EXCLUDED.kind, score_for_a = EXCLUDED.score_for_a, score_for_b = EXCLUDED.score_for_b,
          label = EXCLUDED.label, reasons_for_a = EXCLUDED.reasons_for_a, reasons_for_b = EXCLUDED.reasons_for_b,
          updated_at = now()
    RETURNING id INTO v_mid;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END $$;
REVOKE ALL ON FUNCTION public.store_computed_matches(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.store_computed_matches(jsonb) TO authenticated;

-- Liberação de contato ao participante: só quando mútuo + connection.status >= apresentados
CREATE OR REPLACE FUNCTION public.reveal_contact_for_match(_match_id uuid)
RETURNS TABLE(phone_e164 text, email text, name text, company text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE v_uid uuid := auth.uid(); v_m RECORD; v_conn RECORD; v_other uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT m.*, pa.owner_id AS a_owner, pb.owner_id AS b_owner
    INTO v_m FROM public.matches m
    JOIN public.profiles pa ON pa.id = m.a_profile_id
    JOIN public.profiles pb ON pb.id = m.b_profile_id
    WHERE m.id = _match_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'match_not_found'; END IF;

  IF v_m.a_owner = v_uid THEN v_other := v_m.b_profile_id;
  ELSIF v_m.b_owner = v_uid THEN v_other := v_m.a_profile_id;
  ELSE RAISE EXCEPTION 'not_a_participant'; END IF;

  IF v_m.decision_a <> 'interesse' OR v_m.decision_b <> 'interesse' THEN
    RAISE EXCEPTION 'not_mutual';
  END IF;

  SELECT * INTO v_conn FROM public.connections WHERE match_id = _match_id;
  IF v_conn IS NULL OR v_conn.status NOT IN ('apresentados','contato_trocado','concluido') THEN
    RAISE EXCEPTION 'not_yet_introduced';
  END IF;

  RETURN QUERY
    SELECT pc.phone_e164, pc.email, p.name, p.company
    FROM public.profiles p
    JOIN private.profile_contacts pc ON pc.profile_id = p.id
    WHERE p.id = v_other AND pc.contact_sharing_enabled = true;
END $$;
REVOKE ALL ON FUNCTION public.reveal_contact_for_match(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reveal_contact_for_match(uuid) TO authenticated;

-- Liberação para staff autorizado do evento
CREATE OR REPLACE FUNCTION public.staff_reveal_contact_for_match(_match_id uuid)
RETURNS TABLE(profile_id uuid, name text, company text, phone_e164 text, email text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE v_uid uuid := auth.uid(); v_ev text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT m.event_id INTO v_ev FROM public.matches m WHERE m.id = _match_id;
  IF v_ev IS NULL THEN RAISE EXCEPTION 'match_not_found'; END IF;
  IF NOT public.has_any_event_role(v_ev, v_uid) THEN RAISE EXCEPTION 'forbidden'; END IF;

  INSERT INTO public.audit_logs(event_id, actor_user_id, target_table, target_id, action)
    VALUES (v_ev, v_uid, 'private.profile_contacts', _match_id::text, 'staff_reveal_contact');

  RETURN QUERY
    SELECT p.id, p.name, p.company, pc.phone_e164, pc.email
    FROM public.matches m
    JOIN public.profiles p ON p.id IN (m.a_profile_id, m.b_profile_id)
    LEFT JOIN private.profile_contacts pc ON pc.profile_id = p.id
    WHERE m.id = _match_id;
END $$;
REVOKE ALL ON FUNCTION public.staff_reveal_contact_for_match(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_reveal_contact_for_match(uuid) TO authenticated;

-- Staff avança status da conexão + histórico
CREATE OR REPLACE FUNCTION public.staff_advance_connection(_connection_id uuid, _new_status public.connection_status, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_c RECORD;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO v_c FROM public.connections WHERE id = _connection_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'connection_not_found'; END IF;
  IF NOT public.has_any_event_role(v_c.event_id, v_uid) THEN RAISE EXCEPTION 'forbidden'; END IF;

  UPDATE public.connections SET status = _new_status, notes = COALESCE(_note, notes),
    assigned_to = COALESCE(assigned_to, v_uid), updated_at = now()
    WHERE id = _connection_id;

  INSERT INTO public.connection_status_history(connection_id, from_status, to_status, actor_user_id, note)
    VALUES (_connection_id, v_c.status, _new_status, v_uid, _note);
END $$;
REVOKE ALL ON FUNCTION public.staff_advance_connection(uuid, public.connection_status, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_advance_connection(uuid, public.connection_status, text) TO authenticated;

-- Lista cartões públicos profissionais (sem contato/PII)
CREATE OR REPLACE FUNCTION public.list_event_profile_cards(_event_id text)
RETURNS TABLE(
  id uuid, event_id text, name text, company text, city text, neighborhood text,
  segment_id text, summary text, offers jsonb, needs jsonb, is_demo boolean,
  created_at timestamptz, updated_at timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, event_id, name, company, city, neighborhood, segment_id, summary,
         offers, needs, is_demo, created_at, updated_at
  FROM public.profiles WHERE event_id = _event_id;
$$;
REVOKE ALL ON FUNCTION public.list_event_profile_cards(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_event_profile_cards(text) TO anon, authenticated;
