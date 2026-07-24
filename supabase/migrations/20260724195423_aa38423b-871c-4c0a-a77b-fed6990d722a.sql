-- profile_offers: restrict SELECT to owner or event staff
DROP POLICY IF EXISTS "own or staff read profile_offers" ON public.profile_offers;
CREATE POLICY "own or staff read profile_offers"
  ON public.profile_offers FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = profile_offers.profile_id
        AND (p.owner_id = auth.uid() OR public.has_any_event_role(p.event_id, auth.uid()))
    )
  );

-- profile_needs: restrict SELECT to owner or event staff
DROP POLICY IF EXISTS "own or staff read profile_needs" ON public.profile_needs;
CREATE POLICY "own or staff read profile_needs"
  ON public.profile_needs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = profile_needs.profile_id
        AND (p.owner_id = auth.uid() OR public.has_any_event_role(p.event_id, auth.uid()))
    )
  );

-- profiles: add scoped self-insert policy (owner_id = auth.uid())
DROP POLICY IF EXISTS "own profile insert" ON public.profiles;
CREATE POLICY "own profile insert"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

-- taxonomy_items: restrict SELECT to authenticated only (app uses anonymous sign-in, so all users are authenticated)
DROP POLICY IF EXISTS "taxonomy readable" ON public.taxonomy_items;
CREATE POLICY "taxonomy readable"
  ON public.taxonomy_items FOR SELECT
  TO authenticated
  USING (true);

-- Fix mutable search_path on utility functions
ALTER FUNCTION public.hash_phone(text) SET search_path = public, extensions;
ALTER FUNCTION public.hash_recovery_code(text) SET search_path = public, extensions;
ALTER FUNCTION public.normalize_phone(text) SET search_path = public;
ALTER FUNCTION public.verify_recovery_code(text, text) SET search_path = public, extensions;