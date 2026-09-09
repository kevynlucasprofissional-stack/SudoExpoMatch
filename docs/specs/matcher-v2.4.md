# Matcher v2.4 — Especificação Canônica

> **Status:** fonte documental de verdade para o comportamento do matcher v2.4.
> A fonte executável continua sendo o PostgreSQL, especialmente
> `public._recompute_matches_for_profile(profile_id, event_id)`.

## 1. Princípios

1. O matcher roda no PostgreSQL e persiste snapshots em `public.matches`.
2. Só compara perfis do mesmo `event_id`.
3. Cada dupla possui duas perspectivas independentes: `A → B` e `B → A`.
4. Score não é porcentagem e pode ultrapassar 100.
5. Alterações em taxonomia não alteram snapshots já persistidos até ocorrer recomputação.
6. Conexões já formalizadas são preservadas como histórico durante recomputações.

## 2. Quando uma dupla nasce

Uma dupla só é criada/reativada se existir pelo menos um sinal de primeira classe em uma das
perspectivas:

- overlap comercial direto entre necessidade e oferta;
- relação complementar de taxonomia ativa, com peso `>= 40`;
- encaixe completo de `quem eu procuro` em pelo menos uma direção.

Cidade, recência, prioridade, perfil desejado mútuo e o bônus de segmentos diferentes elevam
um par que já possui sinal; não criam a dupla isoladamente.

## 3. Score por perspectiva

| Sinal | Pontos | Cria dupla sozinho? |
| --- | ---: | :---: |
| O outro oferece algo que eu procuro | +55 | sim |
| O outro procura algo que eu ofereço | +25 | sim |
| Relação taxonômica complementar | +12 a +30 | sim |
| Perfil desejado — 1 critério informado e atendido | +20 | sim |
| Perfil desejado — 2 critérios informados e atendidos | +30 | sim |
| Perfil desejado — 3 critérios informados e atendidos | +40 | sim |
| Perfil desejado mútuo | +10 | não |
| Necessidade prioritária atendida diretamente | +10 | não |
| Match comercial direto entre segmentos diferentes | +5 | não |
| Perfil atualizado recentemente | +3 | não |
| Mesma cidade | +2 | não |

Máximo teórico atual: **180 pontos**.

### Rótulos

- `75+` → `alta_compatibilidade`
- `40–74` → `boa_oportunidade`
- `<40` → `conexao_possivel`

O rótulo correto para apresentação é sempre derivado do score da perspectiva (`label_me`,
`label_a`, `label_b`). O campo legado `matches.label` usa o maior score da dupla e **não deve
ser usado em UI de participante**.

## 4. Overlap direto e `taxonomy_match()`

`taxonomy_match()` é determinístico. Dois itens são tratados como equivalentes quando houver:

1. o mesmo `taxonomy_item_id`; ou
2. labels normalizados exatamente iguais; ou
3. label de um lado cadastrada como sinônimo do item canônico do outro; ou
4. o inverso; ou
5. contenção textual respeitando fronteira de palavra.

O matcher **não** faz similaridade semântica genérica por embedding, LLM, cosine similarity ou
fuzzy score. Expressões semanticamente próximas só se encontram de forma confiável se forem
canonicalizadas para o mesmo item ou cobertas por sinônimos explícitos.

Múltiplos overlaps da mesma família não acumulam `55 × n` ou `25 × n`: o sinal principal é
booleano/saturado.

## 5. Onde entra a IA

A inteligência semântica principal acontece antes do matcher:

```text
texto humano
  ↓
IA / wizard
  ↓
taxonomyItemId canônico quando aplicável
  ↓
matcher SQL determinístico
```

O catálogo não é obrigatório: ofertas e necessidades podem permanecer com
`taxonomy_item_id = NULL`. Nesses casos, o match direto depende das regras textuais de
`taxonomy_match()` e o item livre não participa do grafo `taxonomy_relations`.

## 6. Relações complementares de taxonomia

`taxonomy_relations` modela um grafo dirigido:

```text
from_taxonomy_item_id = NECESSIDADE
              ↓
to_taxonomy_item_id   = OFERTA
```

A frase correta é:

> Quem **PRECISA de A** pode combinar com quem **OFERECE B**.

`A → B` não cria automaticamente `B → A`.

### Peso

- peso `< 40` → relação não pontua;
- peso `40–100` → `round(weight × 0,30)`, de 12 a 30 pontos;
- se várias relações se aplicarem à mesma perspectiva, somente a de maior peso é usada.

