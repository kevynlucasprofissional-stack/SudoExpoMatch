-- Privilégios padrão do Supabase concedem tudo a anon/authenticated em
-- novas tabelas do schema public. Revogamos explicitamente para que
-- taxonomy_relations seja leitura-somente-staff e mutação apenas interna.
REVOKE ALL ON public.taxonomy_relations FROM anon;
REVOKE ALL ON public.taxonomy_relations FROM authenticated;
GRANT SELECT ON public.taxonomy_relations TO authenticated;
GRANT ALL ON public.taxonomy_relations TO service_role;