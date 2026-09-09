# ACIRV Connect — Matchmaker SudoExpo

Plataforma de matchmaking profissional para visitantes da SudoExpo (ACIRV). O objetivo é
gerar conexões comerciais presenciais entre quem oferece produtos/serviços e quem procura
essas soluções, com explicação do porquê de cada match.

Stack: TanStack Start · React · TypeScript · TanStack Router/Query · Tailwind · shadcn/ui ·
Lovable Cloud (Postgres + Auth + Realtime) · Lovable AI Gateway.

---

## Comandos

```bash
bun install          # ou npm install
npm run dev          # dev server em http://localhost:8080
npm run test         # suíte Vitest (unit + contratos SQL via psql)
npm run typecheck    # tsc --noEmit
npm run build        # build de produção (Nitro / Edge Worker)
npm run lint         # eslint .
```

Provas SQL end-to-end (executadas manualmente com `psql -f`):

- `scripts/impl11-hardening-proof.sql`
- `scripts/impl12-relations-e2e-proof.sql`
- `scripts/matcher-taxonomy-governance-proof.sql`
- `scripts/outcomes-analytics-proof.sql`

---

## Arquitetura atual

```text
src/
  config/event.ts        evento público/principal padrão
  routes/                rotas file-based do TanStack Router
  features/              domínios de produto (admin, analytics, auth, connections,
                         matching, onboarding, participant, recovery, staff, taxonomy)
  lib/                   tipos compartilhados, utilitários, IA (gateway + orquestrador)
  integrations/supabase/ clientes/tipos gerados (não editar manualmente)
  testing/               espelhos de especificação usados só por testes
  __tests__/             suíte Vitest
supabase/migrations/     schema, RPCs, RLS, grants e matcher
```

Princípios em vigor:

- **Fonte única de verdade é o banco.** Segmentos, taxonomia, matches e conexões vêm de dados/RPCs reais.
- **Multi-eventos por `event_id`.** O matcher nunca cruza participantes de eventos diferentes; o admin usa contexto de evento selecionado.
- **Mutações críticas por RPC `SECURITY DEFINER`** com validação e auditoria; RLS bloqueia escrita direta não autorizada.
- **PII isolada** no schema `private` (`profile_contacts`, `profile_recovery`), fora do Data API público.
- **Matching roda no Postgres**, não no cliente.

### Rotas

| Rota | Público | O que faz |
| --- | --- | --- |
| `/` | visitante | Landing editorial com métricas públicas agregadas |
| `/como-funciona` | visitante | Explicação do processo |
| `/participar` | visitante | Wizard de perfil (dados, ofertas, necessidades, consentimento) |
| `/participante` | visitante | Painel: matches explicados, decisões, conexões, contato liberado |
| `/publico` | telão | Painel público do evento (sem PII) |
| `/equipe` | staff/admin | Central operacional de conexões |
| `/admin` | admin | Visão geral do evento e gestão de `event_staff` |
| `/admin/participantes` | admin | Lista e detalhe de participantes (sem PII de contato) |
| `/admin/matches` | admin | Auditoria de matches: score, rótulo, motivos, decisões |
| `/admin/taxonomia` | admin | Gestão de itens, sinônimos, relações, cobertura e rebuild do matcher |

---

## Matcher v2.4

A especificação documental canônica está em **`docs/specs/matcher-v2.4.md`**. A fonte executável
continua sendo `public._recompute_matches_for_profile(profile_id, event_id)` no PostgreSQL.

O matcher calcula **duas perspectivas independentes** para cada dupla (`A → B` e `B → A`).
O mesmo par pode ser “alta compatibilidade” para um lado e “conexão possível” para o outro.

### Pesos oficiais por perspectiva

| Sinal | Pontos | Pode criar a dupla? |
| --- | ---: | :---: |
| O outro oferece algo que eu procuro | +55 | sim |
| O outro procura algo que eu ofereço | +25 | sim |
| Relação complementar de taxonomia | +12 a +30 | sim |
| Perfil desejado completo — 1 critério | +20 | sim |
| Perfil desejado completo — 2 critérios | +30 | sim |
| Perfil desejado completo — 3 critérios | +40 | sim |
| Perfil desejado mútuo | +10 | não |
| Necessidade prioritária atendida diretamente | +10 | não |
| Overlap comercial entre segmentos diferentes | +5 | não |
| Atualidade do perfil | +3 | não |
| Mesma cidade | +2 | não |

**Rótulo por perspectiva** (`match_label_for_score`):
`alta_compatibilidade` ≥ 75 · `boa_oportunidade` ≥ 40 · `conexao_possivel` < 40.

O score **não é porcentagem** e pode ultrapassar 100; o máximo teórico atual é 180.

> `matches.label` é um campo legado calculado pelo maior score da dupla. Interfaces de participante
devem usar apenas o rótulo derivado da própria perspectiva (`label_me` / `label_a` / `label_b`).

### “Quem eu procuro”

Porte, tipo de negócio e segmento são all-or-nothing: só os critérios informados contam e todos
eles precisam bater. Campo “Qualquer” é ignorado. Encaixe parcial vale zero. Esse mecanismo pode
criar um match de networking/perfil-alvo mesmo sem overlap comercial direto.

### Explicabilidade

- Relações complementares registram rastreabilidade forte no reason: necessidade, oferta,
  relação taxonômica, peso e rationale.
- Os reasons principais de overlap `+55/+25` ainda são mais genéricos; enriquecer esses motivos
  com os IDs exatos dos itens que produziram o sinal está no roadmap.

Um espelho legível dos pesos e da classificação vive em `src/testing/matching-spec.ts`, usado
somente por testes. O SQL continua sendo a autoridade executável.

---

## Taxonomia

A taxonomia tem três funções distintas:

