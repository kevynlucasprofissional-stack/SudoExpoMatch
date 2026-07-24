
-- =========== ENUMS ===========
CREATE TYPE public.match_kind AS ENUM ('direto','inverso','bidirecional','complementar','hibrido');
CREATE TYPE public.match_label AS ENUM ('alta_compatibilidade','boa_oportunidade','conexao_possivel');
CREATE TYPE public.decision AS ENUM ('interesse','agora_nao','sem_decisao');
CREATE TYPE public.connection_status AS ENUM ('aguardando','em_atendimento','apresentados','contato_trocado','concluido','cancelado');
CREATE TYPE public.app_role AS ENUM ('admin','staff');

-- =========== HELPER: updated_at ===========
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- =========== EVENTS ===========
CREATE TABLE public.events (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  starts_at DATE,
  ends_at DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.events TO anon, authenticated;
GRANT ALL ON public.events TO service_role;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "events readable by all" ON public.events FOR SELECT USING (true);
CREATE TRIGGER trg_events_updated BEFORE UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========== SEGMENTS ===========
CREATE TABLE public.segments (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  emoji TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.segments TO anon, authenticated;
GRANT ALL ON public.segments TO service_role;
ALTER TABLE public.segments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "segments readable by all" ON public.segments FOR SELECT USING (true);

-- =========== STAFF ROLES ===========
CREATE TABLE public.staff_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.staff_roles TO authenticated;
GRANT ALL ON public.staff_roles TO service_role;
ALTER TABLE public.staff_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.staff_roles WHERE user_id = _user_id AND role = _role);
$$;
CREATE OR REPLACE FUNCTION public.is_staff(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.staff_roles WHERE user_id = _user_id AND role IN ('admin','staff'));
$$;

CREATE POLICY "own roles readable" ON public.staff_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "admins manage roles" ON public.staff_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- =========== PROFILES ===========
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_id TEXT NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  company TEXT NOT NULL,
  city TEXT NOT NULL,
  neighborhood TEXT,
  whatsapp TEXT NOT NULL,
  segment_id TEXT NOT NULL REFERENCES public.segments(id),
  summary TEXT NOT NULL,
  offers JSONB NOT NULL DEFAULT '[]'::jsonb,
  needs JSONB NOT NULL DEFAULT '[]'::jsonb,
  consent BOOLEAN NOT NULL DEFAULT false,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  recovery_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX profiles_event_idx ON public.profiles(event_id);
CREATE INDEX profiles_segment_idx ON public.profiles(segment_id);
CREATE INDEX profiles_owner_idx ON public.profiles(owner_id);
CREATE INDEX profiles_recovery_idx ON public.profiles(recovery_code);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO anon, authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own or staff can read profile" ON public.profiles FOR SELECT TO anon, authenticated
  USING (
    is_demo = true
    OR (owner_id IS NOT NULL AND owner_id = auth.uid())
    OR (auth.uid() IS NOT NULL AND public.is_staff(auth.uid()))
  );
CREATE POLICY "anyone can create own profile" ON public.profiles FOR INSERT TO anon, authenticated
  WITH CHECK (owner_id IS NULL OR owner_id = auth.uid());
CREATE POLICY "own or staff can update profile" ON public.profiles FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR public.is_staff(auth.uid()))
  WITH CHECK (owner_id = auth.uid() OR public.is_staff(auth.uid()));

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========== MATCHES ===========
CREATE TABLE public.matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  a_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  b_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind public.match_kind NOT NULL,
  score_for_a INT NOT NULL DEFAULT 0,
  score_for_b INT NOT NULL DEFAULT 0,
  label public.match_label NOT NULL,
  reasons_for_a JSONB NOT NULL DEFAULT '[]'::jsonb,
  reasons_for_b JSONB NOT NULL DEFAULT '[]'::jsonb,
  decision_a public.decision NOT NULL DEFAULT 'sem_decisao',
  decision_b public.decision NOT NULL DEFAULT 'sem_decisao',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT matches_distinct CHECK (a_profile_id <> b_profile_id),
  CONSTRAINT matches_ordered CHECK (a_profile_id < b_profile_id),
  UNIQUE (a_profile_id, b_profile_id)
);
CREATE INDEX matches_event_idx ON public.matches(event_id);
CREATE INDEX matches_a_idx ON public.matches(a_profile_id);
CREATE INDEX matches_b_idx ON public.matches(b_profile_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.matches TO anon, authenticated;
GRANT ALL ON public.matches TO service_role;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "match visible to participants and staff" ON public.matches FOR SELECT TO anon, authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id IN (a_profile_id, b_profile_id) AND (p.is_demo = true OR p.owner_id = auth.uid()))
    OR (auth.uid() IS NOT NULL AND public.is_staff(auth.uid()))
  );
