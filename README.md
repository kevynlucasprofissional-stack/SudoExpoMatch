# Matchmaker SudoExpo

Plataforma de matchmaking profissional para visitantes da SudoExpo (ACIRV).
Stack: TanStack Start · React · TypeScript · TanStack Router/Query · Tailwind · shadcn/ui · Supabase.

## Modelo de segurança (Fase 1)

- **Autenticação de visitante**: sessão anônima automática do Supabase Auth no primeiro acesso a `/participar`. Cada perfil real fica vinculado ao `auth.uid()` via `profiles.owner_id`.
- **Perfis demo**: criados com `is_demo=true` e sem dono humano; contatos usam telefones fictícios em `private.profile_contacts`.
- **Contatos e código de recuperação** vivem no schema `private`, inacessível pelo Data API, e são operados apenas por RPCs `SECURITY DEFINER`:
  - `upsert_own_profile`, `set_own_contact`, `rotate_own_recovery_code`
  - `recover_profile` (com rate limit + bloqueio temporário de 15 min após 5 falhas)
  - `record_match_decision` (participante altera só o próprio lado)
  - `store_computed_matches` (participante grava apenas matches envolvendo o próprio perfil)
  - `reveal_contact_for_match` (participante só vê contato do outro quando há **interesse mútuo + connection.status ≥ apresentados**)
  - `staff_reveal_contact_for_match` (equipe autorizada do evento pode consultar antes para aproximar)
  - `staff_advance_connection` (staff avança status e registra histórico)
  - `list_event_profile_cards` (cartões profissionais públicos, sem contato/PII)
- **RLS**: leitura pública de `profiles` removida; INSERT/UPDATE anônimo em `matches`/`connections` removido; colunas `whatsapp` e `recovery_code` de `public.profiles` com grants revogados (só `service_role` lê).
- **Tabelas normalizadas**: `profile_offers`, `profile_needs`, `profile_segments`, `match_reasons`, `match_decisions`, `match_status_history`, `connection_status_history`, `event_staff`, `consents`, `ai_runs`, `analytics_events`, `audit_logs`, `taxonomy_items`. JSONB legado em `profiles.offers/needs` mantido temporariamente para compat; será removido na Fase 3.

## Primeiro admin (bootstrap seguro)

Nenhum e-mail, senha ou UUID é hardcoded no repositório. Para promover a conta que gerenciará o evento:

1. Crie a conta normalmente (via login por e-mail/senha assim que a rota `/equipe` de login estiver ativa **na Fase 2**, ou diretamente no painel do Supabase → Authentication → Users → Add user).
2. Abra o SQL Editor do Supabase e execute, substituindo `<email>` e `<event_id>` pelos valores reais (nunca commite este SQL preenchido):

   ```sql
   INSERT INTO public.event_staff (event_id, user_id, role)
   SELECT '<event_id>', u.id, 'admin'
   FROM auth.users u
   WHERE u.email = '<email>'
   ON CONFLICT DO NOTHING;
   ```

3. A partir daí, esse admin pode inserir demais membros via a rota `/admin` (Fase 2) ou repetindo o comando acima com `role = 'staff'`.

## O que fica para a Fase 2

- Login e proteção de `/equipe` e `/admin` com e-mail + senha (`supabase.auth.signInWithPassword`).
- Tela de admin para gerenciar `event_staff` do próprio evento.
- Card de match no `/participante` chamando `reveal_contact_for_match` (hoje o contato ainda não é exibido no cliente pois `whatsapp` foi removido do payload público).
- Tela de rotação/exibição-única do código de recuperação após a criação do perfil.
- Remoção definitiva de `profiles.whatsapp` e `profiles.recovery_code` (Fase 3, depois da adoção completa das RPCs).

## Desenvolvimento

```bash
bun install
bun run dev
```

O dev server sobe em `http://localhost:8080`. Migrations vivem em `supabase/migrations/`.

## Rascunho do wizard (Onda B)

- Chave única: `sudoexpo:wizard-draft:v2` (envelope `{ version: 2, savedAt, draft }`, expira em 24h).
- Chave legada `sudoexpo:draft` é removida automaticamente na primeira carga.
- O rascunho persiste APENAS dados profissionais: `step`, `name`, `company`, `city`, `neighborhood`, `segmentId`, `summary`, `offers`, `needs`, `consent`.
- Nunca vão ao localStorage: WhatsApp, e-mail, `userId`, `profileId`, código de recuperação, matches, decisões, contatos, tokens.
- Rascunho é apagado após conclusão bem-sucedida em `/participar`.

## Criação vs edição em `/participar`

- **Criação** (usuário sem perfil): WhatsApp obrigatório · consentimento obrigatório · máquina de submit executa perfil → contato → **código único** (`RecoveryCodeDialog`) → recompute de matches.
- **Edição** (usuário já tem perfil): banner "Você está editando seu perfil" · WhatsApp opcional (só chama `set_own_contact` se preenchido) · **não** rotaciona código automaticamente · máquina pula direto para recompute após salvar contato/perfil.
- **Conflito** rascunho + perfil existente: diálogo obriga escolha "Carregar meu perfil" (descarta rascunho) ou "Continuar rascunho" (mantém rascunho, mas segue em modo edição).
- Falhas parciais mantêm exatamente a etapa afetada com botão de retry dedicado ("Tentar salvar contato novamente", "Gerar código novamente", "Tentar buscar conexões novamente" + "Ir ao painel").
