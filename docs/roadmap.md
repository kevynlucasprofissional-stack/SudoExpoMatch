# ROADMAP — SudoExpo Match

> **Método:** Quality-First. Uma etapa só é concluída quando código, evidência, não-regressão e documentação estão sincronizados.
>
> **Atualizado em:** 09/09/2026, após auditoria da codebase do matcher v2.4, taxonomia, onboarding com IA e implementação multi-eventos.

---

## 1. Estado atual — multi-eventos e check-in

A fundação multi-eventos já está implementada no `main` e foi sincronizada nesta branch sem reescrever histórico do Lovable.

- [x] preservar o histórico do Café Entre Amigos em evento próprio;
- [x] manter `sudoexpo-2026` como evento ativo separado;
- [x] isolamento de perfis/matches por `event_id`;
- [x] lookup e check-in por telefone;
- [x] check-in manual por staff/admin;
- [x] `AdminEventContext` + seletor de evento nas áreas administrativas principais;
- [x] fluxo do participante veterano sem recadastro completo;
- [x] testes de regressão do fluxo multi-eventos no `main`;
- [x] corrigir `/admin/taxonomia`: `TaxonomyItemSheet` agora recebe `selectedEventId`, não `EVENT_ID` fixo;
- [ ] criar `/admin/eventos` para governança completa de eventos futuros;
- [ ] auditar todas as referências restantes a `EVENT_ID` em telas administrativas e distinguir uso legítimo (evento público padrão) de hardcode indevido.

---

# 2. Matcher v2.4 — fonte canônica e documentação

## Implementado nesta branch

- [x] criar `docs/specs/matcher-v2.4.md` como especificação documental canônica derivada do SQL real;
- [x] atualizar `README.md` para matcher v2.4;
- [x] corrigir a seção de matcher do `AGENTS.md`, que estava com thresholds/rótulos incompatíveis com o código;
- [x] documentar a diferença entre complementaridade taxonômica e o bônus genérico `+5`;
- [x] documentar que score não é porcentagem e pode chegar teoricamente a 180;
- [x] documentar que `matches.label` é legado e UI deve usar label por perspectiva.

## Ainda pendente

- [ ] alinhar `/como-funciona` e textos de ajuda do produto com a especificação canônica;
- [ ] localizar/remover outras referências antigas a “matcher v2.3” quando estiverem descrevendo o algoritmo atual;
- [ ] gerar material operacional curto para staff/admin baseado na mesma especificação.

## Regras atuais — contrato v2.4

| Sinal por perspectiva | Pontos | Cria a dupla? |
| --- | ---: | :---: |
| O outro oferece algo que eu procuro | +55 | sim |
| O outro procura algo que eu ofereço | +25 | sim |
| Relação taxonômica complementar | +12 a +30 | sim |
| “Quem eu procuro” — 1 critério completo | +20 | sim |
| “Quem eu procuro” — 2 critérios completos | +30 | sim |
| “Quem eu procuro” — 3 critérios completos | +40 | sim |
| Perfil desejado mútuo | +10 | não |
| Necessidade prioritária atendida diretamente | +10 | não |
| Match direto entre segmentos diferentes | +5 | não |
| Perfil atualizado recentemente | +3 | não |
| Mesma cidade | +2 | não |

Rótulos: `75+ alta_compatibilidade`, `40–74 boa_oportunidade`, `<40 conexao_possivel`.

---

# 3.0 P0 RESOLVIDO — Item duplicado no onboarding (incidente de 09/09/2026)

**Status: resolvido.**

Sintoma: o save final do cadastro retornava `duplicate_need_label` sem duplicata
visível na tela. Causa: o front comparava itens por `toLowerCase()` enquanto o
banco compara por `public.norm_label` (minúsculas, sem acentos, espaços
colapsados), e nenhuma defesa de fronteira checava duplicidade antes da RPC.

