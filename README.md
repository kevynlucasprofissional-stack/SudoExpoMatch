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
`scripts/impl12-relations-e2e-proof.sql`, `scripts/outcomes-analytics-proof.sql`.

---

## Arquitetura atual

```
src/
  config/event.ts        configuração real do evento (EVENT_ID, EVENT_NAME) — single-event
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
| `/admin/taxonomia` | admin | Gestão de itens de taxonomia, sinônimos e relações complementares |

---

## Matcher v2.3

Executado inteiramente no banco por `_recompute_matches_for_profile(profile_id, event_id)`
(`SECURITY DEFINER`, sem `auth.uid()`), chamado ao final de `save_own_profile_v2` na mesma
transação — a descoberta de matches é automática e simétrica (quando B entra, A já enxerga
o match, sem recomputar). `recompute_own_matches` permanece apenas como recuperação manual.

Pesos oficiais por perspectiva:

| Sinal | Peso |
| --- | --- |
| O outro oferece o que eu procuro | 55 |
| O outro procura o que eu ofereço | 25 |
| Prioridade declarada | 10 |
| Complementaridade | 5 |
| Atualidade do perfil | 3 |
| Proximidade (cidade/bairro) | 2 |

**Rótulo por perspectiva** (cada lado recebe o seu, via `match_label_for_score`):
`alta_compatibilidade` ≥ 75 · `boa_oportunidade` ≥ 40 · `conexao_possivel` < 40.

**Explicabilidade**: cada match persiste `match_reasons` por perspectiva, ligando
`profile_need_id` / `profile_offer_id` / `taxonomy_relation_id` ao motivo exibido — é isso que
`/participante` e `/admin/matches` mostram.

Um espelho legível dos pesos e da classificação vive em `src/testing/matching-spec.ts`,
**usado somente por testes** (há guarda estática impedindo import em rotas/componentes).

### Complementaridade (relações editáveis)

`public.taxonomy_relations` liga dois itens de taxonomia com `relation_type`, `weight`,
`rationale` e `active`. O matcher consome essas relações para pontuar complementaridade real
(ex.: quem fabrica × quem embala) em vez de heurística textual. Admins criam, editam e
desativam relações em `/admin/taxonomia` via RPCs auditadas
(`admin_create_taxonomy_relation`, `admin_update_taxonomy_relation`,
`admin_set_taxonomy_relation_active`).

---

## Taxonomia

- **Segmento por item**: cada `taxonomy_items` carrega o próprio `segment_id`, que é a
  autoridade — o segmento do perfil não sobrescreve o segmento do item escolhido.
- **`needKind`**: toda necessidade declara o tipo do que se procura (`servico`, `fornecedor`,
  `parceiro`, `compradores`, `distribuidores`, `profissionais`, `produtos`, `outro`),
  propagado do wizard até o matcher e as explicações.
- **Sinônimos** normalizados alimentam `taxonomy_match` (índices trigram/GIN).

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
