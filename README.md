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

Provas SQL end-to-end (executadas manualmente com `psql -f`): `scripts/impl11-hardening-proof.sql`,
`scripts/impl12-relations-e2e-proof.sql`, `scripts/matcher-taxonomy-governance-proof.sql`,
`scripts/outcomes-analytics-proof.sql`.

---

## Arquitetura atual

```
src/
  config/event.ts        evento público/principal padrão (EVENT_ID, EVENT_NAME)
  routes/                rotas file-based do TanStack Router
  features/              domínios de produto (admin, analytics, auth, connections,
                         matching, onboarding, participant, recovery, staff, taxonomy)
  lib/                   tipos compartilhados, utilitários, IA (gateway + orquestrador)
  integrations/supabase/ clientes gerados (não editar)
  testing/               espelhos de especificação usados só por testes
  __tests__/             suíte Vitest
supabase/migrations/     schema, RPCs, RLS e grants
```

Princípios em vigor:

- **Fonte única de verdade é o banco.** Não há store local nem catálogo mockado; segmentos,
  taxonomia, matches e conexões vêm sempre de RPCs.
- **Multi-eventos por `event_id`.** O evento público padrão continua em `src/config/event.ts`,
  enquanto o painel administrativo usa `AdminEventContext`/`EventSelector`; o matcher nunca cruza
  participantes de eventos diferentes.
- **Mutações só por RPC `SECURITY DEFINER`** com validação e auditoria; RLS bloqueia escrita
  direta pelo Data API.
- **PII isolada** no schema `private` (`profile_contacts`, `profile_recovery`), fora do Data API.
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
| `/admin/taxonomia` | admin | Gestão de itens de taxonomia, sinônimos, relações, cobertura e rebuild do matcher |

---

## Matcher v2.4

A especificação documental canônica está em `docs/specs/matcher-v2.4.md`. A fonte executável
continua sendo `_recompute_matches_for_profile(profile_id, event_id)` no PostgreSQL
(`SECURITY DEFINER`), chamado ao final de `save_own_profile_v2` e também pela recomputação manual.

Cada dupla recebe **duas perspectivas independentes** (`A → B` e `B → A`), portanto o mesmo par
pode ter rótulos diferentes para cada participante.

Pesos oficiais por perspectiva:

| Sinal | Pontos | Pode criar a dupla? |
| --- | ---: | :---: |
| O outro oferece algo que eu procuro | 55 | sim |
| O outro procura algo que eu ofereço | 25 | sim |
| Relação complementar de taxonomia | 12 a 30 | sim |
| Perfil desejado completo — 1 critério | 20 | sim |
| Perfil desejado completo — 2 critérios | 30 | sim |
| Perfil desejado completo — 3 critérios | 40 | sim |
| Perfil desejado mútuo | 10 | não |
| Necessidade prioritária atendida diretamente | 10 | não |
| Overlap comercial entre segmentos diferentes | 5 | não |
| Atualidade do perfil | 3 | não |
| Mesma cidade | 2 | não |

**Rótulo por perspectiva** (via `match_label_for_score`):
`alta_compatibilidade` ≥ 75 · `boa_oportunidade` ≥ 40 · `conexao_possivel` < 40.

O score **não é porcentagem** e pode ultrapassar 100; o máximo teórico atual é 180.
O campo legado `matches.label` usa o maior score da dupla e **não deve** ser apresentado como
classificação do participante; use o label derivado da própria perspectiva.

### Perfil desejado — “quem eu procuro”

Porte, tipo de negócio e segmento são `all-or-nothing`: campos “Qualquer” são ignorados e todos
os critérios realmente informados precisam bater. Encaixe parcial vale zero. Um encaixe completo
pode criar um match de networking/perfil-alvo mesmo sem overlap comercial direto.

### Explicabilidade

Relações taxonômicas carregam rastreabilidade forte (`profile_need_id`, `profile_offer_id`,
`taxonomy_relation_id`, peso e rationale). Os reasons principais de overlap `+55/+25` ainda são
mais genéricos; enriquecer esses motivos com os IDs exatos dos itens está no roadmap.

Um espelho legível dos pesos e da classificação vive em `src/testing/matching-spec.ts`,
**usado somente por testes**. O SQL continua sendo a autoridade executável.

### Complementaridade taxonômica

`public.taxonomy_relations` liga uma **necessidade** (`from_taxonomy_item_id`) a uma **oferta**
(`to_taxonomy_item_id`) de forma direcional. A leitura correta é:

> quem **PRECISA DE A** pode combinar com quem **OFERECE B**.

- peso `< 40`: não pontua;
- peso `40..100`: `round(weight × 0,30)` → 12..30 pontos;
- somente a melhor relação aplicável por perspectiva é usada;
- o sentido inverso só existe se cadastrado separadamente.

O bônus `+5` historicamente chamado de “complementaridade” **não usa** esse grafo: é apenas um
match comercial direto entre empresas de segmentos diferentes. Em documentação nova, prefira
**conexão entre segmentos** para esse sinal.

### Governança de snapshots

`matches` são snapshots persistidos. Alterar item, sinônimo ou relação taxonômica muda a semântica
do matcher, mas não reescreve automaticamente scores já calculados. A migration
`20260909194000_matcher_taxonomy_governance.sql` introduz revisão da taxonomia, estado `dirty`
por evento, métricas de cobertura e `admin_recompute_event_matches(event_id)` para reaplicar a
configuração atual de forma auditada.

---

## Taxonomia

- **Segmento por item**: cada `taxonomy_items` carrega o próprio `segment_id`, que é a
  autoridade — o segmento do perfil não sobrescreve o segmento do item escolhido.