- [x] identidade canônica única de item (`src/features/onboarding/itemIdentity.ts`);
- [x] aplicada a todos os caminhos de entrada de ofertas e necessidades (feed de IA/heurística, catálogo, texto livre, "Aceitar todas");
- [x] "Comuns no seu segmento" não exibe item já adicionado;
- [x] `validateWizardForSubmit` bloqueia antes de qualquer RPC, cita os dois labels e a etapa; a rota volta para a etapa certa;
- [x] `mapWizardToSaveProfileInput` como última defesa de fronteira;
- [x] rascunho antigo inválido preservado, sem dedupe silencioso;
- [x] check do banco, pesos, matcher e taxonomia inalterados;
- [x] regressão em `src/__tests__/incidente-2026-09-09-item-duplicado.test.ts`.

Risco residual e melhoria separada (canonicalização de texto livre) em
`docs/incidents/2026-09-09-onboarding-duplicate-item.md`.

## Hardening pós-incidente (09/09/2026) — concluído

- [x] `/participar` passa `targetEventId` (não `EVENT_ID`) para "O que eu ofereço" e "Quem eu procuro" — IA/sugestões deixam de consultar o evento errado no sandbox;
- [x] analytics `onboarding_started` / `onboarding_completed` passam a usar `targetEventId`, com dedupe por evento;
- [x] retry de contato após falha parcial conclui o fluxo também em modo criação (`shouldRecomputeAfterContactRetry`) — fim do travamento em "Buscando conexões…";
- [x] roadmap consolidado (marcador de conflito `<<<<<<< HEAD` removido, sem perda de conteúdo);
- [x] scripts temporários `forensic-h*.ts` removidos da raiz;
- [x] revisão de drift front x RPC registrada no documento do incidente;
- [x] regressões em `src/__tests__/hardening-onboarding-2026-09-09.test.ts`.

---

# 3. P0 — Governança de taxonomia e snapshots do matcher

## Problema descoberto

`matches` são snapshots persistidos. Antes desta auditoria, criar/editar/desativar item, sinônimo ou relação taxonômica **não invalidava nem reconstruía os matches já calculados**. O novo significado só surgia quando algum perfil era salvo/recomputado novamente.

Isso era o maior risco operacional antes de popular o grafo complementar.

## Implementação desta branch

- [x] criar `matcher_config_state` com revisão global da taxonomia;
- [x] criar `matcher_event_state` com revisão aplicada por evento;
- [x] incrementar revisão em `INSERT/UPDATE/DELETE` de `taxonomy_items` e `taxonomy_relations`;
- [x] criar RPC admin-only `admin_get_matcher_taxonomy_status(event_id)`;
- [x] criar RPC admin-only `admin_recompute_event_matches(event_id)`;
- [x] serializar rebuilds concorrentes do mesmo evento com advisory lock;
- [x] auditar rebuild em `audit_logs`;
- [x] restringir acesso direto às tabelas internas de estado;
- [x] adicionar card em `/admin/taxonomia` com revisão, `dirty/clean`, cobertura taxonômica e botão de rebuild;
- [x] invalidar a query de saúde após mutações taxonômicas;
- [x] adicionar `scripts/matcher-taxonomy-governance-proof.sql` cobrindo dirty → rebuild → clean → mudança → dirty → rebuild → clean;
- [x] adicionar contrato Vitest estático `matcher-taxonomy-governance.test.ts` para RLS, RPCs, evento selecionado e semântica da UI;
- [ ] executar a migration/prova contra um PostgreSQL/Supabase real antes do merge final;
- [ ] se rebuild síncrono ficar lento em escala, mover execução completa para job assíncrono com progresso/idempotência.

### Regra operacional

```text
alterou taxonomia
      ↓
revisão global avança
      ↓
evento aparece DIRTY
      ↓
admin executa rebuild
      ↓
snapshots refletem a revisão atual
```

Conexões já formalizadas continuam preservadas como histórico pelo comportamento existente do matcher.

---

# 4. P0 — Semântica correta das relações taxonômicas

## Verdade do banco

```text
from_taxonomy_item_id = NECESSIDADE
              ↓
to_taxonomy_item_id   = OFERTA
```

A frase correta é:

> Quem **PRECISA DE A** pode combinar com quem **OFERECE B**.

`A → B` não implica `B → A`.

## Implementado nesta branch

