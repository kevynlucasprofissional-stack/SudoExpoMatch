CREATE TABLE public._export_staging (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  table_name text NOT NULL,
  payload jsonb NOT NULL
);
GRANT ALL ON public._export_staging TO service_role;
ALTER TABLE public._export_staging ENABLE ROW LEVEL SECURITY;