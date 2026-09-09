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

## Risco residual

- **Escrita em duas etapas:** o perfil e o contato (WhatsApp) são gravados por
  RPCs separadas. Se o perfil grava e o contato falha, o perfil permanece salvo
  e a UI oferece repetir o contato. Não alterado nesta correção.
- **Sem canonicalização automática:** texto livre com label idêntico a um item
  do catálogo continua sendo salvo com `taxonomy_item_id` nulo. Melhoria
  separada (afeta o matcher e exige avaliação própria).
- Proteção contra envio duplo (`runningRef` com `finally`) auditada e mantida.
