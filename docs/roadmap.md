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
