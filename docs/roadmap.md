# ROADMAP — SudoExpo Match

> **Método:** Quality-First. Uma etapa só é concluída quando código, evidência, não-regressão e documentação estão sincronizados.
>
> **Atualizado em:** 09/09/2026, após auditoria da codebase do matcher v2.4, taxonomia, onboarding com IA e implementação multi-eventos.

---

## 1. Estado atual

### Multi-eventos e check-in

A fundação multi-eventos foi implementada no `main` pelo commit `870a59d`:

- [x] preservar o histórico do Café Entre Amigos em evento próprio;
- [x] manter `sudoexpo-2026` como evento ativo separado;
- [x] isolamento de perfis/matches por `event_id`;
- [x] lookup e check-in por telefone;
- [x] check-in manual por staff/admin;
- [x] `AdminEventContext` + seletor de evento nas áreas administrativas principais;
- [x] fluxo do participante veterano sem recadastro completo;
- [x] testes de regressão adicionados para o fluxo multi-eventos;
- [ ] criar uma tela dedicada `/admin/eventos` para governança completa de eventos futuros;
- [ ] revisar todos os pontos restantes que ainda usam `EVENT_ID` fixo em telas administrativas.

**Correção encontrada nesta auditoria:** `/admin/taxonomia` já usava o evento selecionado para a lista, mas abria `TaxonomyItemSheet` com `EVENT_ID` fixo. Isso podia fazer detalhe/mutações/auditoria usarem o evento errado. Corrigido nesta branch para `selectedEventId`.

---

# 2. Matcher v2.4 — fonte canônica

- [x] Criar `docs/specs/matcher-v2.4.md` como especificação documental canônica derivada do SQL real.
- [ ] Atualizar todo texto antigo que ainda chama o matcher atual de **v2.3**.
- [ ] Fazer README, `/como-funciona`, ajuda do admin e materiais operacionais apontarem para a mesma especificação.
- [ ] Remover contradições antigas sobre quando uma relação taxonômica cria match.

## Regras atuais que devem permanecer documentadas

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

- score máximo teórico atual: **180**;
- score **não é porcentagem**;
- rótulos: `75+ alta_compatibilidade`, `40–74 boa_oportunidade`, `<40 conexao_possivel`;
- scores são independentes em `A → B` e `B → A`.

---

# 3. P0 — Governança de taxonomia e snapshots do matcher

## Problema encontrado

`matches` são snapshots persistidos. Antes desta auditoria, criar/editar/desativar:

- item de taxonomia;
- sinônimo;
- relação complementar;

**não recalculava os matches já existentes**. O novo significado só aparecia quando o perfil era salvo/recomputado novamente. Isso poderia manter scores e reasons silenciosamente obsoletos durante o evento.

## Implementação

- [x] Criar revisão global da configuração taxonômica (`matcher_config_state`).
- [x] Registrar por evento qual revisão foi aplicada no último rebuild (`matcher_event_state`).
- [x] Incrementar revisão automaticamente em `INSERT/UPDATE/DELETE` de `taxonomy_items` e `taxonomy_relations`.
- [x] Criar RPC admin-only `admin_get_matcher_taxonomy_status(event_id)`.
- [x] Criar RPC admin-only `admin_recompute_event_matches(event_id)`.
- [x] Serializar rebuilds concorrentes do mesmo evento com advisory lock.
- [x] Auditar cada rebuild em `audit_logs`.
- [x] Adicionar card em `/admin/taxonomia` mostrando revisão aplicada, estado `dirty`, cobertura taxonômica e botão de rebuild.
- [ ] Adicionar prova SQL dedicada: mudar relação → evento fica dirty → rebuild → evento fica clean → score muda como esperado.
- [ ] Avaliar execução assíncrona/job se o rebuild síncrono ultrapassar tempo aceitável em eventos grandes.

### Regra operacional

Alterou taxonomia → evento fica **dirty** → admin aplica rebuild → snapshots voltam a refletir a configuração atual.

Conexões já formalizadas continuam preservadas como histórico pelo comportamento existente do matcher.

---

# 4. P0 — Semântica correta das relações taxonômicas

## Verdade do banco

Uma relação significa:

```text
from_taxonomy_item_id = NECESSIDADE
              ↓
to_taxonomy_item_id   = OFERTA
```

Portanto:

> Quem **PRECISA de A** pode combinar com quem **OFERECE B**.

A relação é **direcional**. `A → B` não implica `B → A`.

## Melhorias

- [x] Trocar a linguagem genérica do formulário (“este item complementa o outro”) por linguagem explícita de **necessidade → oferta**.
- [x] Mostrar preview textual de como o matcher interpretará a relação antes de salvar.
- [x] Explicar no formulário que o sentido inverso precisa ser cadastrado separadamente.
- [ ] Atualizar também a visualização/listagem de relações já cadastradas para badges “PRECISA DE → OFERECE”.
- [ ] Adicionar teste de UI garantindo que a direção apresentada é inequívoca.
- [ ] Adicionar examples/help contextual com 3–5 relações corretas e 2 exemplos de relações invertidas/incorretas.

