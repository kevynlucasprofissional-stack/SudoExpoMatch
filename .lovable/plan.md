## Onda D — Central operacional de conexões

Encerra o ciclo: interesse mútuo → fila → operador assume → apresentação → contato liberado → conclusão, com auditoria, indicadores e RLS estritos. Base atual (`/equipe`, `useConnectionsQueue`, `staff_advance_connection`, `event_staff`, `admin_*`) é parcial e será estendida sem duplicação.

### 1. Banco (migração incremental única)

**Novas colunas / tabelas**
- `public.connections`: `assigned_at timestamptz`, `assumed_at timestamptz`, `presented_at timestamptz`, `contact_exchanged_at timestamptz`, `completed_at timestamptz`, `cancelled_at timestamptz`, `assignee_lock_version int not null default 0` (concorrência otimista). Índices: `(event_id,status)`, `(event_id,assigned_to)`, `(event_id,updated_at desc)`.
- `public.connection_events` (auditoria normalizada): `id uuid pk`, `event_id text`, `connection_id uuid fk`, `actor_user_id uuid`, `action text` (`created|assumed|released|reassigned|advanced|cancelled|completed|contact_revealed|note_added`), `previous_status`, `new_status`, `assigned_from uuid`, `assigned_to uuid`, `note text`, `metadata jsonb`, `created_at`. Índice `(connection_id, created_at desc)`. Mantém `connection_status_history` legado, mas novas escritas passam a alimentar `connection_events`.
- `public.connection_notes` (observações internas separadas): `id`, `event_id`, `connection_id`, `author_user_id`, `body text (<=1000)`, `created_at`. RLS: apenas staff/admin do evento.

**GRANTs + RLS** para as novas tabelas (só `authenticated` + `service_role`; leitura restrita a `has_any_event_role`).

**Novas / atualizadas RPCs (SECURITY DEFINER, search_path fixo)**
- `staff_list_connections_v2(_event_id, _status[], _segment_ids[], _search, _scope('all'|'mine'|'unassigned'|'pending'|'closed'), _sort, _limit, _offset)` → jsonb `{ items, total, counts_by_status, counts_by_scope }`. Autoriza via `has_any_event_role`, faz join server-side e devolve apenas campos exibíveis (sem contatos).
- `staff_assume_connection(_connection_id)` — atômica: `UPDATE connections SET assigned_to=uid, assigned_at=now(), status='em_atendimento' WHERE id=$ AND assigned_to IS NULL AND status='aguardando' RETURNING …`; se 0 linhas → `already_assigned`. Grava evento `assumed`.
- `staff_release_connection(_connection_id, _note)` — operador atual devolve à fila (`assigned_to=null`, status volta a `aguardando`). Registra `released`.
- `admin_reassign_connection(_connection_id, _new_user_id, _note)` — admin do evento; valida que `_new_user_id` é staff/admin do evento. Registra `reassigned`.
- `staff_advance_connection` (extensão): exige `assigned_to = auth.uid()` para staff (admin pode qualquer), atualiza timestamps por etapa, grava em `connection_events`. Cancelamento continua a exigir nota (3–500).
- `staff_add_connection_note(_connection_id, _body)` — insere em `connection_notes` e evento `note_added`.
- `staff_list_connection_detail(_connection_id)` — resumo dos dois participantes (sem contatos), motivos, timeline (`connection_events` + `connection_notes`), responsável, tempo na etapa.
- `staff_reveal_contact_for_match` (endurecer): só permite quando `connections.status IN ('apresentados','contato_trocado','concluido')` OU chamador é admin do evento E `_override_reason` (>=3 chars). Sempre grava `contact_revealed` em `connection_events` (com/sem override em `metadata`).
- `event_operational_stats(_event_id)` → jsonb com todos os indicadores exigidos (perfis ativos, matches, mútuos, contagem por status, sem responsável, por operador, tempos médios `assumed-created`, `presented-assumed`, `completed-created`, taxas). Server-side agregado.
- `admin_remove_event_staff` (endurecer): antes de remover, se houver conexões ativas atribuídas, retornar `has_active_connections` a menos que `_reassign_to` seja passado; nesse caso reatribui em bulk. Bloqueia auto-remoção sem `_confirm_self=true`. Mantém proteção do último admin.

**Backfill**: `assumed_at = assigned_at` quando null; `completed_at/cancelled_at` derivados do histórico existente.