- [x] trocar “este item complementa o outro” por linguagem explícita necessidade → oferta;
- [x] mostrar preview textual antes de salvar;
- [x] explicar que a direção inversa precisa ser cadastrada separadamente;
- [x] atualizar a visualização das relações para badges `PRECISA DE → OFERECE`;
- [x] mostrar no formulário que peso `<40` não pontua;
- [x] mostrar fórmula `round(weight × 0,30)` e teto de 30 pontos;
- [x] adicionar teste de UI garantindo que a direção apresentada é inequívoca.

## Pendente

- [ ] adicionar ajuda contextual com exemplos corretos/incorretos;
- [ ] impedir/alertar curadoria quando uma relação parecer semanticamente invertida com base em `kind`/uso real.

---

# 5. P1 — Ativar de verdade a taxonomia

## Estado auditado no snapshot de 04/09/2026

- 44 itens ativos;
- 44/44 com `kind = both`;
- sinônimos vazios;
- zero relações complementares.

A infraestrutura existia, mas a camada de sinônimos e o grafo complementar estavam praticamente ociosos.

## 5.1 Cobertura canônica

- [x] expor no admin percentual de ofertas com `taxonomy_item_id`;
- [x] expor no admin percentual de necessidades com `taxonomy_item_id`;
- [x] expor quantidade de itens com sinônimos;
- [x] expor relações ativas e relações efetivas (`weight >= 40`);
- [ ] definir meta mínima de cobertura antes de confiar no grafo (sugestão inicial: >=90% dos itens confirmados canonicalizados);
- [ ] listar textos livres mais frequentes (`taxonomy_item_id = NULL`) para evolução do catálogo;
- [ ] criar alerta quando cobertura cair abaixo da meta.

## 5.2 Sinônimos

- [ ] popular sinônimos de alta confiança para conceitos mais usados;
- [ ] usar vocabulário real dos participantes (“social media”, “gestão de Instagram”, “redes sociais” etc.);
- [ ] evitar sinônimos excessivamente amplos;
- [ ] criar relatório de conflito/ambiguidade de sinônimos;
- [ ] manter testes de fronteira de palavra (`bala` ≠ `embalagens`, `porta` ≠ `transportadora`);
- [ ] medir quanto os sinônimos aumentam recall sem derrubar precisão.

## 5.3 Relações complementares

- [ ] começar com **20–40 relações de alta confiança**, não centenas de relações especulativas;
- [ ] exigir rationale humana útil nas relações efetivas;
- [ ] revisar por curadoria comercial antes de ativar;
- [ ] medir quantos matches cada relação cria e quantos viram interesse/conexão;
- [ ] desativar relações com baixa precisão e aplicar rebuild;
- [ ] criar export/versionamento da curadoria para auditoria/rollback lógico.

## 5.4 Ontologia

O catálogo atual mistura serviços, produtos, modelos de negócio, capacidades e canais.

- [ ] revisar os 44 conceitos e definir níveis semânticos coerentes;
- [ ] usar `kind = offer | need | both` de forma real; parar de deixar tudo `both` por padrão;
- [ ] preencher descrições úteis para orientar admin e IA;
- [ ] definir convenção de granularidade;
- [ ] decidir política de item desativado:
  - A: deixa de ser selecionável, mas referências antigas continuam válidas em futuros cálculos;
  - B: deixa também de participar de futuros matches após rebuild;
- [ ] implementar a política escolhida e cobrir com teste.

---

# 6. P1 — Canonicalização e matching semântico

## Concluído — canonicalização conservadora no onboarding (09/09/2026)

Risco residual do incidente de 09/09/2026 resolvido no front, sem tocar em
matcher, pesos, relações taxonômicas, schema ou dados de produção.

`src/features/onboarding/canonicalizeItems.ts` vincula um item sem
`taxonomyItemId` ao item ativo do catálogo quando — e somente quando — há
correspondência **exata e única** após `normalizeLabel` com o label canônico
(ou com um sinônimo exato), o `kind` é compatível (oferta ↔ `offer`/`both`,
necessidade ↔ `need`/`both`) e o item tem `segment_id` autoritativo, exigido
por `save_own_profile_v2`. Ao vincular, o `segment_id` do item taxonômico é
usado. Ambiguidade, item já canônico ou id já usado por outro item da lista →
permanece texto livre. Sem substring, sem Levenshtein, sem IA: falso negativo é
preferível a vínculo errado.

