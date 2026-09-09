# ROADMAP — Implementação da Separação de Bancos de Dados, Multi-Eventos e Check-in

> **Guia de Execução**: Este roadmap segue a metodologia **Quality-First** estabelecida no Playbook de Desenvolvimento do projeto. Ele detalha todas as etapas necessárias para implementar a separação de eventos, preservação histórica do evento piloto (*Café Entre Amigos*), isolamento estrito de matchmaking para a *SudoExpo 2026*, fluxo de *Check-in* para veteranos e governança no painel administrativo.

---

## Sumário Executivo

- **Objetivo Central**: Transformar o SudoExpo Match em uma plataforma sustentável e multi-evento que suporte a realização da SudoExpo 2026 com base limpa e isolada, sem perder os cadastros do Café Entre Amigos, permitindo que participantes anteriores façam check-in na SudoExpo para gerar conexões sem redigitar seus dados, e impedindo categoricamente que usuários de eventos diferentes se cruzem sem autorização.
- **Backup de Segurança**: Já executado e disponível no GitHub na branch `backup-pre-multi-eventos-20260909` e tag `backup-pre-multi-eventos` no commit `46a35e6`.
- **Estratégia Arquitetural**: Multi-Tenant Lógico Nativo por `event_id` no PostgreSQL, com isolamento forçado por RLS, RPCs e algoritmo de matchmaking delimitado por evento.

---

## Fases do Roadmap

```
+-----------------------------------------------------------------------------------+
| FASE 1: Backup, Auditoria e Fundação de Dados                                    |
| - Backup no GitHub (Concluído)                                                    |
| - Criação do Evento "Café Entre Amigos" e Migração dos Dados Piloto              |
| - Limpeza do escopo "SudoExpo 2026"                                              |
+-----------------------------------------------------------------------------------+
                                         │
                                         ▼
+-----------------------------------------------------------------------------------+
| FASE 2: Motor de Backend para Multi-Eventos e Check-in                            |
| - RPC de Lookup Multi-Evento por WhatsApp                                         |
| - RPC de Check-in Transacional (Clonagem de Perfil + Ofertas/Demandas)            |
| - Isolamento estrito de Matchmaking e Consents                                    |
+-----------------------------------------------------------------------------------+
                                         │
                                         ▼
+-----------------------------------------------------------------------------------+
| FASE 3: Experiência do Participante (UX de Boas-Vindas e Check-in)               |
| - Detecção automática de cadastro anterior no login/onboarding                   |
| - Modal de Confirmação de Presença ("Check-in na SudoExpo 2026")                 |
| - Revisão rápida de interesses e redirecionamento para matches                   |
+-----------------------------------------------------------------------------------+
                                         │
                                         ▼
+-----------------------------------------------------------------------------------+
| FASE 4: Governança no Painel Administrativo (/admin)                              |
| - Seletor de Evento no topo do Admin (Troca de Contexto)                          |
| - Gestor de Eventos (Listagem, Ativação e Criação de Novos Eventos)              |
| - Filtro de Participantes por Evento de Origem e Status de Check-in              |
| - Ação de Check-in Manual por Staff/Admin                                        |
+-----------------------------------------------------------------------------------+
                                         │
                                         ▼
+-----------------------------------------------------------------------------------+
| FASE 5: Testes, Validação Integrada, Auditoria e Finalização                     |
| - Testes automatizados de isolamento de matches                                  |
| - Provas comportamentais e verificação E2E                                       |
| - Atualização da documentação canônica e Relatório Final                         |
+-----------------------------------------------------------------------------------+
```

---

## Detalhamento das Etapas

### Fase 1 — Backup, Auditoria e Fundação de Dados

- [x] **Etapa 1.1: Backup Completo no GitHub**
  - **O que foi feito**: Criada a branch `backup-pre-multi-eventos-20260909` e a tag `backup-pre-multi-eventos` no commit `46a35e6`, enviadas com sucesso para o repositório remoto oficial no GitHub.
  - **Evidência**: Verificado no remote `origin/backup-pre-multi-eventos-20260909`.

- [ ] **Etapa 1.2: Criação do Registro Oficial do "Café Entre Amigos"**
  - **Descrição**: Criar migration SQL adicionando o evento `'cafe-entre-amigos-ago-2026'` na tabela `public.events` com nome `"Café Entre Amigos — ACIRV (Agosto 2026)"`, cidade `"Rio Verde"`, status `is_active = false`.
  - **Critério de Sucesso**: Evento cadastrado sem conflitos de chave primária.