### 2. Domínio compartilhado (frontend)

`src/features/connections/domain.ts` — nova fonte única:
- `CONNECTION_STATUS_ORDER`, `nextStatusFor(current)`, `contextualActionLabel(current)`, `canReveal(status, isAdmin)`, `translateConnectionError(code)`, badges/tons. Rota, hooks e testes passam a importar daqui (remove duplicação em `useConnectionsQueue.ts`, `participant/presentation.ts`).

### 3. Hooks / API staff (`src/features/staff/`)

- `queueApi.ts`: chamadas tipadas com Zod para as RPCs acima.
- `useConnectionsQueue.ts` reescrito para paginação server-side + filtros (status[], segments[], search, scope, sort, page). Debounce 300ms na busca. Realtime `connections` + `connection_events` → invalida a página atual; fallback `refetchInterval: 20_000`.
- `useAssumeConnection`, `useReleaseConnection`, `useReassignConnection`, `useAdvanceConnection` (atualizado), `useAddConnectionNote`, `useConnectionDetail(id)`, `useOperationalStats(eventId)`, `useStaffRevealContacts` (mantém `staleTime:0, gcTime:0` — sem persistência).
- Erros traduzidos: `already_assigned`, `not_assignee`, `invalid_transition`, `reveal_not_allowed`, `has_active_connections`, `last_admin`, `forbidden`, etc.

### 4. UI

**`src/routes/equipe.tsx`** — refatorado em componentes sob `src/features/staff/components/`:
- `QueueToolbar` (busca, filtros de status/segmento/escopo, ordenação; estado sincronizado com URL via `useSearch`/`navigate`).
- `QueueStats` (contadores por etapa + sem responsável).
- `ConnectionList` (cards mobile-first com badge de status, responsável, tempo na etapa, CTA contextual: "Assumir atendimento" / "Marcar como apresentados" / "Registrar troca de contato" / "Concluir").
- `ConnectionDetailDrawer` (shadcn `Sheet`): resumo participantes, motivos, responsável, timeline (`connection_events` + notas), formulário de nota, ações contextuais (avançar / devolver / cancelar / revelar contato quando permitido / admin reatribuir).
- `RevealContactSection`: só habilita a partir de `apresentados`; mensagem "Consulta auditada"; usa `useStaffRevealContacts` sem cache.
- `Pagination` server-side.

**`src/routes/admin.tsx`** — adiciona aba **Operação** com `useOperationalStats` (KPIs + conexões por operador + reatribuir). Mantém aba equipe atual endurecida (confirmação de auto-remoção, prompt de `_reassign_to` quando há conexões ativas).

### 5. Testes

Nova suíte `src/__tests__/onda-d.test.ts` cobrindo:
- domínio: `nextStatusFor`, `canReveal`, tradução de erros;
- redutores de filtros de fila (URL ↔ estado);
- orquestração assumir/avançar (mocks de RPC): idempotência, `already_assigned`, `not_assignee`, `invalid_transition`, cancelamento sem nota, reveal antes de `apresentados`, admin override com razão, `last_admin`, `has_active_connections`;
- indicadores: cálculo determinístico a partir de fixture de RPC.
- Regressão: rodar suítes das Ondas A/B/C sem alteração.

Playwright 390×844 em `/equipe` (login staff mockado via seed em migração de teste? — se não factível sem credenciais reais, ficará como limitação documentada; smoke visual sem login continua).

### 6. Validação final
`bunx vitest run` · `tsgo --noEmit` · `bun run build` · lint. Corrigir tudo antes de fechar.

### 7. Documentação
`README.md` — nova seção "Onda D — Operação": fluxo, papéis, política de revelação, tabelas/RPCs novas, como testar, limitações reais (ex.: notificação por e-mail fora de escopo).

### Diagrama de fluxo

```text
mutual interest
      │
      ▼
 aguardando ──assume──▶ em_atendimento ──apresentados──▶ contato_trocado ──concluido
      ▲                    │       │              │
      └──release/reassign──┘       └──cancelado (com nota, qualquer etapa ativa)
                                          ▲
                             contato liberável só a partir de "apresentados"
                             (admin pode override com justificativa auditada)
```

### Limitações conhecidas de saída
- Notificações externas (e-mail/WhatsApp para operador/participante) permanecem fora de escopo.
- Playwright autenticado depende de seed de staff em ambiente local; se não disponível, será documentado.
