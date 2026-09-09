# Incidente de cadastro de 09/09/2026 — `duplicate_need_label` no save final

## Resumo

Durante o onboarding de uma participante (dados não reproduzidos aqui), o save
final falhou com `duplicate_need_label` ("o que você procura está duplicado"),
sem que houvesse duplicata perceptível na tela. Após ajustar a lista, o cadastro
concluiu normalmente.

## Causa raiz

Duas regras diferentes de "mesmo item":

- **Banco** — `public.norm_label`: `trim` + minúsculas + remoção de acentos +
  colapso de espaços. Usada por `save_own_profile_v2` para recusar itens
  repetidos (`duplicate_offer_label` / `duplicate_need_label`).
- **Front (antes do fix)** — apenas `label.toLowerCase()` nos caminhos de
  adição de itens (`StepOffers` / `StepNeeds`) e `trim().toLowerCase()` em
  `mergeCapped`.

Variações invisíveis — acento (`agrícolas` / `agricolas`), espaço duplo, tab —
passavam pela tela e só eram recusadas no banco. Não havia nenhuma verificação
de duplicidade em `validateWizardForSubmit` nem em
`mapWizardToSaveProfileInput`, então o botão ficava habilitado e o erro só
aparecia depois da chamada ao servidor.

## Evidências

- `public.norm_label` (banco) versus `label.toLowerCase()` em
  `src/features/onboarding/steps.tsx` (caminhos de feed, catálogo e texto livre).
- `src/features/onboarding/mergeItems.ts` — dedupe por `trim().toLowerCase()`.
- `normalizeLabel` já existia em `src/features/onboarding/suggestionFeed.ts`,
  equivalente a `norm_label`, mas era usada apenas para montar a lista de
  sugestões, não na entrada de itens.
- A lista "Comuns no seu segmento" era filtrada apenas contra o feed, não
  contra os itens já adicionados pela pessoa.
- Verificação em produção (somente leitura): o catálogo ativo **não** possui
  colisões internas por `norm_label`; existe perfil real com necessidade de
  texto livre cujo label coincide exatamente com um item ativo do catálogo,
  porém com `taxonomy_item_id` nulo — texto livre e catálogo convergem para o
  mesmo label.

## Impacto

Falha de save no último passo do cadastro, com mensagem genérica e sem indicar
qual item repetiu nem levar de volta à etapa correta. Sem perda de dados: a
gravação do perfil é uma transação única e o rascunho local é preservado.

## Correção aplicada

- Nova identidade canônica de item em `src/features/onboarding/itemIdentity.ts`:
  mesmo `taxonomyItemId` não-nulo **ou** mesmo label após `normalizeLabel`
  (trim + minúsculas + sem acentos + espaços colapsados) — igual ao banco.
- Todos os caminhos de entrada de `StepOffers`/`StepNeeds` passam a usar essa
  regra: feed de IA/heurística, "Comuns no seu segmento", texto livre e
  `mergeCapped` ("Aceitar todas").
