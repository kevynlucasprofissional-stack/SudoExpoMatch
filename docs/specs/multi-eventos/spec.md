# SPEC: Arquitetura Multi-Eventos, Isolamento de Dados e Check-in

Status: VALIDATED

## 1. Objetivo
Permitir que a plataforma SudoExpo Match opere com suporte pleno a múltiplos eventos ao longo do tempo, garantindo isolamento estrito de matchmaking entre eventos (evitando que inscritos de eventos passados como o "Café Entre Amigos" apareçam nos matches de eventos presentes como "SudoExpo 2026"), ao mesmo tempo em que oferece uma experiência fluida de "Check-in" para que veteranos participem de novos eventos sem redigitar seu perfil.

## 2. Problema / Motivação
- O sistema foi testado em situação real no evento "Café Entre Amigos" (ACIRV, Agosto/2026), mas todas as pessoas cadastradas foram salvas sob o identificador único `sudoexpo-2026`.
- Na SudoExpo 2026 real, novas pessoas se cadastrarão. Se a base não for separada:
  1. Pessoas da SudoExpo receberão sugestões de match com participantes do Café que nem sequer estão presentes na SudoExpo.
  2. Pessoas cadastradas no Café que realmente forem à SudoExpo teriam que ser cadastradas do zero ou gerariam conflito de telefone único.
- A solução deve sobreviver ao tempo, suportando futuros eventos de forma sustentável e escalável.

## 3. Estado Atual Relevante
- O banco PostgreSQL já possui tabelas particionadas logicamente por `event_id` (`profiles`, `matches`, `connections`, etc.).
- A tabela `events` possui os eventos cadastrados.
- O matching `_recompute_matches_for_profile(p_profile_id, p_event_id)` já tem filtro por `event_id`.
- Falta:
  1. Criação do evento real "Café Entre Amigos — Agosto 2026" e migração dos dados históricos.
  2. RPC e fluxo de "Check-in" / Reativação de perfil pré-existente para novos eventos.
  3. Governança administrativa de múltiplos eventos no painel `/admin` (seletor de evento, estatísticas por evento, gestão de participantes por grupo de evento).

## 4. Escopo
### Incluído
- Migration no banco de dados para criar `cafe-entre-amigos-ago-2026` e realocar os registros do teste piloto.
- Função RPC de Check-in (`participant_checkin_to_event`) que permite a um participante com cadastro em evento anterior entrar no evento corrente reutilizando ou atualizando seus dados.
- Modificação na consulta de login por telefone (`lookupProfileByPhone`) para detectar perfil em qualquer evento e oferecer o fluxo de check-in instantâneo.
- Painel Admin:
  - Seletor de evento no cabeçalho do Admin.
  - Tela / visualização de eventos cadastrados com controle de evento ativo.
  - Filtro por evento na lista de participantes (`/admin/participantes`).
  - Ação de staff/admin para realizar check-in manual de um participante presente.

### Fora de Escopo
- Mudança para instâncias físicas separadas de banco de dados (o particionamento lógico por `event_id` com RLS é o padrão canônico do PostgreSQL/Supabase e evita custos/complexidade de múltiplos clusters).
- Venda de ingressos ou integração com bilheteria externa (Sympla/Eventbrite).

## 5. Atores
- **Participante Novo**: Chega na SudoExpo, cadastra-se pelo wizard `/participar`, cai direto no evento ativo e só dá match com quem está no evento ativo.
- **Participante Veterano (ex: Café Entre Amigos)**: Chega na SudoExpo, digita seu WhatsApp, é reconhecido, faz "Check-in na SudoExpo 2026", e é ativado imediatamente no evento ativo.
- **Admin / Staff**: Gerencia eventos, visualiza métricas de cada evento, filtra participantes por evento e faz check-ins manuais.

## 6. Cenários
- **Cenário 1 (Participante Novo na SudoExpo)**:
  - Dado que o participante acessa `/participar` na SudoExpo 2026;
  - Quando completa o cadastro;
  - Então seu perfil é criado vinculado a `sudoexpo-2026`;
  - E seus matches são calculados apenas contra perfis ativos em `sudoexpo-2026`.
- **Cenário 2 (Participante Veterano faz Check-in)**:
  - Dado que um usuário esteve no Café Entre Amigos e seu telefone está registrado;
  - Quando acessa o sistema da SudoExpo 2026 e informa seu WhatsApp;
  - Então o sistema exibe: *"Olá [Nome], você participou do Café Entre Amigos. Deseja confirmar presença na SudoExpo 2026?"*;
  - Ao confirmar, seu perfil e ofertas/necessidades são instanciados em `sudoexpo-2026`;
  - E ele passa a receber matches da SudoExpo 2026.
- **Cenário 3 (Isolamento Estrito)**:
  - Dado um usuário que participou apenas do Café Entre Amigos e NÃO fez check-in na SudoExpo;
  - Quando qualquer pessoa na SudoExpo busca ou recebe matches;
  - Então o usuário do Café NUNCA aparece como match ou participante da SudoExpo.

## 7. Requisitos Funcionais
- **REQ-001 (Separação Histórica)**: O sistema DEVE atribuir todos os dados cadastrados durante o piloto de Agosto ao evento `cafe-entre-amigos-ago-2026`.
- **REQ-002 (Evento Ativo)**: O sistema DEVE determinar o evento ativo padrão através do banco de dados ou variável de ambiente flexível, permitindo que a SudoExpo 2026 inicie com base limpa.
- **REQ-003 (Lookup Multi-Evento)**: O fluxo de identificação por WhatsApp DEVE conseguir identificar a existência de um participante em qualquer evento anterior.
- **REQ-004 (Check-in do Participante)**: O sistema DEVE permitir a clonagem/ativação do perfil de um evento anterior para o evento atual preservando necessidades, ofertas e segmentos.
- **REQ-005 (Seletor de Evento no Admin)**: O Admin DEVE poder alternar o evento visualizado no painel administrativo para consultar dados de qualquer evento.
- **REQ-006 (Check-in Manual no Admin)**: O Admin DEVE poder registrar a presença / check-in de qualquer participante na lista de participantes.

## 8. Critérios de Aceitação
- **AC-001.1**: Consultas em `public.matches` e `public.profiles` com `event_id = 'sudoexpo-2026'` não retornam os dados do Café até que haja check-in.
- **AC-003.1**: Ao buscar um número do Café na SudoExpo, o sistema retorna `has_previous_event = true` e os dados básicos para confirmação.
- **AC-004.1**: Após o check-in, um novo `profile` e contatos são criados para `sudoexpo-2026` e `_recompute_matches_for_profile` é disparado com sucesso.
- **AC-005.1**: O painel `/admin` exibe o nome do evento ativo e permite trocar o filtro de evento.
