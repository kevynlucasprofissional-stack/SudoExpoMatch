# CURRENT_STATE — SudoExpo Match

## 1. Metadados do Sistema
- **Data / Horário**: 2026-09-09
- **Head Git SHA**: `46a35e6` (Corrigiu login via WhatsApp)
- **Branch Atual**: `main`
- **Backup Criado no GitHub**:
  - Branch: `backup-pre-multi-eventos-20260909` (remotes/origin/backup-pre-multi-eventos-20260909)
  - Tag: `backup-pre-multi-eventos` (remotes/origin/backup-pre-multi-eventos)
  - Remote: `https://github.com/kevynlucasprofissional-stack/SudoExpoMatch.git`
- **Sincronização Lovable**: Ativa. Restrição de não reescrever histórico git.

## 2. Diagnóstico da Arquitetura Atual
- **Banco de Dados**:
  - PostgreSQL no Supabase com RLS ativo em todas as tabelas.
  - Tabelas centrais: `events`, `profiles`, `matches`, `connections`, `profile_needs`, `profile_offers`, `consents`, `event_staff`, `taxonomy_items`, `taxonomy_relations`.
  - Todas as tabelas de dados possuem a coluna `event_id text references public.events(id)`.
  - O algoritmo de matching `_recompute_matches_for_profile(p_profile_id, p_event_id)` já filtra candidatos por `WHERE p.event_id = p_event_id`.
- **Limitação / Gargalo Atual (Single-Event Hardcoded)**:
  - O arquivo `src/config/event.ts` possui `EVENT_ID = "sudoexpo-2026"` e `EVENT_NAME = "SudoExpo 2026"` hardcoded.
  - Durante o teste piloto real no "Café Entre Amigos" em Agosto de 2026, todos os participantes foram cadastrados com `event_id = 'sudoexpo-2026'`.
  - Não existe no painel administrativo UI para selecionar eventos, criar novos eventos, ou chavear o contexto do evento ativo.
  - Não existe no fluxo de login ou onboarding uma rotina de "Check-in" ou importação de participante de evento anterior para o evento atual.
- **Risco Imediato para a SudoExpo**:
  - Se novos participantes se cadastrarem agora para a SudoExpo 2026 sem separar a base, eles serão imediatamente pareados com as pessoas que participaram apenas do "Café Entre Amigos" e que não estarão presentes na SudoExpo.

## 4. Estado da Implementação Multi-Eventos (Concluída)
- **Migração SQL**: `supabase/migrations/20260909155500_multi_eventos_separacao_e_checkin.sql`
  - Criado evento histórico `cafe-entre-amigos-ago-2026` ("Café Entre Amigos - Ago/2026").
  - Criado e ativado evento atual `sudoexpo-2026` ("SudoExpo 2026").
  - Realocados todos os participantes reais do piloto (August 2026) para `cafe-entre-amigos-ago-2026` junto com ofertas, necessidades, matches e conexões legadas.
  - SudoExpo 2026 inicia zerada e limpa para novos cadastros e check-ins legítimos.
  - Criadas RPCs:
    - `participant_checkin_by_phone(target_event_id, phone_e164)`: 1-click check-in de participante de evento anterior preservando histórico e clonando perfil profissional.
    - `staff_checkin_participant(target_event_id, source_profile_id)`: Check-in manual realizado pelo staff/admin.
    - `admin_list_events()`: Listagem administrativa com contagem de participantes e matches por evento.
    - Atualizada `lookup_profile_by_phone`: detecta se usuário possui cadastro ativo no evento atual ou cadastro prévio em evento anterior (`has_previous_event`, `previous_event_id`, `previous_event_name`).

- **Frontend & UX**:
  - `src/features/access/PhoneLoginCard.tsx`: Fluxo em 3 fases (`phone` -> `confirm` / `checkin`). Se o participante já esteve no Café Entre Amigos (ou outro evento passado), a UI exibe o cartão de boas-vindas com botão de 1 clique "Confirmar Check-in na SudoExpo 2026", garantindo ativação imediata sem redigitar nada.
  - `src/features/admin/AdminEventContext.tsx`: Contexto React para gerenciamento e persistência do evento selecionado no painel administrativo.
  - `src/features/admin/EventSelector.tsx`: Dropdown selector integrado ao cabeçalho do painel de administração (`/admin`, `/admin/participantes`, `/admin/matches`, `/admin/taxonomia`).
  - `src/features/admin/ParticipantDetailSheet.tsx`: Alerta visual e botão de ação rápida para realizar check-in de participantes antigos diretamente pela gaveta lateral de detalhes.
  - `src/routes/admin_.participantes.tsx`: Botão de check-in na lista de participantes ao inspecionar edições anteriores.

- **Testes & Validação**:
  - `npm run typecheck`: 100% limpo, zero erros de TypeScript.
  - Vitest: Suíte `src/__tests__/multi-eventos-checkin.test.ts` passando com 6/6 testes.
  - Testes de regressão (`impl-1-label-perspectiva`, `impl-10-admin-matches`, `impl-9-admin-participantes`): 65/65 testes passando.