- "Comuns no seu segmento" deixa de exibir itens já adicionados.
- `validateWizardForSubmit` detecta a colisão **antes de qualquer RPC**, com
  mensagem citando os dois labels e a etapa ("o que você oferece" / "o que você
  procura"); a rota `/participar` leva de volta à etapa correspondente.
- `mapWizardToSaveProfileInput` repete a checagem como última defesa de
  fronteira (`duplicate_offer_label` / `duplicate_need_label`).
- Rascunhos antigos já inválidos **não** são deduplicados em silêncio: são
  preservados e sinalizados para a pessoa decidir.
- O check do banco foi preservado integralmente; `save_own_profile_v2`,
  matcher, pesos e taxonomia não foram alterados.

Regressão coberta em `src/__tests__/incidente-2026-09-09-item-duplicado.test.ts`.

## Auditoria pós-incidente / evidência de produção / riscos adicionais

### Evidência de produção (somente leitura, sem PII)

O perfil que concluiu o cadastro depois ficou com uma necessidade de texto livre
`Insumos agrícolas` (`source=user`, `taxonomy_item_id = null`), enquanto existe
item **ativo** do catálogo com o mesmo label canônico. Isso é **evidência forte
da classe de causa confirmada** — coexistência de entrada manual e entrada de
catálogo/sugestão equivalentes — e **não** uma reconstrução forense completa: o
payload exato da tentativa que falhou não é persistido, então o segundo item do
draft não pode ser provado item a item.

### Riscos adicionais encontrados na auditoria do fluxo (corrigidos)

1. **Evento errado nas etapas 3 e 4** — `/participar` calculava `targetEventId`
   mas passava `eventId={EVENT_ID}` para `StepOffers`/`StepWhoISeek`, fazendo a
   IA e as sugestões consultarem a feira real mesmo no sandbox. Corrigido para
   `targetEventId`.
2. **Analytics contaminando métricas entre eventos** — `onboarding_started` e
   `onboarding_completed` usavam `EVENT_ID`. Agora usam `targetEventId`, com
   `dedupeKey` também por evento.
3. **Travamento no retry de contato em modo criação** — após `CONTACT_OK`, o
   retry só chamava `runRecompute()` quando `mode !== "create"`, deixando a
   máquina em `recomputing_matches` ("Buscando conexões…") sem nada finalizar.
   Agora `shouldRecomputeAfterContactRetry(mode)` recupera nos dois modos; o
   recompute é redundante em relação ao já feito por `save_own_profile_v2`, mas
   é a recuperação explícita e determinística mais simples e testável.
4. **Sujeira documental** — `docs/roadmap.md` tinha marcador literal
   `<<<<<<< HEAD`; consolidado sem perda de conteúdo.
5. **Scripts temporários** — `forensic-h2.ts`, `forensic-h3.ts` e
   `forensic-h3b.ts` (investigação de Instagram, sem referências) removidos.

### Drift front x RPC (revisão de limites e regras)

Front igual ou mais restritivo que o servidor em todos os campos revisados:

| Campo | Front | RPC / schema de payload |
| --- | --- | --- |
| nome / empresa / cidade | `trim`, mín. 2, máx. 120/120/80 | mín. 1 |
| resumo | `trim`, mín. 1, máx. 500 | mín. 1, sem máximo |
| nicho | máx. 120 | máx. 120 |
| ofertas / necessidades | 1..5, label 2..80, detalhe ≤200 | 1..5, label ≥1 |
| prioridade | exatamente 1 (schema + mapper) | validada no banco |
| perfil desejado | os 3 controles respondidos; `any`/`""` → NULL | nulável |
| consentimento | `literal(true)` | booleano |

Drift residual aceito: o servidor não limita o tamanho do resumo nem exige
mínimo de 2 caracteres em nome/empresa/cidade. Nada é relaxado no servidor para
acomodar o front; qualquer chamada programática mais frouxa continua sendo
recusada pelas defesas de fronteira do wizard.

## Risco residual

- **Escrita em duas etapas:** o perfil e o contato (WhatsApp) são gravados por
  RPCs separadas. Se o perfil grava e o contato falha, o perfil permanece salvo
  e a UI oferece repetir o contato — agora concluindo o fluxo também em modo
  criação. A separação em si não foi alterada.
- ~~**Sem canonicalização automática**~~ — **resolvido** (ver seção abaixo).
- **Payload da tentativa que falhou não é persistido**, o que limita futuras
  investigações do mesmo tipo.
- Proteção contra envio duplo (`runningRef` com `finally`) auditada e mantida.

## Canonicalização automática conservadora (correção do risco residual)

O risco residual "texto livre com label idêntico ao catálogo salvo com
`taxonomy_item_id` nulo" foi corrigido no front, sem alterar matcher, pesos,
relações taxonômicas, schema ou dados de produção.

Helper puro: `src/features/onboarding/canonicalizeItems.ts`.

Regras (determinísticas, sem fuzzy):

1. Item que já tem `taxonomyItemId` é preservado.
2. Vínculo só com igualdade **exata** após a mesma `normalizeLabel` do
   onboarding, contra o label canônico ou um sinônimo exato do item.
3. Label canônico tem precedência sobre sinônimo.
4. `kind` compatível: oferta ↔ `offer`/`both`; necessidade ↔ `need`/`both`.
5. Mais de um candidato → não vincula (preserva texto livre).
6. Só vincula item com `segment_id` autoritativo, porque `save_own_profile_v2`
   exige `taxonomy_items.segment_id = segment_id do payload`, item `active` e
   `kind` compatível; ao vincular, usa esse segmento autoritativo.
7. Nunca reaproveita um id já usado por outro item da mesma lista.
8. Sem substring, sem Levenshtein, sem IA — falso negativo é preferível a
   vínculo taxonômico errado.

Pontos de aplicação: texto manual e sugestões de IA/heurística sem id em
`StepOffers`/`StepNeeds`, e `canonicalizeDraftItems` antes do submit em
`/participar` (recupera rascunhos antigos salvos localmente).

A detecção de duplicidade permanece exatamente como estava: nada é deduplicado
em silêncio e a colisão continua sendo mostrada à pessoa antes de qualquer RPC.

Caso real coberto: `Insumos agrícolas` no segmento agro passa a ser salvo com o
`taxonomy_item_id` canônico quando a correspondência é única.

Cobertura: `src/__tests__/canonicalizacao-taxonomia-onboarding.test.ts`.
