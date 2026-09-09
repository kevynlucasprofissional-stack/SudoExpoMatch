-- ==============================================================================
-- Migration: Ordenação de Matches por Alta Sinergia Mútua e Insights de Conexão
-- Data: 2026-09-09
-- Descrição:
--   1. Atualiza a RPC public.list_own_matches_v2 para priorizar no topo da lista
--      os matches mais interessantes:
--      - Tier 1: score_me >= 60 AND score_other >= 60 AND abs(score_me - score_other) < 30
--        (ordenados pela menor assimetria primeiro e maior score combinado).
--      - Tier 2: score_me >= 60 AND score_other >= 60 (com assimetria >= 30).
--      - Tier 3: demais matches ordenados por score_me DESC.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.list_own_matches_v2(_event_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_me uuid;
  v_out jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE='42501'; END IF;

  SELECT id INTO v_me FROM public.profiles
   WHERE event_id=_event_id AND owner_id=v_uid AND is_demo=false LIMIT 1;
  IF v_me IS NULL THEN RETURN '[]'::jsonb; END IF;

  WITH base AS (
    SELECT
      m.id AS match_id,
      v_me AS my_profile_id,
      (CASE WHEN m.a_profile_id = v_me THEN m.b_profile_id ELSE m.a_profile_id END) AS other_profile_id,
      m.kind, m.label,
      (CASE WHEN m.a_profile_id = v_me THEN m.score_for_a ELSE m.score_for_b END)::int AS score_me,
      (CASE WHEN m.a_profile_id = v_me THEN m.score_for_b ELSE m.score_for_a END)::int AS score_other,
      m.created_at, m.updated_at, m.generated_at,
      op.id AS op_id, op.name AS op_name, op.company AS op_company,
      op.city AS op_city, op.neighborhood AS op_neighborhood,
      op.segment_id AS op_segment, op.summary AS op_summary
    FROM public.matches m
    JOIN public.profiles op ON op.id = (CASE WHEN m.a_profile_id=v_me THEN m.b_profile_id ELSE m.a_profile_id END)
    WHERE m.event_id = _event_id
      AND m.is_active = true
      AND (m.a_profile_id = v_me OR m.b_profile_id = v_me)
  ), enriched AS (
    SELECT
      b.match_id, b.my_profile_id, b.other_profile_id, b.kind, b.label,
      public.match_label_for_score(b.score_me) AS label_me,
      public.match_label_for_score(b.score_other) AS label_other,
      b.score_me, b.score_other, b.created_at, b.updated_at, b.generated_at,
      jsonb_build_object(
        'name', b.op_name, 'company', b.op_company, 'city', b.op_city,
        'neighborhood', b.op_neighborhood, 'segment_id', b.op_segment, 'summary', b.op_summary
      ) AS other,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object('label', po.label, 'detail', po.detail) ORDER BY po.sort_order)
          FROM public.profile_offers po WHERE po.profile_id = b.op_id AND po.active
      ), '[]'::jsonb) AS other_offers,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'label', pn.label, 'detail', pn.detail,
          'need_kind', pn.need_kind, 'is_priority', pn.is_priority
        ) ORDER BY pn.sort_order)
          FROM public.profile_needs pn WHERE pn.profile_id = b.op_id AND pn.active
      ), '[]'::jsonb) AS other_needs,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object('code',mr.code,'label',mr.label,'weight',mr.weight) ORDER BY mr.weight DESC)
          FROM public.match_reasons mr
         WHERE mr.match_id = b.match_id AND mr.perspective_profile_id = v_me
      ), '[]'::jsonb) AS reasons,
      COALESCE(
        (SELECT decision FROM public.match_decisions WHERE match_id=b.match_id AND profile_id=v_me),
        'sem_decisao'::public.decision
      ) AS my_decision,
      COALESCE(
        (SELECT decision FROM public.match_decisions WHERE match_id=b.match_id AND profile_id=b.other_profile_id),
        'sem_decisao'::public.decision
      ) AS other_decision,
      (SELECT jsonb_build_object(
                'id', c.id,
                'status', c.status,
                'notes', c.notes,
                'contact_released_at', c.contact_released_at)
         FROM public.connections c WHERE c.match_id = b.match_id) AS connection
    FROM base b
  )
  SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY
    -- 1) Tier de Prioridade Mútua
    CASE
      WHEN e.score_me >= 60 AND e.score_other >= 60 AND abs(e.score_me - e.score_other) < 30 THEN 1
      WHEN e.score_me >= 60 AND e.score_other >= 60 THEN 2
      ELSE 3
    END ASC,
    -- 2) Menor assimetria (mais equilibrados) primeiro entre os que têm ambos >= 60
    CASE
      WHEN e.score_me >= 60 AND e.score_other >= 60 THEN abs(e.score_me - e.score_other)
      ELSE NULL
    END ASC NULLS LAST,
    -- 3) Maior score combinado
    (e.score_me + e.score_other) DESC,
    -- 4) Maior score próprio
    e.score_me DESC,
    -- 5) Recência como critério final
    e.generated_at DESC
  ), '[]'::jsonb)
    INTO v_out
    FROM enriched e;

  RETURN v_out;
END $function$;

GRANT EXECUTE ON FUNCTION public.list_own_matches_v2(text) TO authenticated;
COMMENT ON FUNCTION public.list_own_matches_v2(text) IS
  'Retorna matches do participante logado com ordenação prioritária para duplas de alta sinergia mútua (ambos >= 60 e assimetria < 30 no topo).';
