# Limpeza total de usuários e cadastros

Objetivo: zerar toda a memória de usuários da plataforma, mantendo o evento SudoExpo 2026, os segmentos e a taxonomia. A conta de equipe (admin) atual é preservada.

## O que será apagado

- Perfis de participantes (10 registros) e tudo ligado a eles: ofertas (23), necessidades (16), segmentos do perfil (10)
- Matches (6), motivos de match, histórico e decisões de match (1), revisões de admin de match
- Conexões e todo o histórico: eventos, notas, histórico de status (hoje zeradas, mas incluídas por segurança)
- Consentimentos (5)
- Registros de IA (32), eventos de analytics (106) e logs de auditoria (21)
- Todas as contas de login de visitantes (usuários anônimos e telefones verificados via WhatsApp), incluindo sessões, tokens de atualização e códigos OTP pendentes — qualquer novo acesso começa do zero

## O que será mantido

- Evento SudoExpo 2026
- Segmentos, taxonomia e relações de taxonomia
- A conta de equipe/admin atual e seu vínculo em `event_staff`

## Detalhes técnicos

1. Uma migração fará a limpeza em ordem de dependência: tabelas filhas primeiro (`match_reasons`, `match_status_history`, `match_decisions`, `match_admin_reviews`, `connection_*`, `connections`, `matches`, `profile_offers`, `profile_needs`, `profile_segments`, `consents`, `ai_runs`, `analytics_events`, `audit_logs`) e depois `profiles`.
2. Em seguida, remoção das contas em `auth.users` que não pertencem à equipe: exclui todo `auth.users` cujo `id` não esteja em `event_staff.user_id` nem em `staff_roles.user_id`. Isso remove em cascata identidades, sessões, refresh tokens e one-time tokens de OTP.
3. Verificação pós-execução: contagem zerada nas tabelas acima, `event_staff` com 1 registro, evento e taxonomia intactos, e o painel público (`/publico`) exibindo zeros a partir da RPC real.

Após a limpeza, um novo cadastro pelo mesmo WhatsApp será tratado como primeiro acesso.
