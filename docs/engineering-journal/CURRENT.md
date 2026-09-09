# Engineering Journal — CURRENT

## Status Atual
- **Ciclo**: Definição de Arquitetura Multi-Evento e Separação de Dados Históricos
- **Data**: 2026-09-09

### H-001 — O modelo relacional existente já suporta particionamento por event_id nativamente?
- **Status**: VALIDADA
- **Origem**: Investigação do código e migrations
- **Claim**: O banco de dados PostgreSQL já possui a coluna `event_id` em todas as tabelas transacionais (`profiles`, `matches`, `connections`, `profile_offers`, `profile_needs`, `event_staff`).
- **Evidência**: Inspecionado `src/integrations/supabase/types.ts` e migrations `20260724122147`, `20260813190456`.
- **Implicação**: Não é necessário criar bancos de dados físicos separados ou esquemas isolados no Postgres; a separação lógica por eventos já existe na modelagem relacional, precisando apenas de governança administrativa, fluxo de check-in e migração dos dados históricos do piloto.

### H-002 — Como separar os dados do Café Entre Amigos da SudoExpo 2026 sem perda de dados?
- **Status**: VALIDADA E IMPLEMENTADA
- **Origem**: Requisito do Usuário
- **Claim**: Inserir o evento `cafe-entre-amigos-ago-2026` e atualizar os registros atuais de participantes para este `event_id` separa imediatamente a base histórica, mantendo `sudoexpo-2026` como um evento limpo pronto para os participantes da feira.
- **Evidência**: Migration SQL `20260909155500_multi_eventos_separacao_e_checkin.sql` criada com atualização transacional completa de `profiles`, `profile_offers`, `profile_needs`, `matches`, `connections` e `event_staff`.

### H-003 — Participantes de edições anteriores conseguem entrar na SudoExpo 2026 em 1 clique?
- **Status**: VALIDADA E IMPLEMENTADA
- **Origem**: Requisito do Usuário
- **Claim**: O participante digita seu WhatsApp; a RPC `lookup_profile_by_phone` detecta o cadastro em `cafe-entre-amigos-ago-2026` (ou evento passado); a UI apresenta a saudação com botão de confirmação; ao clicar, `participant_checkin_by_phone` duplica o perfil profissional para a SudoExpo 2026 mantendo contatos privados e ativando o matcher.
- **Evidência**: Implementado em `PhoneLoginCard.tsx` e `phoneLogin.ts`, coberto por testes em `src/__tests__/multi-eventos-checkin.test.ts`.

### H-004 — O admin consegue alternar eventos e gerenciar participantes entre edições?
- **Status**: VALIDADA E IMPLEMENTADA
- **Origem**: Requisito do Usuário
- **Claim**: O componente `EventSelector` e o contexto `AdminEventContext` permitem que o staff filtre participantes, matches e taxonomia por evento, além de realizar check-in forçado de participantes de eventos anteriores.
- **Evidência**: Integrado em `/admin`, `/admin/participantes`, `/admin/matches`, `/admin/taxonomia`, e `ParticipantDetailSheet`.
