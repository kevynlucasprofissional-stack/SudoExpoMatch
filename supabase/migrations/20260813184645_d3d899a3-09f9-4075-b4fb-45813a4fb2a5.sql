-- =====================================================================
-- Implementação 2/12 — Relações complementares reais de taxonomia
-- Tabela aditiva: public.taxonomy_relations
--
-- relation_type: TEXT + CHECK (e não ENUM).
--   Tradeoff documentado: um ENUM exige ALTER TYPE ... ADD VALUE (não
--   reversível, não permitido em alguns contextos transacionais) e não
--   suporta remoção de valores. Um CHECK nomeado é substituível de forma
--   puramente aditiva (DROP CONSTRAINT + ADD CONSTRAINT) dentro de uma
--   única migration transacional, o que atende ao requisito de
--   extensibilidade sem reconstrução.
--
-- weight: INTEGER, faixa fechada [1, 100], default 50.
--   Unidade: "pontos de força relativa" da relação, escala linear,
--   1 = vínculo marginal, 100 = complementaridade máxima. Consumido
--   apenas pelo Matcher v2.3 (Implementação 3); NÃO usado ainda.
--
-- Direcionalidade: (from -> to) é independente de (to -> from).
--   Não há trigger de espelhamento; a simetria, se desejada, será
--   criada explicitamente por ação administrativa futura.
-- =====================================================================

CREATE TABLE public.taxonomy_relations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  from_taxonomy_item_id UUID NOT NULL
    REFERENCES public.taxonomy_items(id) ON DELETE CASCADE,
  to_taxonomy_item_id UUID NOT NULL
    REFERENCES public.taxonomy_items(id) ON DELETE CASCADE,
  relation_type TEXT NOT NULL DEFAULT 'complements',
  weight INTEGER NOT NULL DEFAULT 50,
  rationale TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT taxonomy_relations_no_self
    CHECK (from_taxonomy_item_id <> to_taxonomy_item_id),
  CONSTRAINT taxonomy_relations_weight_range
    CHECK (weight >= 1 AND weight <= 100),
  CONSTRAINT taxonomy_relations_type_allowed
    CHECK (relation_type IN ('complements')),
  CONSTRAINT taxonomy_relations_rationale_len
    CHECK (rationale IS NULL OR char_length(rationale) <= 500)
);

COMMENT ON TABLE public.taxonomy_relations IS
  'Relações direcionais entre itens de taxonomia. (from -> to) é independente de (to -> from).';
COMMENT ON COLUMN public.taxonomy_relations.relation_type IS
  'Tipo da relação. Extensível via substituição do CHECK taxonomy_relations_type_allowed. Valores atuais: complements.';
COMMENT ON COLUMN public.taxonomy_relations.weight IS
  'Força relativa da relação em pontos, escala linear fechada [1,100], default 50. Consumo previsto: Matcher v2.3.';
COMMENT ON COLUMN public.taxonomy_relations.active IS
  'Soft-disable. Consumidores devem filtrar active = true.';

-- Unicidade por direção + tipo (impede duplicata da mesma direção/tipo,
-- mas permite explicitamente a direção inversa).
CREATE UNIQUE INDEX taxonomy_relations_unique_direction_type
  ON public.taxonomy_relations (from_taxonomy_item_id, to_taxonomy_item_id, relation_type);

-- Índices de leitura para o matcher (lookup por origem, e reverso).
CREATE INDEX taxonomy_relations_from_active_idx
  ON public.taxonomy_relations (from_taxonomy_item_id, relation_type)
  WHERE active;
CREATE INDEX taxonomy_relations_to_active_idx
  ON public.taxonomy_relations (to_taxonomy_item_id, relation_type)
  WHERE active;

-- Privilégios: participante não recebe nada além de SELECT filtrado por RLS
-- (a policy de leitura exige staff, então na prática participante não lê).
-- Nenhum INSERT/UPDATE/DELETE para authenticated: mutação só por
-- service_role ou por RPC SECURITY DEFINER futura.
GRANT SELECT ON public.taxonomy_relations TO authenticated;
GRANT ALL ON public.taxonomy_relations TO service_role;

ALTER TABLE public.taxonomy_relations ENABLE ROW LEVEL SECURITY;

-- Somente staff/admin autenticado (não anônimo) pode ler.
CREATE POLICY "taxonomy_relations_read_staff"
  ON public.taxonomy_relations
  FOR SELECT
  TO authenticated
  USING (
    COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
    AND public.is_staff(auth.uid())
  );

-- Sem policies de INSERT/UPDATE/DELETE: negado por padrão para
-- anon e authenticated. service_role ignora RLS.

CREATE TRIGGER taxonomy_relations_set_updated_at
  BEFORE UPDATE ON public.taxonomy_relations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();