DROP FUNCTION IF EXISTS public.rotate_own_recovery_code();
DROP FUNCTION IF EXISTS public.recover_profile_v2(text, text, text);
DROP FUNCTION IF EXISTS public.hash_recovery_code(text);

ALTER TABLE public.profiles DROP COLUMN IF EXISTS pin_code;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'private' AND table_name = 'profile_contacts'
      AND column_name = 'recovery_code_hash'
  ) THEN
    EXECUTE 'ALTER TABLE private.profile_contacts DROP COLUMN recovery_code_hash';
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'private' AND table_name = 'profile_contacts'
      AND column_name = 'recovery_code_rotated_at'
  ) THEN
    EXECUTE 'ALTER TABLE private.profile_contacts DROP COLUMN recovery_code_rotated_at';
  END IF;
END $$;