## Peso

- [x] Documentar: peso `<40` não pontua.
- [x] Documentar: `40–100 → round(weight × 0,30)` = `12–30` pontos.
- [x] Documentar: somente a melhor relação aplicável por perspectiva é usada; relações não são somadas.

---

# 5. P1 — Ativar de verdade a taxonomia

## Estado auditado no snapshot de 04/09/2026

- 44 itens ativos;
- 44/44 com `kind = both`;
- sinônimos vazios;
- zero relações complementares.

A infraestrutura existe, mas naquele snapshot o grafo complementar e a camada de sinônimos estavam ociosos.

## 5.1 Cobertura canônica

- [x] Expor no admin percentual de ofertas com `taxonomy_item_id`.
- [x] Expor no admin percentual de necessidades com `taxonomy_item_id`.
- [x] Expor quantidade de itens com sinônimos e relações efetivas.
- [ ] Definir meta mínima de cobertura antes de considerar o grafo confiável (ex.: >=90% dos itens confirmados canonicalizados).
- [ ] Listar os textos livres mais frequentes para decidir quais devem virar item/sinônimo.
- [ ] Criar alerta quando cobertura cair abaixo da meta.

## 5.2 Sinônimos

- [ ] Popular sinônimos de alta confiança para os conceitos mais usados.
- [ ] Priorizar vocabulário real dos participantes: “social media”, “gestão de Instagram”, “redes sociais” etc.
- [ ] Evitar sinônimos excessivamente amplos que produzam falso positivo.
- [ ] Criar relatório de conflitos: um sinônimo não deve mapear ambiguamente para conceitos incompatíveis.
- [ ] Testar fronteiras de palavra para impedir regressões tipo `bala` × `embalagens` e `porta` × `transportadora`.

## 5.3 Relações complementares

- [ ] Começar com **20–40 relações de alta confiança**, não centenas de relações especulativas.
- [ ] Toda relação deve ter peso e rationale humana útil.
- [ ] Revisar relação por especialistas/curadoria comercial antes de ativar.
- [ ] Medir quantos matches reais cada relação cria e quantos viram interesse/conexão.
- [ ] Desativar relações com baixa precisão e reconstruir o evento.
- [ ] Criar versionamento/export da curadoria para auditoria e rollback lógico.

## 5.4 Ontologia

O catálogo atual mistura serviços, produtos, modelos de negócio, capacidades e canais.

- [ ] Revisar os 44 conceitos e separar níveis semânticos incoerentes.
- [ ] Usar `kind = offer | need | both` de forma real; parar de deixar tudo `both` por padrão.
- [ ] Preencher descrições úteis para orientar admin e IA.
- [ ] Definir convenção de granularidade: evitar misturar “Restaurante” com “Gestão de redes sociais” sem intenção ontológica clara.
- [ ] Definir política para item desativado:
  - opção A: apenas deixa de ser selecionável, referências antigas ainda contam em futuros matches;
  - opção B: deixa também de participar do matcher futuro após rebuild.
- [ ] Implementar a política escolhida e cobri-la com teste.

---

# 6. P1 — Matching semântico e canonicalização

## O que existe hoje

`taxonomy_match()` é determinístico. Ele usa:

- mesmo `taxonomy_item_id`;
- igualdade de label normalizada;
- sinônimos explícitos;
- contenção com fronteira de palavra.

Ele **não** usa embedding, LLM pairwise, cosine similarity ou fuzzy score genérico.

A inteligência semântica principal ocorre no onboarding:

```text
texto humano → IA/wizard → taxonomyItemId canônico → matcher SQL
```

## Melhorias

- [ ] Manter essa arquitetura; não transformar o matcher principal em LLM pairwise sem evidência de necessidade.
- [ ] Medir taxa de retorno `taxonomyItemId = null` da IA.
- [ ] Criar fila de “conceitos não cobertos” para evolução do catálogo.
- [ ] Registrar por que uma sugestão ficou em texto livre quando a confiança de canonicalização foi baixa.
- [ ] Avaliar fuzzy/trigram somente como ferramenta de sugestão para admin/IA, não como match automático sem threshold validado.

---

# 7. P1 — Prompt de onboarding com IA

Foi encontrada tensão entre:

- “Nunca invente informação que o participante não declarou”; e
- “descubra necessidades plausíveis que o empresário talvez ainda não tenha formulado”.

## Melhorias

- [ ] Reescrever a regra para distinguir **inferência plausível** de **fato declarado**.
- [ ] Permitir inferir necessidades comerciais a partir da atividade declarada, mas nunca apresentá-las como fatos sobre a empresa.
- [ ] Exigir rationale indicando se a sugestão é explícita ou inferida.
- [ ] Ajustar `confidence`: 1 = declarado/fortemente evidenciado; valores menores = inferência comercial plausível.
- [ ] Testar casos de empresa com resumo curto, ambíguo e contraditório.
- [ ] Preservar a regra: a IA sugere, o participante confirma antes de persistir.

---

# 8. P1 — Explicabilidade e rastreabilidade

## Estado atual

