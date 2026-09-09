# DECISIONS (ADRs) — SudoExpo Match

## ADR-001: Separação de Dados por Eventos (Tenant por Evento no Modelo Unificado)

### Status: DECIDIDO
### Contexto
O software foi inicialmente concebido com a flag de configuração de evento único (`src/config/event.ts`), mas a modelagem relacional de banco já incluía `event_id` nas tabelas principais (`profiles`, `matches`, `connections`, etc.).
Durante o piloto em Agosto de 2026 no "Café Entre Amigos", os participantes foram cadastrados na tabela `profiles` com `event_id = 'sudoexpo-2026'`. Agora, a SudoExpo 2026 real irá acontecer e futuros eventos virão (ex: novas edições do Café Entre Amigos, SudoExpo 2027).

### Decisão
1. **Preservar a modelagem relacional de particionamento lógico por `event_id`**:
   - Cada evento é um registro em `public.events`.
   - Criar o evento `cafe-entre-amigos-ago-2026` ("Café Entre Amigos — Agosto 2026").
   - Migrar todos os perfis, contatos, necessidades, ofertas, matches e conexões do piloto de Agosto para o evento `cafe-entre-amigos-ago-2026`.
   - Limpar o escopo de `sudoexpo-2026` para receber apenas os participantes reais da feira SudoExpo 2026.
2. **Modelo de Check-in Multi-Evento (Importação / Reativação de Perfil)**:
   - Uma pessoa que já esteve no "Café Entre Amigos" não precisa preencher todo o formulário de 5 etapas do zero ao chegar na SudoExpo 2026.
   - Ao informar seu WhatsApp no login/onboarding:
     - O sistema detecta se ela já possui cadastro em evento anterior.
     - Oferece a ação simplificada: *"Bem-vindo de volta! Encontramos seu cadastro do Café Entre Amigos. Deseja fazer check-in na SudoExpo 2026 com os mesmos dados?"*
     - Com 1 clique (e opção de atualizar segmentos/demandas), o sistema instancia a participação dela no evento corrente (`sudoexpo-2026`).
     - A partir desse momento, ela é considerada participante ativa da SudoExpo 2026 e o algoritmo gera matches para ela exclusivamente com outros participantes ativos da SudoExpo 2026!
3. **Controle e Visibilidade no Painel do Admin**:
   - Criar na interface do Admin `/admin`:
     - Seletor de Evento (Dropdown no topo do Admin para alternar o contexto de visualização).
     - Gestor de Eventos (`/admin/eventos` ou aba dedicada): listar eventos, definir qual é o evento corrente/ativo padrão, criar novos eventos futuros.
     - Na lista de participantes (`/admin/participantes`): filtro por Evento de Origem e status de Check-in no evento atual, com ação de staff para "Realizar Check-in manual" para participantes presentes.
4. **Isolamento Total do Algoritmo de Matchmaking**:
   - O algoritmo `_recompute_matches_for_profile(p_profile_id, p_event_id)` opera estritamente dentro da fronteira do evento (`p.event_id = p_event_id`).
   - Dessa forma, quem se cadastrar na SudoExpo tem risco ZERO de dar match com alguém que ficou apenas no Café Entre Amigos.

### Consequências
- **Positivas**: Zero retrabalho para veteranos de eventos, isolamento garantido para novatos, conformidade estrita com o banco relacional existente, sobrevida indefinida para dezenas de eventos no futuro.
- **Negativas / Cuidados**: Exige migração cuidadosa dos dados históricos existentes sem perda de chaves estrangeiras.
