-- ============================================================================
-- Prova executável — IMPL 27 / Roadmap 24: RPC public.admin_match_graph
--
-- Objetivo: comprovar, sem alterar dado algum, que a função do Mapa de
-- Conexões (a) existe com o contrato esperado, (b) isola por evento, (c) exige
-- papel no evento, (d) deriva os quatro estados de interesse a partir de
-- public.match_decisions e (e) não devolve nenhum dado pessoal de contato.
--
-- Como rodar: psql "<connection-string>" -f scripts/admin-match-graph-proof.sql
-- Tudo roda dentro de uma transação revertida no final (ROLLBACK).
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. A função existe, é STABLE, SECURITY DEFINER e não é executável por anon
-- ---------------------------------------------------------------------------
SELECT 'prova_1_assinatura' AS prova,
       p.proname,
       pg_get_function_identity_arguments(p.oid) AS args,
       p.prosecdef                               AS security_definer,
       p.provolatile                             AS volatilidade, -- 's' = STABLE
       has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon_pode,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_pode
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname = 'admin_match_graph';
-- Esperado: 1 linha, security_definer = true, volatilidade = 's',
--           anon_pode = false, authenticated_pode = true.

-- ---------------------------------------------------------------------------
-- 2. O corpo garante papel no evento, isolamento por event_id e is_active
-- ---------------------------------------------------------------------------
SELECT 'prova_2_invariantes_do_corpo' AS prova,
       position('has_any_event_role'    in prosrc) > 0 AS exige_papel_no_evento,
       position('m.event_id = _event_id' in prosrc) > 0 AS isola_por_evento,
       position('m.is_active'            in prosrc) > 0 AS somente_matches_ativos,
       position('match_decisions'        in prosrc) > 0 AS estado_vem_de_decisions,
       position('profile_contacts'       in prosrc) = 0 AS sem_tabela_de_contatos,
       position('phone'                  in prosrc) = 0 AS sem_telefone,
       position('email'                  in prosrc) = 0 AS sem_email
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'admin_match_graph';
-- Esperado: todas as colunas true.

-- ---------------------------------------------------------------------------
-- 3. Sem sessão autenticada a função recusa (auth.uid() nulo)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  PERFORM public.admin_match_graph('sudoexpo-2026');
  RAISE EXCEPTION 'FALHOU: a função respondeu sem usuário autenticado';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'prova_3_ok: sem sessão a função recusa (not_authenticated/forbidden)';
END $$;

-- ---------------------------------------------------------------------------
-- 4. Prova autenticada: executa como um admin/staff real do evento
--    (usa o primeiro papel existente em public.event_staff para o evento)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_event  text := 'sudoexpo-2026';
  v_uid    uuid;
  v_json   jsonb;
  v_nodes  int;
  v_edges  int;
