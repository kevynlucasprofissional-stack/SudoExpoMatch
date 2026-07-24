
# Auditoria ponta a ponta — ACIRV Connect (somente leitura)

Nenhum arquivo, migration ou configuração foi alterado.

## 1. Encadeamento do fluxo

Legenda: ✅ implementado e conectado · ⚠ implementado com risco/limitação · ❌ ausente.

### 1.1 Autenticação do participante ✅
- Arquivos: `src/features/participant/session.ts` (`ensureParticipantSession`, `useEnsureParticipantSession`), consumido por `routes/participar.tsx` e `routes/participante.tsx`.
- Mecanismo: `supabase.auth.signInAnonymously()` deduplicado por `inflight` promise; reutiliza sessão staff/admin sem sobrescrever.
- Conexão com etapa seguinte: toda RPC v2 chama `await ensureParticipantSession()` antes do `rpc(...)`.
- Testes: `onda-a.test.ts` cobre contrato/sanitização de erro. Sem risco técnico conhecido além da dependência de "Allow anonymous sign-ins" no Auth.

### 1.2 Persistência de perfil, segmentos, ofertas, necessidades e consentimento ✅
- Arquivos: `src/features/participant/api.ts::saveOwnProfile`, `src/features/onboarding/{mappers,validate,submitOrchestrator}.ts`, rota `routes/participar.tsx`.
- Backend: RPC `save_own_profile_v2(_payload jsonb)` (migration `20260724132146…`) grava atômico em `public.profiles`, `profile_segments`, `profile_offers`, `profile_needs` + registra `consents` (tabela dedicada, `policy_version`).
- Conexão: payload é validado por Zod (`saveOwnProfilePayloadSchema`) antes do envio; erros retornam `ErrorCode` sanitizado.
- Testes: `onda-b*.test.ts` cobre orquestrador (`preSubmit`, `runWizardSubmit`) e mappers.
- ⚠ Limitação: `submitOrchestrator` para a máquina em `AWAIT_CODE_CONFIRMATION` no modo `create` e só chama `recomputeOwnMatches` no modo `edit`. Na criação, o recompute só ocorre depois que o usuário confirma o código no `RecoveryCodeDialog` (`routes/participar.tsx:211`). Se o usuário fechar a aba entre "salvou" e "confirmou o código", o perfil existe sem matches — apenas o próximo `list_own_matches_v2` ou nova edição dispara o cálculo.

### 1.3 Contatos (WhatsApp) ✅ com nuance
- Arquivo: `setOwnContact` → RPC `set_own_contact` grava em `private.profile_contacts` (schema privado, hash de telefone).
- Obrigatório no modo `create` (validado em `preSubmit`). Falha propaga como `PROFILE_FAIL`/`CONTACT_FAIL` na máquina — sem retry parcial automático (o usuário tem que reenviar).

### 1.4 Cálculo dos matches ⚠
- Backend: `recompute_own_matches(_event_id)` (migrations `132146` + hardening `132947`) — 100% SQL, aplica pesos oficiais 55/25/10/5/3/2 via helper `taxonomy_match`, filtra por `consents`, grava em `public.matches` + motivos em `public.match_reasons`.
- Disparo: **exclusivamente sob demanda** — chamado em `submitOrchestrator` (edit), após confirmação de código (create), e no CTA "Recalcular matches" do painel (`useRecomputeMatchesMutation`).
- ⚠ Risco: **não há trigger nem job periódico**. Quando um novo perfil B entra depois de A, os matches de A só aparecem se A voltar e clicar em recalcular, ou se A editar o perfil. Isso é a lacuna funcional mais importante do produto.
- Testes: `onda-c.test.ts`, `onda-b.test.ts` cobrem contratos e ordenação; não há teste E2E de "novo perfil dispara match de perfis antigos".

### 1.5 Persistência de matches e motivos ✅
- Tabelas `public.matches` (score_for_a, score_for_b, kind, label) e `public.match_reasons` (code/weight/detail por perspectiva). Índices e triggers `updated_at` presentes.

### 1.6 Visualização no painel do participante ✅
- Arquivos: `routes/participante.tsx`, `features/participant/components/MatchesList.tsx`, `matchesDisplayState.ts`.
- RPC: `list_own_matches_v2` + `useOwnMatchesQuery` com **polling de 20s** (`refetchIntervalInBackground: false`).
- Presentation: `presentation.ts` traduz `MatchLabel`/`MatchKind`/`Decision`.
- Testes: `onda-c.test.ts` cobre filtros por decisão e cache.

### 1.7 Decisão de interesse ✅
- `useDecideMatchMutation` → RPC `record_match_decision_v2` grava em `match_decisions`, `match_status_history` e `connection_events`.
- Invalida `qk.ownMatches` e `qk.publicStats` no sucesso.