Aplicado no texto manual, nas sugestões de IA/heurística sem id e antes do
submit (recupera rascunhos antigos). A regra de duplicidade continua intacta e
o erro continua sendo mostrado à pessoa — nada é deduplicado em silêncio.

Cobertura: `src/__tests__/canonicalizacao-taxonomia-onboarding.test.ts`.

## O que existe hoje

`taxonomy_match()` é determinístico e usa:

- mesmo `taxonomy_item_id`;
- igualdade de label normalizada;
- sinônimo explícito;
- contenção com fronteira de palavra.

**Não** usa embeddings, LLM pairwise, cosine similarity ou fuzzy score semântico genérico.

A arquitetura atual é:

```text
texto humano
  ↓
IA / wizard
  ↓
taxonomyItemId canônico quando possível
  ↓
matcher SQL determinístico
```

## Melhorias

- [ ] manter essa arquitetura até evidência de que o core determinístico é insuficiente;
- [ ] medir taxa de `taxonomyItemId = null` da IA;
- [ ] criar fila “conceitos não cobertos” para curadoria;
- [ ] registrar motivo/confiança quando sugestão fica em texto livre;
- [ ] avaliar trigram/fuzzy como ferramenta de **sugestão** para admin/IA, não como match automático sem validação.

---

# 7. P1 — Prompt de onboarding com IA

## Problema descoberto

O prompt contém tensão entre:

- “Nunca invente informação que o participante não declarou”; e
- “descubra necessidades plausíveis que ele talvez ainda não tenha formulado”.

## Melhorias

- [ ] reescrever a regra para separar **fato declarado** de **inferência comercial plausível**;
- [ ] permitir inferência apenas a partir da atividade/perfil/contexto fornecido;
- [ ] exigir rationale indicando quando algo é inferido;
- [ ] ajustar `confidence`: 1 = explícito/fortemente evidenciado; menor = inferência plausível;
- [ ] incrementar `PROMPT_VERSION` ao alterar comportamento para invalidar cache antigo;
- [ ] testar resumo curto, ambíguo, contraditório e empresa sem catálogo adequado;
- [ ] manter confirmação explícita do participante antes de persistir sugestões.

---

# 8. P1 — Explicabilidade e rastreabilidade

## Estado atual

Relações taxonômicas já registram `profile_need_id`, `profile_offer_id`, `taxonomy_relation_id`, peso e rationale. Os sinais principais `+55/+25` ainda usam reasons mais genéricos.

## Melhorias

- [ ] no `+55`, persistir exatamente qual necessidade encontrou qual oferta;
- [ ] no `+25`, persistir exatamente qual oferta encontrou qual necessidade do outro;
- [ ] mostrar ao participante “Você procura X; esta empresa oferece Y”;
- [ ] se houver múltiplos overlaps, listar os principais mesmo mantendo score saturado;
- [ ] preservar o teto principal (+55/+25 uma vez) para evitar explosão do score;
- [ ] só avaliar bônus pequeno por riqueza de overlap após dados reais.

---

# 9. P1 — Separar natureza do match da intensidade do score

O sistema sobrepõe:

```text
MATCHMAKER COMERCIAL
oferta ↔ necessidade + grafo complementar

MATCHMAKER DE NETWORKING
“quem eu procuro” ↔ perfil da empresa
```

Hoje ambos alimentam os mesmos rótulos.

- [ ] decidir se UI deve diferenciar “oportunidade comercial” de “perfil estratégico compatível”;
- [ ] mostrar **natureza do sinal** separada da **força do score**;
- [ ] evitar chamar match puramente de perfil de “boa oportunidade comercial” sem evidência comercial;
- [ ] testar compreensão com equipe ACIRV e participantes;
- [ ] não alterar pesos antes dessa decisão sem versionar algoritmo.

---

