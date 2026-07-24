# Auditoria somente leitura — ACIRV Connect / Matchmaker SudoExpo

Nenhum arquivo, migration ou dado foi alterado. Diagnóstico baseado no HEAD, em `supabase/migrations/*.sql` (12 arquivos, ~4.4k linhas) e nas rotas em `src/routes/*` + módulos em `src/features/*`.

## 1) Arquitetura e estrutura do código

- **Stack real:** TanStack Start (SSR) + React + TS + TanStack Router/Query + Tailwind + shadcn + Supabase (Cloud). Rotas em `src/routes/`: `index.tsx`, `como-funciona.tsx`, `participar.tsx`, `participante.tsx`, `equipe.tsx`, `admin.tsx`, `publico.tsx`.
- **Domínios em `src/features/`:** `auth`, `onboarding`, `participant`, `matching`, `taxonomy`, `connections`, `staff`, `admin`, `recovery`. Padrão consistente: `api.ts` (RPC + `ApiError`), `schemas.ts` (Zod), `queries.ts` (TanStack Query), `types.ts`, `presentation.ts`.
- **Backend:** exclusivamente Supabase Postgres + RPCs `SECURITY DEFINER`. Sem edge functions, sem `createServerFn` de negócio. Cliente único `@/integrations/supabase/client`.
- **Persistência local:** apenas `sudoexpo:wizard-draft:v2` (rascunho sanitizado, sem WhatsApp/token). Recovery code só em memória.

## 2) Fluxos realmente operacionais (além do front-end)

Operacionais end-to-end contra o banco:
- Sessão anônima automática (`ensureParticipantSession` em `src/features/participant/session.ts`).
- Cadastro completo do visitante (`save_own_profile_v2` + `set_own_contact`).
- Recomputação de matches server-side (`recompute_own_matches`).
- Listagem de matches (`list_own_matches_v2`), decisão (`record_match_decision_v2`), revelação de contato (`reveal_contact_for_match`).
- Recuperação por telefone+código (`recover_profile_v2`) com transferência de `owner_id`.
- Login de equipe/admin por e-mail+senha (`src/features/auth/actions.ts`).
- Fila operacional server-side com paginação, filtros e realtime (`staff_list_connections_v2` + canal `staff-queue-v2-{eventId}`).
- Máquina de estados de conexão (`staff_assume_connection`, `staff_advance_connection`, `staff_release_connection`, `admin_reassign_connection`) com timestamps e auditoria em `connection_events`/`connection_status_history`.
- Notas internas (`staff_add_connection_note` + `connection_notes`).
- Gestão administrativa de staff (`admin_add_event_staff_by_email`, `admin_change_event_staff_role`, `admin_remove_event_staff`).
- Estatísticas: `event_stats` (público) e `event_operational_stats` (admin).

## 3) Cadastro completo

Funciona. Fluxo em `src/routes/participar.tsx` + `src/features/onboarding/*`:
1. `ensureParticipantSession` → `signInAnonymously`.
2. `save_own_profile_v2(payload jsonb)` → grava `profiles`, `profile_segments`, `profile_offers`, `profile_needs`, `consents`; valida limites, taxonomia e prioridade.
3. `set_own_contact(phone, email, sharing)` → grava `private.profile_contacts` (fone hash SHA-256).
4. `rotate_own_recovery_code()` → grava hash em `private.profile_recovery` e devolve o código em texto uma única vez.
5. `recomputeOwnMatches(eventId)` executado ao final do wizard.

Tabelas envolvidas: `public.profiles`, `public.profile_segments`, `public.profile_offers`, `public.profile_needs`, `public.consents`, `private.profile_contacts`, `private.profile_recovery`.

## 4) Perfil individual (ofertas, necessidades, contatos privados)

Sim. Cada `auth.uid()` possui no máximo 1 perfil não-demo por evento (`profiles.owner_id`). Ofertas/necessidades normalizadas em tabelas próprias com FK a `profiles`, `segments`, opcionalmente `taxonomy_items`, e flags (`is_priority`, `need_kind`, `active`, `source`). Contatos e recuperação vivem no schema `private` (sem acesso via Data API — só via RPCs `SECURITY DEFINER`). RLS em `profile_needs`/`profile_offers`/`profile_segments` restringe SELECT ao dono ou staff do evento; taxonomia é leitura autenticada.