CREATE POLICY "match insertable by anyone" ON public.matches FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "match updatable by participants and staff" ON public.matches FOR UPDATE TO anon, authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id IN (a_profile_id, b_profile_id) AND (p.is_demo = true OR p.owner_id = auth.uid()))
    OR (auth.uid() IS NOT NULL AND public.is_staff(auth.uid()))
  )
  WITH CHECK (true);
CREATE POLICY "match deletable by staff" ON public.matches FOR DELETE TO authenticated USING (public.is_staff(auth.uid()));

CREATE TRIGGER trg_matches_updated BEFORE UPDATE ON public.matches FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========== CONNECTIONS ===========
CREATE TABLE public.connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL UNIQUE REFERENCES public.matches(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  a_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  b_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status public.connection_status NOT NULL DEFAULT 'aguardando',
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX connections_event_idx ON public.connections(event_id);
CREATE INDEX connections_status_idx ON public.connections(status);
GRANT SELECT, INSERT, UPDATE ON public.connections TO anon, authenticated;
GRANT ALL ON public.connections TO service_role;
ALTER TABLE public.connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "connection visible to participants and staff" ON public.connections FOR SELECT TO anon, authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id IN (a_profile_id, b_profile_id) AND (p.is_demo = true OR p.owner_id = auth.uid()))
    OR (auth.uid() IS NOT NULL AND public.is_staff(auth.uid()))
  );
CREATE POLICY "connection insertable by anyone" ON public.connections FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "connection updatable by staff" ON public.connections FOR UPDATE TO authenticated USING (public.is_staff(auth.uid())) WITH CHECK (public.is_staff(auth.uid()));

CREATE TRIGGER trg_connections_updated BEFORE UPDATE ON public.connections FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========== TRIGGER: auto-create connection on mutual interest ===========
CREATE OR REPLACE FUNCTION public.auto_create_connection() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.decision_a = 'interesse' AND NEW.decision_b = 'interesse' THEN
    INSERT INTO public.connections (match_id, event_id, a_profile_id, b_profile_id)
    VALUES (NEW.id, NEW.event_id, NEW.a_profile_id, NEW.b_profile_id)
    ON CONFLICT (match_id) DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_match_mutual AFTER INSERT OR UPDATE OF decision_a, decision_b ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.auto_create_connection();