# 10. P2 — Assimetria da taxonomia

Hoje uma relação `necessidade A → oferta B` dá bônus ao lado que precisa. O fornecedor recebe a dupla por simetria de descoberta, mas não recebe automaticamente um bônus equivalente ao `+25` do match direto inverso.

- [ ] decidir se o lado fornecedor deve receber:
  - nenhum ponto extra (manter v2.4);
  - uma fração do peso taxonômico;
  - apenas um reason “esta empresa possui uma necessidade relacionada ao que você oferece”;
- [ ] experimentar em dados reais antes de alterar score;
- [ ] se mudar, versionar matcher como **v2.5** e manter v2.4 como contrato histórico.

---

# 11. P2 — Nomenclatura e dívida técnica

- [ ] renomear o reason `+5` “segmentos complementares” para **“conexão entre segmentos”**;
- [x] corrigir README/AGENTS para dizer **mesma cidade**, não “cidade/região”;
- [ ] localizar outros textos que ainda dizem “cidade/região” quando o código só usa cidade;
- [ ] depreciar/remover `matches.label` depois de confirmar que nenhum consumidor legítimo depende dele;
- [ ] criar guarda/teste que impeça UI de participante de usar `matches.label`;
- [ ] regenerar os tipos Supabase depois de aplicar a nova migration; não editar arquivo gerado manualmente.

---

# 12. P2 — Performance e escala

Recompute de um perfil percorre candidatos do evento; rebuild completo tende a custo quadrático no número de participantes.

- [ ] benchmark com 100 perfis;
- [ ] benchmark com 250 perfis;
- [ ] benchmark com 500 perfis;
- [ ] benchmark com 1.000 perfis;
- [ ] medir tempo, queries, locks e impacto do rebuild durante o evento;
- [ ] definir SLO operacional;
- [ ] só otimizar candidate generation/índices após medir gargalo real;
- [ ] se necessário, tornar rebuild assíncrono com progresso e idempotência.

---

# 13. P1 — Matriz de provas comportamentais

Criar 20–30 duplas artificiais com resultado esperado cobrindo:

- [ ] direto puro `+55`;
- [ ] inverso puro `+25`;
- [ ] bidirecional;
- [ ] prioridade direta;
- [ ] segmentos diferentes `+5`;
- [ ] cidade e recência;
- [ ] 1/2/3 critérios de perfil desejado;
- [ ] target parcial = zero;
- [ ] target mútuo;
- [ ] relação peso 39 = zero;
- [ ] relação peso 40 = +12;
- [ ] relação peso 100 = +30;
- [ ] duas relações aplicáveis → só a maior conta;
- [ ] relação em uma direção sem inferir a inversa;
- [ ] sinônimo explícito;
- [ ] igualdade canônica por `taxonomy_item_id`;
- [ ] texto livre;
- [ ] falso positivo de substring;
- [ ] evento diferente nunca cruza;
- [x] alteração de taxonomia marca evento dirty (prova SQL adicionada; execução real pendente);
- [x] rebuild aplica a revisão nova e volta a clean (prova SQL adicionada; execução real pendente);
- [ ] conexão histórica é preservada durante rebuild completo.

---

# 14. Ordem de execução recomendada

```text
P0. governança/rebuild de snapshots                IMPLEMENTADO; validar em banco
P0. direção NEED → OFFER na UI                     IMPLEMENTADO + teste de UI
P0. corrigir contexto multi-evento da taxonomia    IMPLEMENTADO + contrato estático
P1. executar prova SQL + typecheck/testes
P1. medir cobertura canônica real do evento
P1. curar sinônimos
P1. revisar ontologia/kind
P1. cadastrar relações de alta confiança
P1. melhorar reasons +55/+25
P1. alinhar prompt da IA e bump de versão
P1. separar natureza comercial/networking na UI
P2. decidir assimetria do fornecedor
P2. limpar legado/nomenclatura
P2. benchmark e otimização baseada em dados
```

---

# 15. Definition of Done

Uma tarefa só recebe `[x]` quando:

