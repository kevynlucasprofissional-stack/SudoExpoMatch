CREATE TABLE public.offline_connections (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id text NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  party_a text NOT NULL,
  party_b text NOT NULL,
  note text,
  recorded_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.offline_connections TO authenticated;
GRANT ALL ON public.offline_connections TO service_role;

ALTER TABLE public.offline_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff do evento leem conexoes offline"
  ON public.offline_connections FOR SELECT TO authenticated
  USING (public.has_any_event_role(event_id, auth.uid()));

CREATE POLICY "Staff do evento registram conexoes offline"
  ON public.offline_connections FOR INSERT TO authenticated
  WITH CHECK (public.has_any_event_role(event_id, auth.uid()));

CREATE POLICY "Staff do evento atualizam conexoes offline"
  ON public.offline_connections FOR UPDATE TO authenticated
  USING (public.has_any_event_role(event_id, auth.uid()))
  WITH CHECK (public.has_any_event_role(event_id, auth.uid()));

CREATE POLICY "Admin do evento remove conexoes offline"
  ON public.offline_connections FOR DELETE TO authenticated
  USING (public.has_event_role(event_id, auth.uid(), 'admin'));

CREATE TRIGGER offline_connections_set_updated_at
  BEFORE UPDATE ON public.offline_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX offline_connections_event_idx ON public.offline_connections(event_id);

CREATE OR REPLACE FUNCTION public.event_stats(_event_id text)
 RETURNS TABLE(total_profiles integer, total_matches integer, mutual_matches integer, total_connections integer, completed_connections integer, total_segments integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    (SELECT count(*)::int FROM public.profiles WHERE event_id = _event_id),
    (SELECT count(*)::int FROM public.matches WHERE event_id = _event_id),
    (SELECT count(*)::int FROM public.matches m
      WHERE m.event_id = _event_id
        AND (SELECT count(*) FROM public.match_decisions d
              WHERE d.match_id=m.id AND d.decision='interesse'
                AND d.profile_id IN (m.a_profile_id, m.b_profile_id)) = 2),
    (SELECT count(*)::int FROM public.connections WHERE event_id = _event_id)
      + (SELECT count(*)::int FROM public.offline_connections WHERE event_id = _event_id),
    (SELECT count(*)::int FROM public.connections WHERE event_id = _event_id AND status='concluido')
      + (SELECT count(*)::int FROM public.offline_connections WHERE event_id = _event_id),
    (SELECT count(*)::int FROM public.segments);
$function$;