-- =========== AGGREGATE STATS RPC (public) ===========
CREATE OR REPLACE FUNCTION public.event_stats(_event_id TEXT)
RETURNS TABLE(
  total_profiles INT,
  total_matches INT,
  mutual_matches INT,
  total_connections INT,
  completed_connections INT,
  total_segments INT
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    (SELECT count(*)::int FROM public.profiles WHERE event_id = _event_id),
    (SELECT count(*)::int FROM public.matches WHERE event_id = _event_id),
    (SELECT count(*)::int FROM public.matches WHERE event_id = _event_id AND decision_a='interesse' AND decision_b='interesse'),
    (SELECT count(*)::int FROM public.connections WHERE event_id = _event_id),
    (SELECT count(*)::int FROM public.connections WHERE event_id = _event_id AND status='concluido'),
    (SELECT count(*)::int FROM public.segments);
$$;
GRANT EXECUTE ON FUNCTION public.event_stats(TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.segment_distribution(_event_id TEXT)
RETURNS TABLE(segment_id TEXT, label TEXT, emoji TEXT, total INT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, s.label, s.emoji, COUNT(p.id)::int
  FROM public.segments s
  LEFT JOIN public.profiles p ON p.segment_id = s.id AND p.event_id = _event_id
  GROUP BY s.id, s.label, s.emoji, s.sort_order
  ORDER BY s.sort_order;
$$;
GRANT EXECUTE ON FUNCTION public.segment_distribution(TEXT) TO anon, authenticated;

-- =========== REALTIME ===========
ALTER PUBLICATION supabase_realtime ADD TABLE public.matches;
ALTER PUBLICATION supabase_realtime ADD TABLE public.connections;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;

-- =========== SEEDS ===========
INSERT INTO public.events (id, name, city, starts_at, ends_at) VALUES
  ('sudoexpo-2026','SudoExpo 2026','Rio Verde','2026-05-14','2026-05-17');

INSERT INTO public.segments (id, label, emoji, sort_order) VALUES
  ('comercio','Comércio','🛍️',1),
  ('industria','Indústria','🏭',2),
  ('servicos','Serviços','🛠️',3),
  ('tecnologia','Tecnologia','💻',4),
  ('marketing','Marketing e Comunicação','📣',5),
  ('saude','Saúde','🩺',6),
  ('educacao','Educação','🎓',7),
  ('alimentacao','Alimentação','🍽️',8),
  ('agro','Agronegócio','🌱',9),
  ('construcao','Construção','🏗️',10),
  ('financas','Finanças','💳',11),
  ('logistica','Logística','🚚',12),
  ('consultoria','Consultoria','🧭',13);

-- Demo profiles
INSERT INTO public.profiles (id, event_id, name, company, city, whatsapp, segment_id, summary, offers, needs, consent, is_demo, recovery_code) VALUES
  ('11111111-1111-1111-1111-111111111101','sudoexpo-2026','Marina Alves (demo)','Alves Design','Rio Verde','(64) 90000-0001','marketing',
    'Estúdio de design e comunicação para pequenas indústrias.',
    '[{"id":"o1","label":"Design gráfico"},{"id":"o2","label":"Produção audiovisual"},{"id":"o3","label":"Gestão de redes sociais"}]',
    '[{"id":"n1","kind":"compradores","label":"Compradores para meus produtos/serviços","isPriority":true},{"id":"n2","kind":"parceiro","label":"Parceiros locais"}]',
    true, true, 'DEMO001'),
  ('11111111-1111-1111-1111-111111111102','sudoexpo-2026','Rafael Souza (demo)','Metal RV','Rio Verde','(64) 90000-0002','industria',
    'Fabricação de peças metálicas sob medida para agroindústria.',
    '[{"id":"o1","label":"Fabricação sob demanda"},{"id":"o2","label":"Metalurgia"}]',
    '[{"id":"n1","kind":"servico","label":"Design gráfico para catálogo","isPriority":true},{"id":"n2","kind":"distribuidores","label":"Distribuidores regionais"}]',
    true, true, 'DEMO002'),
  ('11111111-1111-1111-1111-111111111103','sudoexpo-2026','Camila Rocha (demo)','Rocha TI','Goiânia','(62) 90000-0003','tecnologia',
    'Desenvolvimento de software sob medida e automação de processos.',
    '[{"id":"o1","label":"Desenvolvimento de software"},{"id":"o2","label":"Automação"},{"id":"o3","label":"Suporte técnico"}]',
    '[{"id":"n1","kind":"compradores","label":"Compradores de sistemas de gestão"},{"id":"n2","kind":"parceiro","label":"Parceiros de marketing digital","isPriority":true}]',
    true, true, 'DEMO003'),
  ('11111111-1111-1111-1111-111111111104','sudoexpo-2026','João Pereira (demo)','Pereira Logística','Rio Verde','(64) 90000-0004','logistica',
    'Transporte de cargas fracionadas na região centro-oeste.',
    '[{"id":"o1","label":"Transporte de cargas"},{"id":"o2","label":"Última milha"}]',
    '[{"id":"n1","kind":"servico","label":"Automação de rotas e frota","isPriority":true},{"id":"n2","kind":"compradores","label":"Compradores de frete recorrente"}]',
    true, true, 'DEMO004'),
  ('11111111-1111-1111-1111-111111111105','sudoexpo-2026','Beatriz Lima (demo)','Nutre+','Rio Verde','(64) 90000-0005','alimentacao',
    'Fornecimento de refeições coletivas para empresas.',
    '[{"id":"o1","label":"Fornecimento de refeições"},{"id":"o2","label":"Insumos alimentícios"}]',
    '[{"id":"n1","kind":"fornecedor","label":"Fornecedores de hortifruti"},{"id":"n2","kind":"compradores","label":"Empresas com refeitório próprio","isPriority":true}]',
    true, true, 'DEMO005');