- **`needKind`**: toda necessidade declara o tipo do que se procura (`servico`, `fornecedor`,
  `parceiro`, `compradores`, `distribuidores`, `profissionais`, `produtos`, `outro`),
  propagado do wizard até o matcher e as explicações.
- **`taxonomy_match()` é determinístico**: mesmo `taxonomy_item_id`, igualdade de label
  normalizada, sinônimo explícito ou contenção textual respeitando fronteira de palavra.
- O core **não** usa embedding, LLM pairwise, cosine similarity ou fuzzy score semântico genérico.
  A inteligência semântica mais forte acontece antes, quando o onboarding com IA tenta mapear a
  linguagem do participante para um `taxonomyItemId` canônico.
- Itens livres podem permanecer com `taxonomy_item_id = NULL`; nesse caso não participam do grafo
  `taxonomy_relations`.

---

## IA (Lovable AI Gateway)

Opcional e sob demanda: o botão "Analisar com IA" no wizard chama uma TanStack Server Function
(`src/lib/onboarding-ai.functions.ts`) que interpreta o resumo (A1) e sugere ofertas e
necessidades normalizadas contra a taxonomia real (A2).

- **Cross-segment**: as sugestões não ficam presas ao segmento do participante; itens de outros
  segmentos são propostos quando fazem sentido comercial, sempre validados contra o catálogo.
- Saída estruturada validada com Zod; IDs inexistentes/inativos são descartados.
- Cache por hash de entrada, rate limit por usuário, controle de concorrência e **fallback
  heurístico** silencioso quando o gateway falha.
- Execuções registradas em `ai_runs` sem PII (hash, tamanho do resumo, latência, modelo).
- A IA **sugere**; nada entra no perfil sem confirmação explícita do participante.

---

## Operação e mensuração

- `/equipe`: fila de conexões com atribuição atômica, máquina de estados linear
  (`aguardando → em_atendimento → apresentados → contato_trocado → concluido`, com
  `cancelado`), notas, revelação de contato auditada, marcação no mapa físico (pins) e
  registro de resultados comerciais (conversa, reunião, proposta).
- `/admin`: estatísticas do evento, staff, e card de analytics de experiência (funil de
  onboarding, matches e conexões) — tudo agregado e sem PII.

## Ausência intencional de notificações

O produto **não** envia e não deve enviar notificações (push, e-mail, SMS ou WhatsApp
automático). A descoberta de matches é por consulta do participante no painel e pela ação
presencial da equipe. Isso é uma decisão de produto, não uma pendência.

---

## Primeiro admin (provisionamento seguro)

Nenhuma senha vive no repositório e nenhuma migration deve criar credenciais.

1. Crie a conta no provedor de autenticação (Lovable Cloud → Auth → Users), definindo a senha
   fora do repositório.
2. Promova a conta a admin do evento com um admin já existente, via `/admin` (que usa
   `admin_add_event_staff_by_email`). Não havendo nenhum admin ainda, execute uma única vez,
   fora de commit, no console SQL do backend:

   ```sql
   INSERT INTO public.event_staff (event_id, user_id, role)
   SELECT '<event_id>', u.id, 'admin'::public.app_role
   FROM auth.users u
   WHERE lower(u.email) = lower('<email>')
   ON CONFLICT DO NOTHING;
   ```

3. Demais membros são adicionados por `/admin` com papel `staff` ou `admin`.

> **Aviso de credencial exposta.** O histórico do repositório contém uma migration que promove
> um e-mail administrativo específico (`admin@admin.com.br`), e a senha correspondente foi
> combinada fora do código. Migrations já aplicadas não são reescritas. A rotação dessa
> credencial (troca de senha ou remoção do usuário) deve ser feita **no provedor de
> autenticação, fora do commit** — nunca colocando outra senha no repositório. Se a conta não
> for mais necessária, remova também a linha correspondente em `public.event_staff`.

---

## Modelo de dados e segurança

- Perfis: `profiles` (sem PII de contato) + `profile_offers`, `profile_needs`,
  `profile_segments`, `consents`.
- Matching: `matches`, `match_reasons`, `match_decisions`, `match_status_history`.
- Conexões: `connections`, `connection_events`, `connection_notes`,
  `connection_status_history`.
- Taxonomia: `taxonomy_items`, `taxonomy_relations`.
- Governança do matcher: `matcher_config_state`, `matcher_event_state`.
- Operação e auditoria: `event_staff`, `staff_roles`, `audit_logs`, `analytics_events`, `ai_runs`.
- Privado (fora do Data API): `private.profile_contacts`, `private.profile_recovery`,
  `private.recovery_attempts`.

Contato do outro participante só é revelado com **interesse mútuo + conexão em estágio
apresentados ou além** (`reveal_contact_for_match`); a equipe usa
`staff_reveal_contact_for_match`, sempre com registro em `audit_logs`.

Visitantes usam sessão anônima do Supabase Auth vinculada a `profiles.owner_id`; equipe e
admin entram com e-mail e senha. Recuperação de perfil usa telefone + código com hash,
rate limit e bloqueio temporário (`recover_profile_v2`), transferindo o `owner_id`.

## Rascunho do wizard

- Chave `sudoexpo:wizard-draft:v2` (envelope `{ version, savedAt, draft }`, expira em 24h).
- Persiste apenas dados profissionais. Nunca vão ao localStorage: WhatsApp, e-mail, IDs de
  usuário/perfil, código de recuperação, matches, decisões, contatos ou tokens.
- Criação exige WhatsApp e consentimento e termina com exibição única do código de
  recuperação; edição mantém o código e torna o WhatsApp opcional.