DROP INDEX IF EXISTS public.profiles_recovery_idx;

DROP TRIGGER IF EXISTS trg_match_mutual ON public.matches;
DROP FUNCTION IF EXISTS public.auto_create_connection();

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS offers,
  DROP COLUMN IF EXISTS needs,
  DROP COLUMN IF EXISTS whatsapp,
  DROP COLUMN IF EXISTS recovery_code,
  DROP COLUMN IF EXISTS consent;

ALTER TABLE public.matches
  DROP COLUMN IF EXISTS decision_a,
  DROP COLUMN IF EXISTS decision_b;