Relações taxonômicas têm rastreabilidade forte (`profile_need_id`, `profile_offer_id`, `taxonomy_relation_id`, peso, rationale). Os sinais diretos `+55/+25` ainda usam reasons mais genéricos.

## Melhorias

- [ ] Para `+55`, persistir exatamente qual necessidade encontrou qual oferta.
- [ ] Para `+25`, persistir exatamente qual oferta encontrou qual necessidade do outro.
- [ ] Mostrar no card humano: “Você procura X; esta empresa oferece Y”.
- [ ] Se houver múltiplos overlaps, listar os principais mesmo que o score continue saturado.
- [ ] Manter score principal booleano/saturado para evitar `55 × n`.
- [ ] Avaliar no futuro um bônus pequeno e saturado para riqueza do encaixe apenas com dados reais.

---

# 9. P1 — Separar natureza do match de intensidade do score

O sistema sobrepõe dois mecanismos:

```text
MATCHMAKER COMERCIAL
oferta ↔ necessidade + grafo complementar

MATCHMAKER DE NETWORKING
“quem eu procuro” ↔ perfil da empresa
```

Hoje os dois alimentam o mesmo score e os mesmos rótulos.

## Melhorias / decisão de produto

- [ ] Definir se UI deve distinguir “oportunidade comercial” de “perfil estratégico compatível”.
- [ ] Não alterar pesos antes de decidir a semântica de apresentação.
- [ ] Evitar chamar um match puramente demográfico de “boa oportunidade comercial” sem evidência oferta × demanda.
- [ ] Exibir a **natureza** do sinal separada da **força** do score.
- [ ] Testar compreensão com equipe ACIRV e participantes.

---

# 10. P2 — Assimetria da taxonomia

Hoje uma relação `necessidade A → oferta B` dá bônus ao lado que precisa. O fornecedor recebe a dupla por simetria de descoberta, mas não recebe automaticamente um bônus equivalente ao `+25` do match direto inverso.

- [ ] Decidir se o lado fornecedor deve receber:
  - nenhum ponto extra, mantendo v2.4;
  - uma fração do peso taxonômico;
  - apenas um reason de “oportunidade de venda” sem alterar score.
- [ ] Fazer experimento em dados reais antes de alterar pesos.
- [ ] Se mudar, versionar matcher como **v2.5** e manter testes de v2.4 como regressão histórica.

---

# 11. P2 — Nomes e dívida técnica

- [ ] Renomear o reason genérico `+5` de “segmentos complementares” para **“conexão entre segmentos”**: a regra atual só verifica `segment_id` diferente + overlap direto.
- [ ] Corrigir textos que dizem “mesma cidade/região”: hoje o código pontua apenas **mesma cidade**.
- [ ] Depreciar `matches.label` (legado calculado pelo maior score da dupla).
- [ ] Garantir por lint/teste que UI de participante use somente label por perspectiva.
- [ ] Regenerar tipos Supabase depois das novas RPCs de governança; não editar arquivo gerado manualmente.

---

# 12. P2 — Performance e escala

Recompute de um perfil percorre candidatos do evento; rebuild completo tende a custo quadrático no número de participantes.

- [ ] Criar benchmark sintético com 100 perfis.
- [ ] Repetir com 250, 500 e 1.000.
- [ ] Medir tempo total, queries e locks.
- [ ] Definir SLO operacional para rebuild durante evento.
- [ ] Só otimizar candidate generation/índices após medir gargalo real.
- [ ] Se necessário, migrar rebuild completo para job assíncrono com progresso e idempotência.

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
- [ ] relação em uma direção sem relação inversa;
- [ ] sinônimo explícito;
- [ ] igualdade canônica por `taxonomy_item_id`;
- [ ] texto livre;
- [ ] falso positivo de substring;
- [ ] evento diferente nunca cruza;
- [ ] alteração de taxonomia marca evento dirty;
- [ ] rebuild aplica a nova revisão;
- [ ] conexão histórica é preservada.

Esses testes passam a ser o contrato executável do matcher.

---

# 14. Ordem recomendada de execução

```text
P0. governança/rebuild de snapshots          ← implementado nesta branch
P0. direção NEED → OFFER na UI               ← implementado nesta branch
P1. prova SQL + testes do rebuild
P1. medir cobertura canônica
P1. curar sinônimos
P1. revisar ontologia/kind
P1. cadastrar relações de alta confiança
P1. melhorar reasons +55/+25
P1. alinhar prompt da IA
P1. separar natureza comercial/networking na UI
P2. decidir assimetria do fornecedor
P2. limpar legado/nomenclatura
P2. benchmark e otimização baseada em dados
```

---

# 15. Definition of Done

Uma tarefa só recebe `[x]` quando:

1. a implementação está em branch/PR revisável;
2. migration é idempotente e com grants/RLS corretos quando aplicável;
3. testes relevantes passam;
4. existe prova comportamental para regra crítica;
5. nenhuma regressão aparece em login, onboarding, participante, staff/admin ou matching;
6. documentação canônica reflete exatamente o comportamento executável;
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
