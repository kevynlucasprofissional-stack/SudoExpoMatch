# CURRENT_STATE — SudoExpo Match

## 1. Metadados

- **Data**: 2026-09-09
- **Branch de trabalho**: `feat/matcher-taxonomy-governance`
- **Base sincronizada**: `main` até `4fabdd4`, incorporada por merge commit sem reescrever histórico do Lovable.
- **Backup pré multi-eventos**: branch/tag `backup-pre-multi-eventos-20260909` / `backup-pre-multi-eventos`.
- **Sincronização Lovable**: ativa; não usar force-push/rebase/amend/squash sobre histórico publicado.

## 2. Arquitetura atual

### Multi-eventos

- PostgreSQL/Supabase com particionamento lógico por `event_id` nas entidades transacionais relevantes.
- `cafe-entre-amigos-ago-2026` preserva o piloto histórico.
- `sudoexpo-2026` é o evento principal atual.
- `_recompute_matches_for_profile(p_profile_id, p_event_id)` só considera candidatos do mesmo evento.
- `AdminEventContext` + `EventSelector` permitem alternar o contexto administrativo.
- Check-in de veteranos e check-in manual por staff/admin já existem.
- `/admin/taxonomia` envia `selectedEventId` também ao `TaxonomyItemSheet`.

### Suporte ao participante

- Incorporados os botões de suporte por WhatsApp em `ParticipantHeader.tsx` e `ProfileCard.tsx` apontando para `https://wa.me/5564992470988`.

### Sandbox & Exclusão de Participantes (Fase 7)

- **Migração SQL**: `supabase/migrations/20260909171500_sandbox_e_delecao_participante.sql`
  - Criado evento `'sandbox-sudoexpo'` ("Ambiente de Testes / Sandbox — SudoExpo") isolado.
  - RPC `admin_delete_participant(p_profile_id)`: remove perfil em cascata, ofertas, demandas, matches, conexões, contatos privados e limpa tentativas em `private.phone_claim_attempts` para liberação imediata do número de WhatsApp testado.
  - RPC `admin_clear_sandbox()`: limpa em lote todos os perfis e conexões de teste criados no sandbox.
- **Frontend & UX**:
  - Botão `"🧪 Testar Cadastro (Sandbox)"` no Dashboard Admin (`/admin`) e na Lista de Participantes (`/admin/participantes`).
  - Wizard de cadastro (`/participar?event=sandbox-sudoexpo`) isolado com faixa visual avisando o modo sandbox.
  - Painel do participante (`/participante?event=sandbox-sudoexpo`) isolado com faixa visual de sandbox.
  - Botão `"Excluir Participante"` com diálogo de confirmação seguro na tabela (`/admin/participantes`) e na gaveta lateral (`ParticipantDetailSheet.tsx`).
  - Ação `"Zerar Dados do Sandbox"` no Admin para limpeza em 1 clique quando o evento sandbox estiver ativo.
- **Testes**:
  - Suíte `src/__tests__/sandbox-e-reset.test.ts`: 6/6 testes passando.
  - Suíte `src/__tests__/multi-eventos-checkin.test.ts`: 7/7 testes passando.
  - `npm run typecheck`: 0 erros.

---

## 3. Matcher v2.4 — comportamento confirmado pela codebase

A fonte executável é `public._recompute_matches_for_profile(profile_id, event_id)`. A especificação documental canônica criada nesta branch é `docs/specs/matcher-v2.4.md`.

### Score por perspectiva

| Sinal | Pontos | Pode criar dupla? |
| --- | ---: | :---: |
| Outro oferece o que eu procuro | +55 | sim |
| Outro procura o que eu ofereço | +25 | sim |
| Relação taxonômica complementar | +12..+30 | sim |
| Perfil desejado completo — 1 critério | +20 | sim |
| Perfil desejado completo — 2 critérios | +30 | sim |
| Perfil desejado completo — 3 critérios | +40 | sim |
| Perfil desejado mútuo | +10 | não |
| Prioridade atendida diretamente | +10 | não |
| Overlap direto entre segmentos diferentes | +5 | não |
| Perfil recente | +3 | não |
| Mesma cidade | +2 | não |

- labels: `alta_compatibilidade >=75`, `boa_oportunidade >=40`, abaixo disso `conexao_possivel`;
- score não é porcentagem e pode chegar teoricamente a 180;
- cada dupla tem notas independentes A→B e B→A;
- `matches.label` é legado e não deve ser usado para apresentação por perspectiva.

### Taxonomia

