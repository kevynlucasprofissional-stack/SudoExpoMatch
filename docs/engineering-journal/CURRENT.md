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
- **Status**: VALIDADA
- **Origem**: Requisito do Usuário
- **Claim**: Inserir o evento `cafe-entre-amigos-ago-2026` e atualizar os registros atuais de participantes para este `event_id` separa imediatamente a base histórica, mantendo `sudoexpo-2026` como um evento limpo pronto para os participantes da feira.
- **Evidência**: Migration SQL pode executar um `UPDATE` transacional de integridade referencial com migração de chaves estrangeiras.
