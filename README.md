# Matchmaker SudoExpo

Plataforma de matchmaking profissional para visitantes da **SudoExpo**, realizada pela **ACIRV**. Cruza o que cada visitante oferece com o que outros procuram e gera conexões presenciais com justificativa objetiva.

> **Assinatura:** _Aqui, ninguém cresce isolado. A gente cresce conectado._

---

## Stack

- **TanStack Start** (v1) + **TanStack Router** + **TanStack Query**
- **React 19** + **TypeScript** estrito
- **Tailwind CSS v4** + **shadcn/ui**
- **Zod** para validação
- **Vite 7** com deploy previsto para Edge Workers (Cloudflare)
- Preparado para **Supabase** (Lovable Cloud) — ver seção _Estado do MVP_

---

## Estado do MVP nesta entrega

### ✅ Funcional agora
- Design system ACIRV completo (tokens `oklch`, tipografia Inter + Space Grotesk, utilitários `bg-hero-gradient`, `text-gradient-brand`, animações que respeitam `prefers-reduced-motion`).
- Boas-vindas (`/`), como funciona (`/como-funciona`) e área do participante (`/participante`).
- **Wizard completo do visitante** (`/participar`) com barra de progresso, 6 etapas, validação Zod, rascunho preservado em `localStorage` e prevenção de duplo envio.
- **IA sugerindo segmentos, ofertas e necessidades** — sempre com confirmação humana.
- **Motor de matching explicável real** (`src/domains/matching/score.ts`): pesos 55 / 25 / 10 / 5 / 3 / 2, tipos `direto` / `inverso` / `bidirecional` / `complementar` / `híbrido`, classificação textual **Alta compatibilidade / Boa oportunidade / Conexão possível** (nunca percentual).
- Cards de match com ações **Tenho interesse**, **Ver perfil resumido** e **Agora não**.
- **Interesse mútuo cria conexão** e libera o link de WhatsApp no painel do participante.
- Recuperação de perfil por **WhatsApp + código pessoal**.
- Painel público (`/publico`) horizontal para TV/LED com estatísticas agregadas em tempo real.
- Seed de demonstração com **13 segmentos** e **5 perfis demo** claramente marcados.

### 🧪 Mockado (mesmo contrato da versão futura)
- **Persistência**: `localStorage` via `src/lib/store.ts` — o formato espelha o schema Supabase pedido (`profiles`, `matches`, `connections`, decisões, etc.) para que a troca vire uma substituição do repositório por chamadas Supabase, sem tocar na UI.
- **IA de sugestão** (`src/domains/ai/mock.ts`): heurística determinística por palavras-chave, com o mesmo formato de resposta previsto para a futura Edge Function.
- **Envio de WhatsApp**: gera link `wa.me` no cliente.

### ⏳ Depende da ativação do Lovable Cloud (Supabase)
Os itens abaixo foram desenhados na arquitetura mas **não** foram implementados nesta entrega porque o backend Supabase não está disponível na sessão:

- Migrations SQL, enums, `updated_at`, índices, **RLS** e schema `private` para `events`, `profiles`, `profile_contacts`, `profile_recovery`, `segments`, `taxonomy_items`, `profile_offers`, `profile_needs`, `matches`, `match_reasons`, `match_decisions`, `match_status_history`, `connections`, `connection_status_history`, `event_staff`, `consents`, `ai_runs`, `analytics_events`, `audit_logs`.
- Autenticação da equipe (email/senha) + `user_roles` (`has_role`) + rotas `/equipe/dashboard`, `/equipe/fila`, `/equipe/atendimento/$id`, painel administrativo.
- Edge Function de IA real.
- Realtime nos canais de fila / match mútuo / painel público.
- Recuperação por hash real (bcrypt/scrypt) — no mock, o código é armazenado em texto.

A rota `/equipe` já existe como placeholder honesto que informa esse estado ao usuário.

---

## Estrutura

```text
src/
├── components/
│   ├── brand/            # BrandShell, NetworkGraphic
│   └── ui/               # shadcn
├── domains/
│   ├── matching/score.ts # Serviço puro de scoring (testável)
│   └── ai/mock.ts        # Adaptador de IA (mock determinístico)
├── lib/
│   ├── types.ts          # Tipos de domínio (espelham o schema Supabase)
│   ├── mock-data.ts      # Segmentos + taxonomia + seed
│   └── store.ts          # Repositório localStorage (troca por Supabase depois)
├── routes/
│   ├── __root.tsx        # Head/metadata + QueryClientProvider + Sonner
│   ├── index.tsx         # Boas-vindas
│   ├── como-funciona.tsx
│   ├── participar.tsx    # Wizard 6 etapas
│   ├── participante.tsx  # Área do visitante + recuperação
│   ├── publico.tsx       # Painel TV/LED
│   └── equipe.tsx        # Placeholder (aguardando Supabase)
└── styles.css            # Design system ACIRV (oklch)
```

---

## Setup

```bash
bun install
bun run dev            # http://localhost:8080
```

### Para trocar o mock por Supabase (roadmap)
1. Ative Lovable Cloud no projeto.
2. Rode a migration com o schema descrito acima (todas as tabelas + RLS + GRANTs + seed).
3. Substitua as funções em `src/lib/store.ts` por chamadas ao cliente Supabase (o formato de retorno já é o mesmo).
4. Mova `computeMatchesFor` para uma **server function transacional** (`createServerFn`) que faz `upsert` em `matches` + `match_reasons`.
5. Assine os canais Realtime nos hooks de `participante` e `publico`.
6. Troque `suggestFromSummary` do mock por uma chamada à Edge Function de IA (contrato `AISuggestion` já validado).

---

## Regras do domínio (implementadas no mock)

- Um perfil por participante por evento.
- Um match existe **uma única vez** por dupla de perfis (chave canônica ordenada).
- Interesse unilateral **não** libera contato.
- Interesse mútuo cria `connection` com status `aguardando` (fila da equipe).
- Painel público só recebe **estatísticas agregadas**.

---

## Acessibilidade & qualidade

- Foco visível, labels em todos os inputs, `aria-live` implícito nas notificações Sonner.
- `prefers-reduced-motion` desativa `animate-pulse-ring` e `animate-float-slow`.
- Skeletons na área do participante enquanto hidrata.
- Rascunho do wizard preservado em `localStorage` (chave `sudoexpo:draft`).
- Botão de submit desabilita durante a criação do perfil.

---

## Créditos

Realização **ACIRV** · SudoExpo 2026.
