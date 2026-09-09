# TASKS: Arquitetura Multi-Eventos, Separação de Dados e Check-in

## Etapa 1: Fundação de Dados e Migração do Café Entre Amigos
- [x] **TASK-001**: Criar migration de evento do Café Entre Amigos e particionamento dos dados existentes.
  - Criar linha `'cafe-entre-amigos-ago-2026'` em `public.events`.
  - Migrar registros existentes vinculados ao piloto (`profiles`, `profile_contacts`, `profile_needs`, `profile_offers`, `consents`, `matches`, `connections`).
  - Garantir integridade de chaves estrangeiras e índices.
- [x] **TASK-002**: Garantir integridade das constraints e RLS multi-evento.
  - Verificar se triggers e funções RPC aceitam qualquer `event_id` válido.

## Etapa 2: Motor de Backend para Check-in Multi-Evento
- [x] **TASK-003**: Criar RPC `lookup_participant_multi_event` (incorporado em `lookup_profile_by_phone`).
  - Permite verificar se um WhatsApp pertence a um participante em qualquer evento e retorna detalhes seguros para pré-visualização.
- [x] **TASK-004**: Criar RPC `participant_checkin_to_event` (`participant_checkin_by_phone` e `staff_checkin_participant`).
  - Clona com segurança os dados do perfil, ofertas e necessidades para o evento de destino.
  - Registra o contato e dispara recálculo imediato de matches.
- [x] **TASK-005**: Adicionar testes automatizados para o fluxo de check-in e isolamento estrito de matches.

## Etapa 3: Interface do Participante (UX de Check-in e Boas-Vindas)
- [x] **TASK-006**: Integrar detecção de evento anterior na tela de início (`/`) e no card de WhatsApp.
  - Quando um veterano digita seu número, abre modal de boas-vindas com botão de Check-in imediato na SudoExpo 2026.
- [x] **TASK-007**: Integrar tela de confirmação/revisão rápida de ofertas e necessidades na SudoExpo.
- [x] **TASK-008**: Garantir feedback claro (toast / redirecionamento para `/participante`).

## Etapa 4: Painel Administrativo Multi-Evento
- [x] **TASK-009**: Criar seletor de evento e contexto no Admin (`/admin`).
  - Cabeçalho do Admin com dropdown de eventos e exibição do evento ativo.
- [x] **TASK-010**: Implementar visualização e filtros avançados em `/admin/participantes`.
  - Filtro por evento ("Todos", "SudoExpo 2026", "Café Entre Amigos").
  - Coluna / Badge de status de Check-in na SudoExpo.
  - Botão de ação rápida para staff realizar Check-in manual.
- [x] **TASK-011**: Atualizar `/admin/matches` e estatísticas para respeitar o evento selecionado no contexto.

## Etapa 5: Validação Integrada, Auditoria e Handoff
- [x] **TASK-012**: Validação fim a fim:
  - Inscrição de novo participante na SudoExpo.
  - Check-in de participante do Café na SudoExpo.
  - Prova de isolamento (quem não fez check-in nunca recebe match).
- [x] **TASK-013**: Atualização de memória (`CURRENT_STATE.md`, `DECISIONS.md`, `Engineering Journal`).