Atividades (auditoria por usuário): registradas em `audit_logs` (transferência de owner, revelação de contato) e `analytics_events`. Não há timeline visível ao próprio participante.

## 5) Matching hoje

- **Onde:** função `public.recompute_own_matches(_event_id)` (PL/pgSQL, `SECURITY DEFINER`). É determinística, roda no banco.
- **Fórmula (pesos oficiais aplicados):** 55 (`outro_oferece_o_que_procuro`) + 25 (`outro_procura_o_que_ofereco`) + 10 (`prioridade` — necessidade prioritária coberta) + 5 (`complementaridade` — segmentos diferentes com overlap) + 3 (`atualidade` — perfil atualizado ≤7 dias) + 2 (`proximidade` — mesma cidade normalizada). Calcula perspectiva de cada lado e cria `matches` bidirecionais com `match_reasons` explicáveis.
- **Comparação de itens:** `public.taxonomy_match` — mesmo `taxonomy_item_id`, labels normalizados iguais, sinônimos, ou substring ≥4 chars.
- **Persistência:** tabela `public.matches` (com `is_active`, `score_a`, `score_b`, `label`, `kind`) + `public.match_reasons` (code, weight, label) + `public.match_decisions` + `public.match_status_history`.
- **Filtro de elegibilidade:** apenas perfis com consentimento `matchmaking` vigente (via `public.consents`), ou perfis demo.
- **Preservação de histórico:** matches com conexão associada não são desativados no recompute.

## 6) IA real ou determinística?

**Não há IA em execução.** Provider único: `heuristicSuggestionProvider` (`src/features/onboarding/suggestions.ts`) — sugestões determinísticas baseadas em segmento/label. Tabela `public.ai_runs` existe (migration `20260724124124_*.sql`) mas nenhum código de aplicação escreve nela (`grep` só encontra tipos gerados). Nenhuma chamada a OpenAI/Anthropic/Gemini/Lovable AI Gateway no repositório.

## 7) Quando o matching é executado

- **No fim do cadastro:** `recomputeOwnMatches(EVENT_ID)` em `src/routes/participar.tsx` (linha ~211) após salvar perfil/contato/código.
- **Manualmente:** botão "Recomputar" no dashboard do participante (`useRecomputeMatchesMutation` em `src/routes/participante.tsx`).
- **Polling:** `useOwnMatchesQuery` refaz `list_own_matches_v2` a cada `PARTICIPANT_MATCHES_POLL_MS` (20s), sem background refetch. Isso **lê** matches — não recomputa.
- **Não há:** trigger de banco, cron, pg_net ou job assíncrono recomputando matches quando outro usuário se cadastra. A trigger `auto_create_connection` existe mas é no-op (comentário no próprio corpo).

Consequência: o match de A com B só aparece para A depois que A rodar recompute (cadastro ou botão). Se A já se cadastrou antes de B, A não descobre B automaticamente.

## 8) Descoberta de novos matches / notificações

- Dashboard `/participante` recarrega a cada 20s via polling da query `list_own_matches_v2`.
- **Não há notificações** (push, email, in-app toast passivo, badge). Nenhum canal Realtime está inscrito no lado do participante — `supabase.channel` só é usado em `useOperationalQueue.ts` (equipe). Sem subscription em `matches`/`connections` para o dono.
- Nenhuma integração de e-mail/SMS/WhatsApp para avisar novo match ou nova conexão.

## 9) Matches armazenados?

Sim, persistidos em `public.matches` (com `score_a`, `score_b`, `is_active`, `label`, `kind`), motivos em `public.match_reasons`, decisões em `public.match_decisions`, transições em `public.match_status_history`. Conexões derivadas em `public.connections` + auditoria em `connection_events`, `connection_status_history` e notas em `connection_notes`.

## 10) O que equipe/admin veem/gerenciam

**Equipe (`/equipe`)** — via `staff_list_connections_v2` (paginação, filtros por status/segmento/escopo, ordenação, busca) e `staff_list_connection_detail`:
- Fila em tempo real (canal `staff-queue-v2-*` com `postgres_changes` + fallback 20s).
- Assumir conexão (`staff_assume_connection` com lock), avançar estados lineares, cancelar com nota obrigatória, liberar, adicionar notas internas.
- Revelar contato com auditoria (`staff_reveal_contact_for_match` com `_override_reason`).