A relação complementar pontua a perspectiva da demanda. O fornecedor recebe a dupla por
simetria de descoberta, mas não recebe automaticamente uma fração do bônus taxonômico.
Qualquer mudança nessa assimetria é uma decisão de produto futura, não comportamento v2.4.

## 7. O bônus de +5 NÃO é taxonomia

O motivo historicamente chamado de “complementaridade” de +5 é apenas:

```text
existe overlap comercial direto
AND segmento A != segmento B
```

Não há curadoria ou grafo por trás desse +5. Em UI/documentação nova, prefira o nome
**“conexão entre segmentos”** para não confundi-lo com `taxonomy_relations`.

## 8. Prioridade

O bônus `+10` de prioridade só existe quando uma necessidade marcada como prioritária encontra
uma oferta **diretamente equivalente via `taxonomy_match()`**. Uma relação apenas complementar
não herda o bônus de prioridade no v2.4.

## 9. “Quem eu procuro”

Critérios possíveis:

- porte;
- tipo de negócio;
- segmento.

Campos “Qualquer” chegam como `NULL` e são ignorados. O encaixe é **all-or-nothing**: todos os
critérios informados precisam bater. Encaixe parcial vale zero.

Esse sinal constitui um segundo modo de descoberta, de networking/perfil-alvo, sobreposto ao
matchmaker comercial. Por isso um perfil pode chegar a `boa_oportunidade` apenas por perfil
desejado, mesmo sem overlap oferta × necessidade.

## 10. Tipo (`kind`) do match

Precedência atual:

1. `bidirecional`;
2. `hibrido`;
3. `direto`;
4. `inverso`;
5. `complementar`;
6. `perfil_desejado`.

Um bônus taxonômico pode aumentar um match que já é comercial sem trocar seu `kind` para
`complementar`.

## 11. Explicabilidade

Relações taxonômicas armazenam rastreabilidade forte no reason, incluindo ids de necessidade,
oferta e relação, peso e justificativa.

Os motivos principais de overlap `+55/+25` ainda são mais genéricos e precisam evoluir para
registrar exatamente quais `profile_need_id` e `profile_offer_id` produziram o sinal. Isso é
backlog, não comportamento atual.

## 12. Governança de snapshots

Taxonomia é configuração semântica e matches são snapshots. A partir da migration
`20260909194000_matcher_taxonomy_governance.sql`:

- qualquer `INSERT/UPDATE/DELETE` em `taxonomy_items` ou `taxonomy_relations` incrementa uma
  revisão global;
- cada evento registra qual revisão foi aplicada em seu último rebuild completo;
- `/admin/taxonomia` mostra se o evento está `dirty`;
- `admin_recompute_event_matches(event_id)` permite ao admin reaplicar o matcher a todos os
  perfis elegíveis do evento;
- a tela também mostra cobertura canônica de ofertas/necessidades, uso de sinônimos e relações.

Isso evita que editar/desativar uma relação ou cadastrar sinônimos deixe scores antigos
silenciosamente ativos.

## 13. Estado da taxonomia observado no snapshot de 04/09/2026

No `supabase/seed/config-export.sql` auditado em 04/09/2026:

- 44 itens ativos;
- 44/44 com `kind = both`;
- nenhum sinônimo cadastrado;
- nenhuma relação complementar cadastrada.

Consequência: naquele snapshot, a infraestrutura de sinônimos e o grafo complementar existiam,
mas estavam ociosos. A taxonomia operava principalmente por identidade canônica escolhida pelo
wizard/IA.

## 14. Decisões que NÃO devem ser alteradas silenciosamente

Precisam de validação de produto antes de mudar score/semântica:

- dar bônus taxonômico também ao lado fornecedor;
- distinguir rótulos de “oportunidade comercial” e “perfil estratégico”;
- mudar o peso/efeito de cidade e recência;
- bonificar múltiplos overlaps diretos;
- decidir se desativar item invalida também referências antigas em futuros cálculos;
- remover/depreciar definitivamente `matches.label`;
- alterar thresholds ou transformar score em escala normalizada.

## 15. Direção arquitetural recomendada

Manter:

```text
IA entende linguagem ambígua
  ↓
canonicalização para IDs + sinônimos
  ↓
grafo comercial curado NECESSIDADE → OFERTA
  ↓
matcher SQL determinístico, auditável e rápido
  ↓
reasons humanos e rastreáveis
```

Evitar transformar o core em comparação LLM par-a-par sem necessidade.
