# Auditoria: erro "o que você procura está duplicado" no cadastro

Investigação somente de leitura do fluxo de cadastro (etapa "O que você procura", sugestões, rascunho, validação, envio e regra do banco). Nenhum arquivo foi alterado.

## O que aconteceu, em resumo

O aplicativo e o banco de dados usam **duas regras diferentes** para decidir se dois itens são "o mesmo".

- Na tela, dois itens só são considerados iguais se o texto for **exatamente igual** (ignorando apenas maiúsculas/minúsculas).
- No banco, antes de salvar, o texto é **limpo de acentos e de espaços repetidos**.

Resultado: "Consultoria agrícola" e "Consultoria agricola", ou "Insumos  agrícolas" (com dois espaços) e "Insumos agrícolas", passam pela tela como itens diferentes — visualmente parecem itens distintos ou até idênticos, sem nada de errado — e o banco recusa o cadastro com a mensagem de duplicidade. Depois que a participante mexeu na lista, o conflito sumiu e o cadastro concluiu, exatamente como relatado.

## Evidências no código

- Comparação do banco: `public.norm_label` faz minúsculas + remove acentos + colapsa espaços; `save_own_profile_v2` compara os itens com essa função e dispara `duplicate_need_label` / `duplicate_offer_label`.
- Comparação da tela (mais fraca, só minúsculas):
  - `src/features/onboarding/steps.tsx` — `addFromFeed` (l. 818), `addFromCatalog` (l. 833), ofertas (l. 497, 512, 609).
  - `src/features/onboarding/mergeItems.ts` l. 18-21 (`Aceitar todas`) usa apenas `trim().toLowerCase()`.
- Já existe a função correta e equivalente ao banco no projeto — `normalizeLabel` em `src/features/onboarding/suggestionFeed.ts` (l. 33-40: minúsculas + sem acentos + espaços colapsados) — mas ela só é usada na montagem da lista de sugestões, **não** no momento de adicionar o item à lista da pessoa.
- Segundo caminho concreto: a lista "Comuns no seu segmento" (`steps.tsx`, l. 806-812) é filtrada apenas contra as sugestões exibidas, **não** contra os itens já adicionados. Um item adicionado sai da lista de sugestões e reaparece em "Comuns no seu segmento"; clicar nele de novo é um clique sem efeito (silencioso) quando o texto bate, e cria duplicata quando difere por acento/espaço.
- `validateWizardForSubmit` e os schemas (`src/features/onboarding/schemas.ts`) **não têm nenhuma regra de duplicidade** — o botão fica habilitado.
- `mapWizardToSaveProfileInput` (`mappers.ts`) também não deduplica; apenas corta o texto em 80 caracteres, o que pode transformar dois textos longos parecidos em um único texto igual.
- Catálogo atual verificado no banco: **não há** itens de taxonomia ativos que colidam entre si por essa normalização — ou seja, a origem provável é texto livre / sugestão da IA com variação de acento ou espaço, não o catálogo.

## Riscos correlatos encontrados

- **Escrita parcial:** perfil e WhatsApp são gravados em chamadas separadas (`submitOrchestrator.ts`). Se o perfil grava e o contato falha, o perfil já ficou salvo. Existe tela de repetir contato, então é aceitável, mas é um risco real.
- **Envio duplo:** protegido por `runningRef` com `finally` (`participar.tsx`, l. 391 e 447). Sem problema.
- **Regressão do erro:** salvar de novo é seguro — a gravação do perfil é uma única transação e atualiza o perfil existente da pessoa.
- **Mensagem de erro pouco útil:** hoje diz apenas "Há itens repetidos no que você procura", sem indicar qual item nem levar de volta à etapa.

## Correção mínima e segura proposta (para uma próxima rodada, se você aprovar)

1. Usar a mesma regra do banco na tela: aplicar `normalizeLabel` nas comparações de adicionar item em `addFromFeed`, `addFromCatalog`, `addCustom` (necessidades e ofertas) e em `mergeItems.ts`.
2. Esconder da lista "Comuns no seu segmento" os itens que já estão na lista da pessoa (comparando pela mesma regra).
3. Última defesa antes de enviar: em `mapWizardToSaveProfileInput`, recusar (ou colapsar) itens equivalentes, com mensagem clara em português apontando qual item repetiu.
4. Melhorar a mensagem de erro para citar o item e voltar para a etapa correspondente.

Nada disso toca pesos, motor de matches, taxonomia ou banco de dados.

## Detalhes técnicos

- Regra do banco: `lower(regexp_replace(translate(label, acentos, sem_acentos), '\s+', ' ', 'g'))` sobre o texto já com `trim`.
- A mesma regra em TypeScript já existe: `label.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ")`.
- Sem mudança de banco de dados; correção 100% em código do aplicativo, com testes possíveis em `src/__tests__` (casos: acento, espaço duplo, catálogo + texto livre, aceitar todas).