**Admin (`/admin`)**:
- Gestão de equipe do evento (adicionar por e-mail, alterar papel, remover — protegido por `has_event_role('admin')` e regra `last_admin`).
- Reatribuir conexões (`admin_reassign_connection`).
- Indicadores operacionais (`event_operational_stats`): conversão, carga por operador, KPIs.

**Público (`/publico`)** — `event_stats(_event_id)` com contadores agregados; nada de PII.

## 11) Riscos, dependências, lacunas

- **Descoberta reativa:** sem trigger/cron, matches são "puxados" pelo dono. Novo cadastro não avisa perfis anteriores até eles recomputarem. Sério para o valor do produto durante o evento.
- **Sem canal de notificação** (nem realtime no dashboard do participante, nem push/email/WhatsApp).
- **IA ausente** apesar de tabela `ai_runs` provisionada — funcionalidade prometida no briefing original não foi implementada.
- **Duas versões coexistem** de várias RPCs (`recover_profile` vs `recover_profile_v2`, `record_match_decision` vs `_v2`, `staff_advance_connection` sobrecarregada, `staff_reveal_contact_for_match` duplicada, `upsert_own_profile` legada). O frontend usa apenas as v2, mas as v1 continuam no banco expostas via Data API/RPC.
- **Políticas RLS legadas permissivas** ainda existentes em migrations antigas (`profiles publicly readable USING (true)`, `connection insertable by anyone`, `match insertable by anyone`). Migrations posteriores adicionaram políticas restritivas, mas as permissivas antigas não foram dropadas explicitamente em todas — auditar `pg_policies` para confirmar estado final.
- **`recovery_code` como coluna em `public.profiles`** existe historicamente (chamada em `save_own_profile_v2` com valor `''`) — coluna deveria ser removida se não é mais usada.
- **Sem SSR de dados protegidos**: `/equipe` e `/admin` são protegidos client-side; se a sessão sumir há tela em branco antes do redirect.
- **Nenhum teste E2E de banco** garantindo idempotência do recompute quando dois participantes salvam simultaneamente.
- **Botão "Recomputar" manual** é a UX principal de descoberta — friction alto para o visitante.

## 12) Diagnóstico final

**Funcionando (end-to-end contra o banco):**
- Cadastro completo do visitante (perfil + contato + código de recuperação).
- Matching server-side determinístico com pesos oficiais, motivos explicáveis persistidos e filtro por consentimento.
- Registro de interesse, criação de conexão mútua, revelação de contato pós-mútuo.
- Recuperação de perfil por telefone+código com transferência de owner.
- Fluxo operacional completo da equipe: fila paginada, filtros, realtime, máquina de estados linear, notas internas, auditoria, cancelamento com justificativa.
- Administração de staff por evento + reatribuição + indicadores operacionais.
- Painel público agregado.
- Autenticação (anônima para visitante, e-mail/senha para staff/admin).

**Parcial:**
- Descoberta de matches: só via cadastro, botão manual ou polling 20s da listagem — sem recompute automático quando novos perfis surgem.
- RLS: hardening feito nas migrations recentes, mas políticas antigas permissivas coexistem — precisa auditoria de `pg_policies` para confirmar estado efetivo.
- Coexistência de RPCs v1/v2 no banco (o front só chama v2, mas superfície v1 ainda exposta).
- Tabela `ai_runs` existe mas nunca é escrita.
- Auditoria (`audit_logs`, `analytics_events`) grava eventos, mas nenhuma UI expõe timeline ao participante.

**Não implementado:**
- IA real (sugestões, ranking assistido, resumos, embeddings) — o briefing original pedia IA; entrega atual é 100% heurística.
- Notificações ao participante de novo match/interesse/conexão (push, email, WhatsApp, in-app realtime).
- Realtime no dashboard do participante — nenhum `supabase.channel` inscrito fora da equipe.
- Recompute automático server-side em resposta a novos cadastros (trigger, pg_cron, pg_net → serverFn, ou fan-out por Realtime).
- Fluxo de convite de staff por link (hoje precisa o usuário já existir em `auth.users`).
- Testes de concorrência entre visitantes cadastrando simultaneamente.

---

**Como prosseguir:** este é o resultado da auditoria solicitada. Nenhuma alteração foi feita. Se quiser, posso abrir planos específicos para (a) fechar as lacunas de descoberta/notificação, (b) remover as RPCs/políticas v1 legadas, ou (c) introduzir IA real via Lovable AI Gateway.