- [ ] **Etapa 1.3: Migração dos Dados Históricos do Piloto**
  - **Descrição**: Reatribuir com segurança todas as linhas existentes em `public.profiles`, `private.profile_contacts`, `public.profile_offers`, `public.profile_needs`, `public.consents`, `public.matches`, `public.connections`, `public.connection_notes` e `public.connection_events` que atualmente possuem `event_id = 'sudoexpo-2026'` para `event_id = 'cafe-entre-amigos-ago-2026'`.
  - **Critério de Sucesso**: Nenhum dado do piloto é apagado; todos passam a pertencer formalmente ao evento "Café Entre Amigos".

- [ ] **Etapa 1.4: Preparação da SudoExpo 2026 como Base Ativa Limpa**
  - **Descrição**: Garantir que o evento `'sudoexpo-2026'` exista em `public.events` com `is_active = true`, pronto para receber exclusivamente as novas inscrições e os check-ins realizados durante o evento.

---

### Fase 2 — Motor de Backend para Multi-Eventos e Check-in

- [ ] **Etapa 2.1: RPC de Lookup Inteligente Multi-Evento (`lookup_participant_multi_event`)**
  - **Descrição**: Criar função SQL `SECURITY DEFINER` que recebe o telefone normalizado E.164 e verifica:
    1. Se o participante já está no evento atual (`is_registered_in_current_event = true`).
    2. Se ele NÃO está no evento atual, mas possui perfil em algum evento anterior (`has_previous_profile = true`), retornando nome, empresa e id do perfil de origem.
  - **Critério de Sucesso**: O front-end consegue saber em milissegundos se a pessoa é novata ou veterana de outro evento, preservando a privacidade (apenas nome abreviado e empresa retornados antes do login).

- [ ] **Etapa 2.2: RPC Transacional de Check-in (`participant_checkin_to_event`)**
  - **Descrição**: Criar função SQL `SECURITY DEFINER` que:
    1. Localiza o perfil de origem no evento anterior.
    2. Cria um novo registro em `public.profiles` para o evento de destino (`sudoexpo-2026`) clonando dados corporativos, segmentos e resumo.
    3. Copia as ofertas e necessidades associadas.
    4. Vincula o contato em `private.profile_contacts` para o novo evento.
    5. Registra o consentimento de matchmaking para o novo evento.
    6. Dispara imediatamente `public._recompute_matches_for_profile` no novo evento.
  - **Critério de Sucesso**: Operação totalmente atômica (tudo ou nada) e idempotente (evita duplicação se o usuário tentar fazer check-in mais de uma vez).

- [ ] **Etapa 2.3: Garantia de Isolamento no Algoritmo de Matchmaking**
  - **Descrição**: Auditar a função `public._recompute_matches_for_profile` para assegurar que a query de busca de outros participantes (`WHERE p.event_id = p_event_id`) permaneça imune a qualquer vazamento cross-event.
  - **Critério de Sucesso**: Um participante do Café NUNCA gera score ou match com um participante da SudoExpo a menos que tenha feito check-in.

---

### Fase 3 — Experiência do Participante (UX de Boas-Vindas e Check-in)

- [ ] **Etapa 3.1: Integração no Card de Acesso WhatsApp (`WhatsappAccessCard.tsx` / `PhoneLoginCard.tsx`)**
  - **Descrição**: Ao digitar o WhatsApp no início do fluxo:
    - Se for novato: segue normalmente para o wizard completo de 5 etapas.
    - Se for participante já ativo na SudoExpo: entra direto na área de `/participante`.
    - Se for veterano do Café Entre Amigos: abre modal especial de boas-vindas: *"Olá, [Nome] da [Empresa]! Identificamos seu cadastro do Café Entre Amigos. Deseja fazer Check-in na SudoExpo 2026?"*.

- [ ] **Etapa 3.2: Fluxo de Confirmação Rápida de Interesses**
  - **Descrição**: Permitir ao veterano confirmar o check-in com 1 clique, ou optar por "Revisar ofertas e necessidades para a SudoExpo" antes de finalizar.
  - **Critério de Sucesso**: O participante ingressa na SudoExpo em menos de 10 segundos, sem a fricção de preencher novamente todo o formulário.