BEGIN
  SELECT user_id INTO v_uid
    FROM public.event_staff
   WHERE event_id = v_event
   ORDER BY created_at
   LIMIT 1;

  IF v_uid IS NULL THEN
    RAISE NOTICE 'prova_4_pulada: nenhum papel cadastrado em event_staff para %', v_event;
    RETURN;
  END IF;

  -- Simula a sessão do usuário para auth.uid() dentro da função.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);

  v_json := public.admin_match_graph(v_event);

  v_nodes := jsonb_array_length(v_json -> 'nodes');
  v_edges := jsonb_array_length(v_json -> 'edges');

  RAISE NOTICE 'prova_4_shape: event_id=%, nodes=%, edges=%, meta=%',
    v_json ->> 'event_id', v_nodes, v_edges, v_json -> 'meta';

  -- 4a. event_id devolvido é o pedido
  IF (v_json ->> 'event_id') <> v_event THEN
    RAISE EXCEPTION 'FALHOU: event_id devolvido diferente do pedido';
  END IF;

  -- 4b. chaves de nó e aresta são exatamente as do contrato (nenhuma PII)
  IF EXISTS (
    SELECT 1
      FROM jsonb_array_elements(v_json -> 'nodes') n,
           jsonb_object_keys(n) k
     WHERE k NOT IN ('profile_id','name','company','segment_id','segment_label','degree')
  ) THEN
    RAISE EXCEPTION 'FALHOU: nó com chave fora do contrato (possível PII)';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM jsonb_array_elements(v_json -> 'edges') e,
           jsonb_object_keys(e) k
     WHERE k NOT IN ('match_id','a_profile_id','b_profile_id','score_for_a','score_for_b',
                     'kind','decision_a','decision_b','interest_state','connection_status',
                     'reviewed','has_briefing')
  ) THEN
    RAISE EXCEPTION 'FALHOU: aresta com chave fora do contrato (possível PII)';
  END IF;

  -- 4c. interest_state só assume os quatro valores previstos
  IF EXISTS (
    SELECT 1
      FROM jsonb_array_elements(v_json -> 'edges') e
     WHERE e ->> 'interest_state' NOT IN ('mutual','single','none','declined')
  ) THEN
    RAISE EXCEPTION 'FALHOU: interest_state fora do domínio previsto';
  END IF;

  -- 4d. a soma dos estados em meta fecha com o total de arestas
  IF ((v_json -> 'meta' ->> 'mutual')::int
      + (v_json -> 'meta' ->> 'single')::int
      + (v_json -> 'meta' ->> 'none')::int
      + (v_json -> 'meta' ->> 'declined')::int) <> (v_json -> 'meta' ->> 'edges_total')::int THEN
    RAISE EXCEPTION 'FALHOU: contadores de meta não fecham com edges_total';
  END IF;

  -- 4e. isolamento: nenhuma aresta cita match de outro evento
  IF EXISTS (
    SELECT 1
      FROM jsonb_array_elements(v_json -> 'edges') e
      JOIN public.matches m ON m.id = (e ->> 'match_id')::uuid
     WHERE m.event_id <> v_event OR NOT m.is_active
  ) THEN
    RAISE EXCEPTION 'FALHOU: aresta de outro evento ou de match inativo';
  END IF;

  -- 4f. isolamento: nenhum nó de outro evento
  IF EXISTS (
    SELECT 1
      FROM jsonb_array_elements(v_json -> 'nodes') n
      JOIN public.profiles p ON p.id = (n ->> 'profile_id')::uuid
     WHERE p.event_id <> v_event
  ) THEN
    RAISE EXCEPTION 'FALHOU: nó de outro evento';
  END IF;

  -- 4g. estado da aresta confere com match_decisions (fonte autoritativa)
  IF EXISTS (
    SELECT 1
      FROM jsonb_array_elements(v_json -> 'edges') e
      JOIN public.matches m ON m.id = (e ->> 'match_id')::uuid
      LEFT JOIN LATERAL (
        SELECT d.decision::text AS dec FROM public.match_decisions d
         WHERE d.match_id = m.id AND d.profile_id = m.a_profile_id
         ORDER BY d.decided_at DESC LIMIT 1
      ) da ON true
      LEFT JOIN LATERAL (
        SELECT d.decision::text AS dec FROM public.match_decisions d
         WHERE d.match_id = m.id AND d.profile_id = m.b_profile_id
         ORDER BY d.decided_at DESC LIMIT 1
      ) db ON true
     WHERE (e ->> 'interest_state') <> CASE
             WHEN COALESCE(da.dec,'sem_decisao') = 'interesse'
              AND COALESCE(db.dec,'sem_decisao') = 'interesse' THEN 'mutual'
             WHEN COALESCE(da.dec,'sem_decisao') = 'interesse'
               OR COALESCE(db.dec,'sem_decisao') = 'interesse' THEN 'single'
             WHEN COALESCE(da.dec,'sem_decisao') = 'agora_nao'
               OR COALESCE(db.dec,'sem_decisao') = 'agora_nao' THEN 'declined'
             ELSE 'none' END
  ) THEN
    RAISE EXCEPTION 'FALHOU: interest_state divergente de match_decisions';
  END IF;

  -- 4h. filtro de score mínimo no servidor só reduz o conjunto
  IF jsonb_array_length(public.admin_match_graph(v_event, 75) -> 'edges') > v_edges THEN
    RAISE EXCEPTION 'FALHOU: score mínimo aumentou o número de arestas';
  END IF;

  RAISE NOTICE 'prova_4_ok: contrato, isolamento, estados e ausência de PII confirmados';
END $$;

-- ---------------------------------------------------------------------------
-- 5. Papel de outro evento não enxerga este evento (isolamento de autorização)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_event text := 'sudoexpo-2026';
  v_uid   uuid;
BEGIN
  SELECT es.user_id INTO v_uid
    FROM public.event_staff es
   WHERE es.event_id <> v_event
     AND NOT EXISTS (
       SELECT 1 FROM public.event_staff x
        WHERE x.user_id = es.user_id AND x.event_id = v_event
     )
   LIMIT 1;

  IF v_uid IS NULL THEN
    RAISE NOTICE 'prova_5_pulada: não há papel exclusivo de outro evento para testar';
    RETURN;
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.admin_match_graph(v_event);
    RAISE EXCEPTION 'FALHOU: papel de outro evento conseguiu ler o grafo';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'prova_5_ok: papel de outro evento recebeu forbidden';
  END;
END $$;

ROLLBACK;