### 1.8 Interesse mútuo → criação de conexão ✅
- Feito **dentro da própria RPC** `record_match_decision_v2` (bloco checado na migration): quando ambas decisões são `interesse`, faz `INSERT ... ON CONFLICT (match_id) DO NOTHING` em `public.connections` com status `aguardando`. Trigger legado `auto_create_connection` foi neutralizado como `no-op` para não competir — arquitetura correta, sem duplicação.

### 1.9 Fila operacional da equipe ✅
- Arquivos: `routes/equipe.tsx`, `features/staff/useOperationalQueue.ts`, `urlState.ts`, `useConnectionsQueue.ts`.
- Backend: `staff_list_connections_v2` (paginada, com CTE de prioridade e ordenação determinística — migration `20260724180242`) + `staff_list_connection_detail`, `staff_assume_connection`, `staff_release_connection`, `staff_advance_connection`, `staff_add_connection_note`, `admin_reassign_connection`, `event_operational_stats`.
- Realtime: subscribe único por evento em `useOperationalQueue` com fallback de polling 20s.
- Testes: `onda-d*.test.ts` e `onda-d1-block.test.ts` cobrem máquina de estados, filtros/URL e labels.

### 1.10 Atendimento — máquina de estados linear ✅
- Estados: `aguardando → em_atendimento → apresentados → contato_trocado → concluida` (também `cancelada`).
- `staff_advance_connection` valida transições e exige nota em cancelamento; grava eventos em `connection_events` com timestamps para auditoria e cálculo de tempos (`secondsSince`).

### 1.11 Liberação de contatos ✅
- Participante: `reveal_contact_for_match` valida interesse mútuo, decisões atuais e retorna telefone/email do outro lado; grava em `audit_logs`. Hook `useRevealContactMutation` com `gcTime: 0` e `reset()` explícito após uso.
- Staff: `staff_reveal_contact_for_match(_override_reason)` — mesma auditoria, exige role.
- Testes: `onda-c.test.ts` cobre reset e cache vazio.

### 1.12 Conclusão e histórico ✅
- `connection_events` e `connection_notes` mantêm timeline consumida pelo `ConnectionDetailDrawer`.
- `event_operational_stats` alimenta KPIs em `/admin` (`OperationalStatsCard`).

## 2. Bloqueios técnicos e lacunas de fluxo

- **⚠ Descoberta assíncrona de matches (P0 funcional)**: sem trigger/cron/edge que rode `recompute_own_matches` quando um perfil entra ou é atualizado. Impacto direto na proposta ("o outro visitante te encontra quando chega"). Correção sem IA possível: trigger `AFTER INSERT/UPDATE ON profiles` que enfileira recompute assíncrono, ou pg_cron a cada N minutos, ou disparar recompute do lado do B para todos os perfis compatíveis.
- **⚠ Notificações**: nenhum canal push/e-mail/WhatsApp para novos matches ou interesse recíproco. Só polling na aba aberta.
- **⚠ Recompute pós-criação depende de confirmação do dialog**: se usuário fecha antes, perfil fica sem `matches` até próxima ação.
- **⚠ Consent gating no matching**: correto, mas se `consents` falhar por qualquer razão, o perfil some do pool silenciosamente. Sem alerta ao owner.
- **⚠ Nenhum dado real em produção**: fluxo cobre criação/consulta, mas não há seed operacional além de 5 perfis demo (`is_demo=true`) filtrados fora do matching por `recover_profile_v2`.
- **RPCs v1 legadas**: já não são referenciadas pelo frontend (grep negativo), mas continuam expostas no banco — superfície de risco.

## 3. Veredito do fluxo ponta a ponta

**O fluxo técnico ponta a ponta é funcional e consistente** do ponto A (cadastro) ao ponto Z (atendimento e revelação), **com uma única lacuna estrutural bloqueante para o valor do produto**: matches novos não aparecem sozinhos. Todo o resto (autenticação, persistência, scoring, decisão, conexão, atendimento, auditoria, contato) está implementado, testado (~320 testes) e conectado corretamente. Sem essa lacuna, um par (A, B) que se cadastra em janelas diferentes só se encontra por sorte.

## 4. Mapa de necessidades de IA

Classificação: **(A) Necessária**, **(B) Fortemente recomendada**, **(C) Opcional**.  
Não conta como IA o que é regra determinística já implementada (pesos, máquina de estados, taxonomy_match trigram, `secondsSince`).

### (A) Necessárias para cumprir a proposta