- `taxonomy_match()` é determinístico: mesmo ID, label normalizada, sinônimo explícito ou contenção com fronteira de palavra.
- não há embedding/LLM/cosine/fuzzy score genérico dentro do matcher;
- a IA de onboarding faz a maior parte da canonicalização semântica antes do SQL;
- itens livres podem ficar com `taxonomy_item_id = NULL` e não entram no grafo complementar;
- uma relação significa `NECESSIDADE (from) -> OFERTA (to)` e é direcional;
- peso `<40` não pontua; `40..100` vira `round(weight*0.30)` = 12..30;
- só a melhor relação aplicável por perspectiva é usada;
- o bônus `+5` antigo de “complementaridade” é apenas overlap direto entre segmentos diferentes, não uma relação taxonômica.

### Estado observado no snapshot de 04/09/2026

- 44 itens ativos;
- todos com `kind = both`;
- nenhum sinônimo cadastrado;
- nenhuma relação complementar cadastrada.

Logo, naquele snapshot, as capacidades de sinônimos e grafo complementar estavam tecnicamente prontas mas praticamente ociosas.

---

## 4. P0 implementado nesta branch — governança de snapshots

### Problema

`matches` são snapshots persistidos. Antes, editar item, sinônimo ou relação taxonômica mudava a configuração sem invalidar/reconstruir os matches já calculados.

### Implementação

Migration: `supabase/migrations/20260909194000_matcher_taxonomy_governance.sql`

Adiciona:

- `matcher_config_state`: revisão global da taxonomia;
- `matcher_event_state`: revisão aplicada no último rebuild de cada evento;
- triggers em `taxonomy_items` e `taxonomy_relations` que avançam a revisão;
- `admin_get_matcher_taxonomy_status(event_id)`;
- `admin_recompute_event_matches(event_id)`;
- advisory lock para impedir dois rebuilds simultâneos do mesmo evento;
- auditoria do rebuild em `audit_logs`;
- RLS/privilegios de estado interno restritos.

### Admin UX

`/admin/taxonomia` agora mostra:

- `dirty` / taxonomia aplicada;
- revisão atual e revisão aplicada;
- cobertura canônica de ofertas e necessidades;
- quantidade de itens com sinônimos;
- relações ativas e efetivas;
- perfis elegíveis;
- botão admin-only “Recalcular matches do evento”.

Mutações de taxonomia invalidam a query de saúde do matcher para refletir imediatamente a nova revisão.

---

## 5. P0 implementado — semântica NEED → OFFER no admin

`TaxonomyRelationForm` e `TaxonomyItemSheet` deixaram de apresentar relações como “A complementa B” de forma genérica.

Agora a UI explicita:

> Quem **PRECISA DE A** combina com quem **OFERECE B**.

Também mostra que:

- a relação é direcional;
- o inverso precisa ser cadastrado separadamente;
- peso abaixo de 40 não pontua;
- o peso efetivo é convertido em até 30 pontos.

---

## 6. Prova adicionada

`scripts/matcher-taxonomy-governance-proof.sql` cobre transacionalmente:

1. evento sem rebuild inicia `dirty`;
2. rebuild aplica a revisão e deixa `clean`;
3. mutação de taxonomia incrementa revisão e volta a `dirty`;
4. novo rebuild volta a `clean`;
5. diagnóstico contabiliza item com sinônimo;
6. tudo termina em `ROLLBACK`.

**Importante:** a prova foi adicionada ao repositório, mas não foi executada nesta sessão contra um PostgreSQL/Supabase real. Não declarar resultado verde até executá-la no ambiente de banco.

---

## 7. Validação

### Evidência herdada do `main`

Antes desta branch, o último ciclo registrado no repositório reportava:

- `npm run typecheck`: zero erros;
- `multi-eventos-checkin.test.ts`: 7/7;
- regressões de admin/labels: 65/65.

### Alterações desta branch

Ainda precisam ser executadas no ambiente completo antes do merge final:

```bash
npm run typecheck
npm run test
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/matcher-taxonomy-governance-proof.sql
```

Não há workflow GitHub Actions configurado no repositório para executar essas verificações remotamente por esta integração.

---

## 8. Próximos passos

O backlog detalhado está em `docs/roadmap.md`. Os itens que exigem curadoria ou decisão de produto não foram alterados silenciosamente, especialmente:

- popular sinônimos e relações comerciais reais;
- revisar os 44 conceitos/`kind`;
- decidir semântica de item desativado;
- enriquecer reasons diretos +55/+25;
- separar natureza “comercial” de “perfil estratégico” na UI;
- decidir se o fornecedor recebe sinal/score taxonômico inverso;
- alterar pesos/thresholds apenas em nova versão de algoritmo;
- benchmark de rebuild com 100/250/500/1000 perfis.
>>>>>>> origin/main