1. **Ontologia**: catálogo canônico de ofertas e necessidades.
2. **Canonicalização**: IDs e sinônimos para aproximar linguagem humana do conceito correto.
3. **Grafo comercial**: relações complementares dirigidas `NECESSIDADE → OFERTA`.

### `taxonomy_match()`

É determinístico. Considera equivalência por:

- mesmo `taxonomy_item_id`;
- label normalizada igual;
- sinônimo explicitamente cadastrado;
- contenção textual respeitando fronteira de palavra.

Não existe embedding, LLM pairwise, cosine similarity ou fuzzy score semântico no core do matcher.
A inteligência semântica mais forte acontece antes, no onboarding com IA, que tenta mapear o
texto do participante para um `taxonomyItemId` canônico.

### Relações complementares

`public.taxonomy_relations` é direcional:

```text
from_taxonomy_item_id = NECESSIDADE
              ↓
to_taxonomy_item_id   = OFERTA
```

A leitura correta é: **quem PRECISA de A pode combinar com quem OFERECE B**.

- peso `< 40`: não pontua;
- peso `40..100`: `round(weight × 0,30)` → 12..30 pontos;
- se várias relações se aplicarem à mesma perspectiva, somente a de maior peso é usada;
- o inverso só existe se cadastrado separadamente.

O bônus antigo de `+5` chamado genericamente de “complementaridade” **não usa** esse grafo; ele
é apenas um overlap comercial direto entre empresas de segmentos diferentes. Em documentação
nova, trate-o como **conexão entre segmentos**.

### Governança de snapshots

`matches` são snapshots persistidos. Alterar item, sinônimo ou relação muda a semântica da
configuração, mas precisa de recomputação para atualizar pares já calculados.

A migration `20260909194000_matcher_taxonomy_governance.sql` adiciona:

- revisão global da configuração taxonômica;
- revisão aplicada por evento;
- estado `dirty` quando um evento precisa de rebuild;
- métricas de cobertura canônica no admin;
- RPC admin-only `admin_recompute_event_matches(event_id)`;
- auditoria de rebuilds.

Em `/admin/taxonomia`, o administrador consegue ver se os snapshots estão atualizados e aplicar
a configuração corrente ao evento selecionado.

---

## IA (Lovable AI Gateway)

Opcional e sob demanda: o botão “Analisar com IA” no wizard chama uma TanStack Server Function
(`src/lib/onboarding-ai.functions.ts`) que interpreta o resumo e sugere ofertas e necessidades
normalizadas contra a taxonomia real.

- **Cross-segment**: sugestões podem usar itens de outros segmentos quando houver sentido comercial.
- Saída estruturada validada com Zod; IDs inexistentes/inativos são descartados.
- Cache por hash de entrada, rate limit, controle de concorrência e fallback heurístico.
- Execuções registradas em `ai_runs` sem PII sensível no payload operacional.
- A IA **sugere**; nada entra no perfil sem confirmação explícita do participante.
- O matcher final continua determinístico; a IA é usada principalmente para entender/canonicalizar a linguagem ambígua do onboarding.

---

## Operação e mensuração

- `/equipe`: fila de conexões com atribuição atômica, máquina de estados linear
  (`aguardando → em_atendimento → apresentados → contato_trocado → concluido`, com
  `cancelado`), notas, revelação de contato auditada, pins no mapa físico e registro de resultados.
- `/admin`: estatísticas, staff, participantes, matches, taxonomia e analytics agregados por evento.

## Ausência intencional de notificações

O produto **não** envia e não deve enviar notificações push/e-mail/SMS/WhatsApp automáticas.
A descoberta de matches é por consulta no painel e pela operação presencial da equipe. Isso é
uma decisão de produto, não uma pendência.

---

## Primeiro admin (provisionamento seguro)

Nenhuma senha vive no repositório e nenhuma migration deve criar credenciais.

1. Crie a conta no provedor de autenticação (Lovable Cloud → Auth → Users), definindo a senha fora do repositório.
2. Promova a conta a admin do evento com um admin existente via `/admin`. Se não houver nenhum admin, faça o provisionamento inicial fora de commit no console SQL do backend.
3. Demais membros são adicionados com papel `staff` ou `admin`.

> O histórico do repositório contém credenciais/identificadores de provisionamento antigos em migrations já aplicadas. Rotação ou remoção de conta deve ocorrer no provedor de autenticação; nunca adicione senha nova ao Git.

---

## Modelo de dados e segurança

- Perfis: `profiles`, `profile_offers`, `profile_needs`, `profile_segments`, `consents`.
- Matching: `matches`, `match_reasons`, `match_decisions`, `match_status_history`.
- Conexões: `connections`, `connection_events`, `connection_notes`, `connection_status_history`.
- Taxonomia: `taxonomy_items`, `taxonomy_relations`.
- Governança do matcher: `matcher_config_state`, `matcher_event_state`.
- Operação e auditoria: `event_staff`, `staff_roles`, `audit_logs`, `analytics_events`, `ai_runs`.
- Privado: `private.profile_contacts`, `private.profile_recovery`, `private.recovery_attempts`.

Contato do outro participante só é revelado conforme as regras de interesse/conexão e por RPCs
auditadas (`reveal_contact_for_match`, `staff_reveal_contact_for_match`).

---

## Rascunho do wizard

- Chave `sudoexpo:wizard-draft:v2` (envelope `{ version, savedAt, draft }`, expira em 24h).
- Persiste apenas dados profissionais. Nunca vão ao localStorage: WhatsApp, e-mail, IDs de
  usuário/perfil, código de recuperação, matches, decisões, contatos ou tokens.
- Criação exige WhatsApp e consentimento e termina com exibição única do código de recuperação;
  edição mantém o código e torna o WhatsApp opcional.