1. implementação está em branch/PR revisável;
2. migration é idempotente e possui grants/RLS corretos quando aplicável;
3. testes/provas relevantes existem;
4. validação executável foi rodada quando o ambiente permite — caso contrário a limitação fica explícita;
5. não há regressão conhecida em login, onboarding, participante, staff/admin ou matching;
6. documentação canônica reflete o comportamento real;
7. mudanças de score/semântica têm versão de algoritmo e decisão de produto explícita.

---

# 16. Entregas por fase — histórico consolidado

### Fase 1 — Fundação multi-eventos

- [x] **Etapa 1.1: Registro do evento principal `sudoexpo-2026`**
  - **Descrição**: Base ativa do matchmaking, isolada por `event_id`.

- [x] **Etapa 1.2: Criação do Registro Oficial do "Café Entre Amigos"**
  - **Descrição**: Criar migration SQL adicionando o evento `'cafe-entre-amigos-ago-2026'` na tabela `public.events` com nome `"Café Entre Amigos — ACIRV (Agosto 2026)"`, cidade `"Rio Verde"`, status `is_active = false`.
  - **Critério de Sucesso**: Evento cadastrado sem conflitos de chave primária.

- [x] **Etapa 1.3: Migração dos Dados Históricos do Piloto**
  - **Descrição**: Reatribuir com segurança todas as linhas existentes em `public.profiles`, `private.profile_contacts`, `public.profile_offers`, `public.profile_needs`, `public.consents`, `public.matches`, `public.connections`, `public.connection_notes` e `public.connection_events` que atualmente possuem `event_id = 'sudoexpo-2026'` para `event_id = 'cafe-entre-amigos-ago-2026'`.
  - **Critério de Sucesso**: Nenhum dado do piloto é apagado; todos passam a pertencer formalmente ao evento "Café Entre Amigos".

- [x] **Etapa 1.4: Preparação da SudoExpo 2026 como Base Ativa Limpa**
  - **Descrição**: Garantir que o evento `'sudoexpo-2026'` exista em `public.events` com `is_active = true`, pronto para receber exclusivamente as novas inscrições e os check-ins realizados durante o evento.

---

### Fase 2 — Motor de Backend para Multi-Eventos e Check-in

- [x] **Etapa 2.1: RPC de Lookup Inteligente Multi-Evento (`lookup_participant_multi_event`)**
  - **Descrição**: Criar função SQL `SECURITY DEFINER` que recebe o telefone normalizado E.164 e verifica histórico de eventos anteriores.
  - **Critério de Sucesso**: Resposta em milissegundos preservando privacidade.

- [x] **Etapa 2.2: RPC Transacional de Check-in (`participant_checkin_to_event`)**
  - **Descrição**: Criar função SQL `SECURITY DEFINER` para clonar perfil, ofertas e demandas para a SudoExpo 2026 e recomputar matches.
  - **Critério de Sucesso**: Operação totalmente atômica e idempotente.

- [x] **Etapa 2.3: Garantia de Isolamento no Algoritmo de Matchmaking**
  - **Descrição**: Auditar a função `public._recompute_matches_for_profile` para assegurar que a query filtre estritamente por `p.event_id = p_event_id`.
  - **Critério de Sucesso**: Isolamento estrito entre participantes de eventos distintos.

---

### Fase 3 — Experiência do Participante (UX de Boas-Vindas e Check-in)

- [x] **Etapa 3.1: Integração no Card de Acesso WhatsApp (`WhatsappAccessCard.tsx` / `PhoneLoginCard.tsx`)**
  - **Descrição**: Detecção automática de cadastro anterior no login/onboarding com modal de boas-vindas do Café Entre Amigos.

- [x] **Etapa 3.2: Fluxo de Confirmação Rápida de Interesses**
  - **Descrição**: Check-in em 1 clique confirmando presença na SudoExpo 2026.

- [x] **Etapa 3.3: Feedback Visual e Notificações**
  - **Descrição**: Feedback com toast de sucesso e redirecionamento para o painel de matches.

---

### Fase 4 — Governança no Painel Administrativo (/admin)

- [x] **Etapa 4.1: Provedor de Contexto de Evento no Admin (`AdminEventContext`)**
  - **Descrição**: Contexto global sincronizando o evento ativo no painel administrativo.

