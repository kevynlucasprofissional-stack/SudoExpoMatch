## Matchmaker SudoExpo — Plano de Implementação do MVP

Projeto enorme e multifacetado. Proponho entregar em **fases**, começando por uma base sólida e navegável, em vez de tentar tudo de uma vez (o que quase garante um build quebrado e áreas apenas cosméticas).

### Premissas que assumo (corrija se necessário)
- **Backend**: ativar **Lovable Cloud** (Supabase gerenciado) — necessário para migrations, RLS, Realtime e a Edge Function futura de IA. Sem isso, tudo vira mock em `localStorage`.
- **Autenticação da equipe/admin**: e-mail + senha via Lovable Cloud, com tabela `user_roles` (`staff`, `admin`) + `has_role()` (padrão seguro). Visitantes **não** logam — usam WhatsApp + código pessoal (hash) para recuperar sessão.
- **IA**: primeiro build usa **mock determinístico** (heurística por palavras-chave + taxonomia). Adaptador pronto para trocar por Edge Function depois.
- **Idioma**: pt-BR em toda a UI.
- **Tela pública TV/LED**: rota dedicada `/publico`, layout horizontal 16:9, só estatísticas agregadas via view SQL.
- **Um único evento ativo** ("SudoExpo 2026") selecionado por env/config; multi-evento fica preparado no schema mas sem seletor de UI no MVP.

### Design system
- Paleta ACIRV mapeada para tokens semânticos oklch em `src/styles.css` (primary=azul, secondary=azul claro, accent=laranja, success=verde, warning=amarelo). Variantes shadcn customizadas (`Button variant="hero"`, `variant="cta"`).
- Tipografia: Inter + Space Grotesk para títulos (via `<link>` em `__root.tsx`).
- Grafismo de rede: SVG de nós/conexões animado como plano de fundo dos heros.
- Mobile-first, respeita `prefers-reduced-motion`.

### Estrutura por domínio
```text
src/
  domains/
    profile/       (wizard, perfil, recuperação)
    matching/      (serviço de score, decisões, cards)
    connections/   (interesse, match mútuo, fila)
    staff/         (dashboard, atendimento, registro)
    admin/         (indicadores, gestão de evento)
    public-board/  (tela TV/LED)
    ai/            (adaptador + mock determinístico)
  components/ui/   (shadcn)
  components/brand/ (Logo, NetworkGraphic, ProgressBar)
  lib/             (supabase clients, zod schemas, utils)
  routes/          (TanStack file-based)
```

### Rotas (TanStack)
- Públicas: `/`, `/como-funciona`, `/participar/*` (wizard), `/participante/*` (área do visitante via código), `/publico` (TV), `/auth` (equipe).
- Protegidas `_authenticated/`: `/equipe/dashboard`, `/equipe/fila`, `/equipe/atendimento/$id`, `/admin/*` (gate extra por role via `has_role`).

### Banco (migrations em uma única migration inicial)
Todas as tabelas pedidas + enums (`match_kind`, `match_label`, `decision`, `connection_status`, `role`), triggers `updated_at`, índices em FKs, uniques (`profile_id_evento`, `match dupla`), GRANTs + **RLS**:
- `profiles`: visitante lê/edita só o próprio (via `recovery_hash` cookie session); equipe do evento lê tudo do evento.
- `private.profile_contacts`/`private.profile_recovery`: schema `private`, sem grant para `anon`/`authenticated` — acesso só via server functions com service role.
- `matches`/`connections`: visitante vê os seus; equipe vê do evento.
- `analytics_events` agregadas via `SECURITY DEFINER` view para `/publico`.
- Seed "SudoExpo 2026" + 13 segmentos + taxonomia + ~12 perfis demo marcados `is_demo=true`.

### Matching explicável (serviço transacional)
`src/domains/matching/score.ts` puro (testável) implementando os pesos exatos (55/25/10/5/3/2), tipos `direto|inverso|bidirecional|complementar|híbrido`, e classificação textual por faixas. Server function `recomputeMatches(profileId)` faz upsert em `matches` + `match_reasons` dentro de uma transação. Testes Vitest cobrindo cada tipo e cada faixa.

### Realtime
Canais Supabase: `queue:{eventId}`, `matches:{profileId}`, `public:{eventId}`. Hooks `useRealtimeQueue`, `useRealtimeMatches`, `usePublicStats`.

### O que fica no MVP desta primeira entrega
**Funcional (com Cloud ativo)**: schema completo + RLS + seed; wizard do visitante ponta a ponta com persistência; matching real com score explicável; cards de match + ações; interesse mútuo cria `connection`; área do participante; login da equipe; dashboard + fila + tela de atendimento com registro; painel admin com indicadores; tela `/publico`; recuperação por WhatsApp+código.

**Mockado**: adaptador de IA (heurística determinística local, mesmo contrato JSON da futura Edge Function); foto/ligação de pins na tela de atendimento (upload gravado mas visualização simples); notificações WhatsApp reais (apenas link `wa.me`).

**Depende de ativação/configuração posterior**: Edge Function de IA real; envio de WhatsApp transacional; domínio + QR code de produção; configuração de múltiplos eventos.

### Qualidade
- Zod em todo input (wizard, server fns, forms).
- Estados loading/vazio/erro/sucesso + skeletons em toda tela de dados.
- Rascunho do wizard em `localStorage` com TTL.
- `useMutation` com `disabled` durante `isPending` para evitar duplo envio.
- Acessibilidade: labels, foco visível, `aria-live` nas animações, navegação teclado, respeito a `prefers-reduced-motion`.
- README completo (setup, env, migrations, seed, testes, deploy).
- Testes Vitest para `score.ts` + fluxo de decisão de match.

### Ordem de execução
1. Ativar Lovable Cloud.
2. Design system + shell + `__root` metadata + tela de boas-vindas + `/como-funciona`.
3. Migration única (schema + RLS + seed) + tipos gerados.
4. Wizard completo do visitante + persistência + recuperação.
5. Serviço de matching + testes + tela de matches + interesse.
6. Auth de equipe + dashboard + fila + atendimento + admin.
7. Tela pública + Realtime + analytics.
8. README + polimento + revisão de RLS.

### Riscos que quero deixar explícitos
- Escopo total é 2–3× o que costuma caber em uma iteração. Vou entregar tudo listado como "Funcional" acima em uma sequência de edits, mas se algo precisar ser priorizado (ex.: MVP = só visitante + matches, deixando equipe/admin para depois), me diga agora.
- Sem Lovable Cloud, entrego apenas frontend + mocks em memória — matching, RLS e Realtime não existem de verdade.

Confirma que posso: (a) ativar Lovable Cloud, (b) seguir com auth de equipe por e-mail/senha, (c) entregar a IA como mock determinístico neste primeiro build?
