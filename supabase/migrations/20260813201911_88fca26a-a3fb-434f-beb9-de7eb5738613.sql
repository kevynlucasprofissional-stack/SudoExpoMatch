CREATE OR REPLACE FUNCTION public._sanitize_synonyms(_syn text[])
RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = public
AS $$
  SELECT COALESCE(array_agg(s ORDER BY ord), '{}'::text[])
  FROM (
    SELECT s, ord FROM (
      SELECT (array_agg(btrim(x) ORDER BY ord))[1] AS s, MIN(ord) AS ord
      FROM unnest(COALESCE(_syn, '{}'::text[])) WITH ORDINALITY AS t(x, ord)
      WHERE btrim(x) <> '' AND length(btrim(x)) <= 80
      GROUP BY lower(btrim(x))
    ) g
    ORDER BY ord
    LIMIT 20
  ) d;
$$;

REVOKE ALL ON FUNCTION public._sanitize_synonyms(text[]) FROM PUBLIC, anon, authenticated;