- [x] **Etapa 4.2: Seletor de Evento no Topo do Painel**
  - **Descrição**: Dropdown no cabeçalho do admin para alternar livremente entre SudoExpo 2026, Café Entre Amigos e Sandbox.

- [x] **Etapa 4.3: Tela / Gestor de Eventos (`/admin/eventos`)**
  - **Descrição**: Gerenciamento de eventos cadastrados, status e métricas.

- [x] **Etapa 4.4: Filtros Avançados na Lista de Participantes (`/admin/participantes`)**
  - **Descrição**: Filtro de evento, badges de presença e botão de check-in manual pela equipe de credenciamento.

- [x] **Etapa 4.5: Atualização de `/admin/matches` e Métricas Operacionais**
  - **Descrição**: Métricas e matches delimitados pelo evento selecionado.

---

### Fase 5 — Testes, Validação Integrada, Auditoria e Finalização

- [x] **Etapa 5.1: Testes Unitários e de Contrato**
  - **Descrição**: Criar testes automatizados para normalização de telefone, detecção multi-evento, idempotência do check-in e regras de negócio.
  - **Evidência**: Suíte `src/__tests__/multi-eventos-checkin.test.ts` (6/6 aprovados) e testes de regressão (65/65 aprovados).

- [x] **Etapa 5.2: Teste Prático de Isolamento (Prova de Fogo)**
  - **Descrição**: Prova de isolamento rigoroso de matches entre `cafe-entre-amigos-ago-2026` e `sudoexpo-2026`.

- [x] **Etapa 5.3: Auditoria de Segurança, RLS e Não-Regressão**
  - **Descrição**: Conferir integridade de RLS, grants, proteção de telefones e ausência de deadlocks ou dados órfãos.

- [x] **Etapa 5.4: Memory Closure e Relatório Final**
  - **Descrição**: Sincronizar `CURRENT_STATE.md`, `DECISIONS.md`, `engineering-journal/CURRENT.md` e emitir relatório de conclusão.

---

### Fase 6 — Canal de Suporte do Administrador no Painel do Participante

- [x] **Etapa 6.1: Botão de Suporte Direto ao Administrador**
  - **Descrição**: Disponibilizar no painel do participante (`/participante`) um botão com ícone de atendimento e identificação clara de "Suporte", redirecionando diretamente para o WhatsApp do Administrador do evento.
  - **Contato do Administrador**: `(64) 99247-0988` (Kevyn Lucas).
  - **URL de Destino**: `https://wa.me/5564992470988`.
  - **Localização na Interface**:
    - Cabeçalho de Ações (`ParticipantHeader.tsx`): presente de forma persistente em todas as abas (Matches, Conexões, Interesses, Perfil).
    - Cartão de Perfil (`ProfileCard.tsx`): botão secundário "Suporte do Administrador".
  - **Critério de Sucesso**: Participante clica e abre o WhatsApp diretamente com o administrador para suporte e esclarecimento de dúvidas durante o evento.

---

### Fase 7 — Ambiente de Testes (Sandbox) e Exclusão / Reset de Cadastro no Admin

- [x] **Etapa 7.1: Evento Isolado de Sandbox (`sandbox-sudoexpo`)**
  - **Descrição**: Criar o evento `'sandbox-sudoexpo'` no PostgreSQL (`public.events`) com isolamento estrito de matching e permissão aos membros da equipe staff.
  - **Critério de Sucesso**: Qualquer cadastro efetuado nesse ambiente opera 100% isolado da feira real (`sudoexpo-2026`) e do histórico (`cafe-entre-amigos-ago-2026`).

- [x] **Etapa 7.2: Botão "🧪 Testar Cadastro (Sandbox)" no Painel Admin**
  - **Descrição**: Adicionado botão proeminente no Dashboard (`/admin`) e na Lista de Participantes (`/admin/participantes`) que redireciona diretamente para o fluxo de onboarding com parâmetro `?event=sandbox-sudoexpo`.
  - **Critério de Sucesso**: O administrador pode testar o formulário completo de 5 etapas, ver o cálculo de matches em tempo real no sandbox e navegar no painel do participante com faixa indicativa ("Modo Sandbox").