- [ ] **Etapa 3.3: Feedback Visual e Notificações**
  - **Descrição**: Feedback com toast de sucesso: *"Check-in realizado com sucesso! Seus matches na SudoExpo 2026 foram ativados."*, redirecionando para a lista de matches do evento corrente.

---

### Fase 4 — Governança no Painel Administrativo (/admin)

- [ ] **Etapa 4.1: Provedor de Contexto de Evento no Admin (`AdminEventContext`)**
  - **Descrição**: Criar estado global/contexto que armazena qual evento o administrador está gerenciando no momento, com fallback para o evento ativo principal (`sudoexpo-2026`).

- [ ] **Etapa 4.2: Seletor de Evento no Topo do Painel**
  - **Descrição**: Inserir um seletor dropdown no cabeçalho do Admin (`src/routes/admin.tsx`) permitindo trocar a qualquer momento entre "SudoExpo 2026", "Café Entre Amigos" ou futuros eventos.
  - **Critério de Sucesso**: Ao alternar o evento, as abas de Equipe, Participantes, Matches e Estatísticas recarregam os dados referentes àquele evento específico.

- [ ] **Etapa 4.3: Tela / Gestor de Eventos (`/admin/eventos`)**
  - **Descrição**: Visualizar todos os eventos cadastrados, data de início/fim, número de participantes, e botão para ativar/desativar eventos ou cadastrar novos eventos para o futuro da ACIRV.
  - **Critério de Sucesso**: Sobrevivência garantida ao longo dos anos para infinitos eventos futuros.

- [ ] **Etapa 4.4: Filtros Avançados na Lista de Participantes (`/admin/participantes`)**
  - **Descrição**:
    - Adicionar filtro dropdown "Evento de Origem": "Todos", "SudoExpo 2026", "Café Entre Amigos".
    - Adicionar coluna ou badge indicativo de presença: `"Presente na SudoExpo (Check-in Ativo)"` ou `"Apenas no Café Entre Amigos"`.
    - Adicionar botão de ação na linha do participante: `"Fazer Check-in na SudoExpo"`, permitindo que a equipe de credenciamento ative participantes presencialmente com 1 clique.

- [ ] **Etapa 4.5: Atualização de `/admin/matches` e Métricas Operacionais**
  - **Descrição**: Garantir que a lista de matches e as métricas operacionais reflitam com exatidão o evento atualmente selecionado no Admin.

---

### Fase 5 — Testes, Validação Integrada, Auditoria e Finalização

- [ ] **Etapa 5.1: Testes Unitários e de Contrato**
  - **Descrição**: Criar testes automatizados para normalização de telefone, detecção multi-evento, idempotência do check-in e regras de negócio.

- [ ] **Etapa 5.2: Teste Prático de Isolamento (Prova de Fogo)**
  - **Descrição**:
    1. Criar um perfil de teste exclusivo no Café Entre Amigos.
    2. Criar um perfil de teste na SudoExpo 2026.
    3. Rodar recomputação de matches em ambos os eventos.
    4. Provar por query que a contagem de cruzamentos entre eles é rigorosamente ZERO.
    5. Executar o check-in do perfil do Café para a SudoExpo.
    6. Provar que o match agora é calculado com sucesso dentro da SudoExpo.

- [ ] **Etapa 5.3: Auditoria de Segurança, RLS e Não-Regressão**
  - **Descrição**: Conferir integridade de RLS, grants, proteção de telefones e ausência de deadlocks ou dados órfãos.

- [ ] **Etapa 5.4: Memory Closure e Relatório Final**
  - **Descrição**: Sincronizar `CURRENT_STATE.md`, `DECISIONS.md`, `engineering-journal/CURRENT.md` e emitir relatório de conclusão.

---

## Critérios de Pronto (Definition of Done)

Uma etapa deste roadmap só é considerada pronta quando:
1. O código estiver implementado de forma limpa, tipada e com menor modificação suficiente.
2. A evidência correspondente for coletada (testes verdes, logs de execução ou validação comportamental).
3. Não houver regressão em funcionalidades existentes (login por WhatsApp, geração de briefings de IA, painel do staff).
4. A documentação em `docs/` for sincronizada com o estado real do código.
