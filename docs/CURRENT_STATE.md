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

## 3. Estado de Testes e Ferramental
- O repositório possui suíte de testes Vitest em `src/__tests__`.
- Parte dos testes legados executa SQL direto via `psql` contra instância local de banco de dados. No ambiente de execução atual, a ferramenta `psql` não está no PATH global.
- Scripts de lint, typecheck e testes unitários/lógicos de frontend executam via bun/node.