- [x] **Etapa 7.3: Botão "Zerar Dados do Sandbox"**
  - **Descrição**: Disponibilizar no topo do Admin quando o evento selecionado for `sandbox-sudoexpo` uma ação de 1 clique para limpar todos os cadastros e matches de teste via RPC `public.admin_clear_sandbox()`.

- [x] **Etapa 7.4: Exclusão e Reset Imediato de Participante com 1 Clique**
  - **Descrição**: Criar a RPC `public.admin_delete_participant(p_profile_id)` com autorização de staff e adicionar botões de exclusão na tabela de participantes (`/admin/participantes`) e na gaveta de detalhes (`ParticipantDetailSheet.tsx`).
  - **Recursos Excluídos em Cascata**:
    1. Registro em `public.profiles`.
    2. Ofertas (`profile_offers`) e necessidades (`profile_needs`).
    3. Conexões (`connections`) e matches calculados (`matches`).
    4. Contato privado (`private.profile_contacts`).
    5. Tentativas de verificação e rate-limits (`private.phone_claim_attempts`), liberando o número de telefone imediatamente para novo teste ou uso real.
  - **Critério de Sucesso**: Confirmação modal com aviso claro de irreversibilidade; exclusão atômica sem deixar dados órfãos.

---

### Fase 8 — Priorização por Sinergia Mútua & Resumo de Oportunidade por IA nos Cartões

- [x] **Etapa 8.1: Algoritmo de Ranking de Matches por Sinergia Mútua**
  - **Descrição**: Priorizar no topo da lista os matches em que ambos os lados possuem score $\ge 60$ e assimetria $< 30$ ($|score_{me} - score_{other}| < 30$), ordenados pela menor assimetria primeiro e maior score combinado.
  - **Critério de Sucesso**: Matches mais equilibrados e fortes aparecem logo no topo da visão do participante.
  - **Evidência**: Implementado em `src/features/participant/presentation.ts` (`sortMatchesByMutualInterest`) e na migration `supabase/migrations/20260909205000_ordenacao_matches_e_insights.sql` (`list_own_matches_v2`).

- [x] **Etapa 8.2: Badge de Destaque "✨ Alta Sinergia Mútua"**
  - **Descrição**: Identificar visualmente nos cartões de match da tela `/participante` os pares de alta compatibilidade mútua através do helper `isHighSynergyMatch(match)`.

- [x] **Etapa 8.3: Resumo Comercial Estruturado por IA em Todos os Cartões**
  - **Descrição**: Adicionado bloco de resumo de oportunidade em cada cartão respondendo diretamente:
    1. *Por qual motivo você deveria se conectar com essa pessoa?*
    2. *O que você ganha se conectando com essa pessoa?*
  - **Critério de Sucesso**: Linguagem comercial em segunda pessoa ("você"), clara e contextualizada com os dados reais de ofertas, necessidades, segmentos e sinergias das empresas.
  - **Evidência**: Módulo `src/features/participant/matchAiSummary.ts` e suíte `src/__tests__/match-ordering-and-ai-summary.test.ts`.

---

## Critérios de Pronto (Definition of Done)

Uma etapa deste roadmap só é considerada pronta quando:
1. O código estiver implementado de forma limpa, tipada e com menor modificação suficiente.
2. A evidência correspondente for coletada (testes verdes, logs de execução ou validação comportamental).
3. Não houver regressão em funcionalidades existentes (login por WhatsApp, geração de briefings de IA, painel do staff).
4. A documentação em `docs/` for sincronizada com o estado real do código.

---

## Princípio arquitetural a preservar

```text
IA entende linguagem ambígua
  ↓
canonicalização para IDs + sinônimos
  ↓
grafo comercial curado (NECESSIDADE → OFERTA)
  ↓
matcher SQL determinístico, auditável e explicável
  ↓
reasons humanos + operação presencial da equipe
```

A prioridade é **ativar e governar bem a inteligência já existente**, não aumentar complexidade sem evidência.