1. **Interpretação de texto livre do perfil + extração de ofertas/necessidades**  
   - Entrada: `summary`, `company`, e campos livres.  
   - Saída: sugestões estruturadas `{label, taxonomy_item_id, need_kind, is_priority}`.  
   - Momento: durante o wizard (`StepOffers`/`StepNeeds`), pós-blur do `summary`.  
   - Modelo: LLM pequeno via Lovable AI Gateway (ex.: `google/gemini-2.5-flash`) com JSON mode + few-shot da taxonomia real.  
   - Armazenamento: opcional em `ai_runs` (tabela já existe) para auditoria.  
   - Fallback: `heuristicSuggestionProvider` já presente.  
   - Custo/latência: <1s, ~$0.0002/request. Baixo.  
   - Prioridade: alta — hoje o wizard exige que o usuário monte tudo à mão, o que reduz qualidade dos matches.

2. **Normalização/classificação na taxonomia**  
   - Entrada: label digitado pelo usuário (modo manual) + lista de `taxonomy_items` do segmento.  
   - Saída: melhor `taxonomy_item_id` (ou "novo item sugerido" para o admin).  
   - Momento: no submit de cada oferta/necessidade.  
   - Técnica: embeddings (ex.: `text-embedding-3-small`) + cosine top-k, ou LLM classificador.  
   - Armazenamento: cache por `norm_label(label)` → `taxonomy_item_id` em nova tabela `taxonomy_alias`.  
   - Fallback: `taxonomy_match` trigram atual (já implementado no SQL).  
   - Prioridade: alta — sem isso, matching semântico continua raso.

### (B) Fortemente recomendadas

3. **Matching semântico complementar aos pesos**  
   - Entrada: embeddings das ofertas/necessidades de cada perfil.  
   - Saída: `score_semantic ∈ [0,1]` combinado como sinal adicional ao score determinístico (ex.: bônus até 10pts).  
   - Momento: dentro de `recompute_own_matches` (via edge function que faz callback à RPC, ou via `pgvector`).  
   - Modelo: embeddings pequenos + `pgvector`.  
   - Armazenamento: `profile_offer_embeddings`, `profile_need_embeddings`.  
   - Fallback: só pesos atuais.  
   - Custo: linear em nº de perfis; cacheável (só recalcula quando muda oferta/necessidade).  
   - Prioridade: média/alta.

4. **Explicação humana do match ("por que vocês combinam")**  
   - Entrada: `match_reasons` + resumos dos dois perfis.  
   - Saída: 1–2 frases em português para o card do painel.  
   - Momento: on-demand ao expandir o card (com cache em `matches.ai_explanation`).  
   - Modelo: LLM pequeno.  
   - Fallback: já existe texto determinístico por reason (`detail` do `match_reasons`).  
   - Prioridade: média — melhora conversão de "interesse".

5. **Detecção de perfis incompletos/ambíguos**  
   - Entrada: perfil salvo.  
   - Saída: score de completude + dicas ("descreva 1 exemplo concreto de cliente ideal").  
   - Momento: pós-save, exibido no painel.  
   - Modelo: LLM ou heurística assistida por LLM.  
   - Fallback: contagem de campos vazios/curtos.  
   - Prioridade: média.

### (C) Opcionais

6. **Deduplicação** de perfis (mesma empresa/pessoa cadastrada duas vezes) — embeddings + trigram no `company`. Fallback: hash de telefone já bloqueia.  
7. **Re-ranking** dos matches por perfil comportamental (quais tipos de match o usuário costuma aceitar) — LLM ou LTR simples. Só faz sentido com volume.  
8. **Aprendizado com decisões** — usar `match_decisions` como sinal para ajustar pesos por segmento (regressão simples, não precisa LLM).  
9. **Notificações** — a decisão *de notificar* é regra; o *texto* pode ser LLM (opcional). Prioridade real é criar o canal, não a IA.  
10. **Resumos administrativos** em `/admin` (ex.: "Nas últimas 2h, 12 conexões avançaram; gargalo em 'apresentados'"). LLM sobre `event_operational_stats`.  
11. **Moderação** de `summary`/labels (linguagem ofensiva, dados pessoais indevidos). LLM classificador leve ou serviço dedicado.

## 5. Estimativa qualitativa da demanda de IA

- **MVP suficiente**: itens (A1) + (A2). Um único LLM pequeno via AI Gateway + uma tabela de aliases. Baixo custo, baixa latência, alto ganho de qualidade de matching.
- **Versão avançada**: adicionar (B3) embeddings + pgvector, (B4) explicação, (B5) completude, (C11) moderação e (C10) resumos. Aqui vale ter uma edge/server function dedicada que orquestra AI Gateway, `ai_runs` para auditoria e budget por evento.

## 6. Recomendação de ordem (para próxima rodada, se aprovado)

1. Fechar a lacuna estrutural: disparo automático de `recompute_own_matches` para perfis afetados (trigger + fila).  
2. Implementar A1/A2 com Lovable AI Gateway.  
3. Adicionar canal mínimo de notificação (mesmo que só badge no painel via realtime em `matches`).  
4. Depois: embeddings/pgvector e explicações.
