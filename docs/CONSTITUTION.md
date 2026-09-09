# CONSTITUTION — SudoExpo Match (Quality-First)

## 1. Product Intent
O SudoExpo Match (ACIRV Connect) é uma plataforma de matchmaking profissional orientada a IA e regras determinísticas de negócio para eventos corporativos e feiras organizadas pela ACIRV.
O objetivo é conectar participantes (demandas e ofertas) com alta relevância de negócios durante o evento, garantindo governança total da equipe e privacidade dos participantes.

## 2. Non-Negotiable Principles (Playbook Quality-First)
1. **Estado Real > Narrativa**: Antes de qualquer decisão ou alteração, inspecione o código, banco e testes no commit/ref exato. Planos e chats são contexto; código e dados são evidência do presente.
2. **Descoberta precede Especificação**: Ideias e soluções fornecidas por usuários ou agentes são hipóteses até validação discriminatória.
3. **Isolamento Estrito entre Eventos (Event Partitioning)**:
   - Um participante de um evento nunca deve ser pareado com participantes de outro evento sem check-in explícito.
   - O histórico de contatos, matches, anotações e conexões de um evento nunca deve ser misturado ou sobrescrito por eventos futuros.
4. **Preservação de Dados Históricos**: Nenhuma migração deve apagar ou corromper dados reais do evento piloto ("Café Entre Amigos - Agosto 2026").
5. **Privacidade e LGPD**:
   - Telefones nunca são expostos em texto plano sem consentimento e ação de revelação ("reveal").
   - Hashes SHA-256 e normalização E.164 são obrigatórios em todas as fronteiras.
6. **Integridade Git e Lovable**:
   - Conforme `AGENTS.md`, o repositório é sincronizado com o Lovable.
   - NUNCA reescrever histórico git publicado (`force push`, `rebase/squash` de commits já enviados para origin).
   - Manter a branch `main` sempre em estado funcional e compilável.

## 3. Architectural Ownership Rules
- **Backend / Dados**: Supabase PostgreSQL (`public` schema para entidades, `private` schema para dados sensíveis e credenciais). Toda mutação privilegiada ocorre via RPCs `SECURITY DEFINER` com `search_path` fixo.
- **Frontend**: TanStack Start / React Router com Tailwind CSS e shadcn/ui.
- **Single Source of Truth**: O banco de dados (`public.events`, `public.profiles`, `public.matches`) governa a pertinência e status de cada participante.

## 4. Testing & Evidence Policy
- Toda task de implementação deve possuir critério de aceitação verificável antes da alteração.
- Seguir o ladder de evidência: Lint -> Typecheck -> Unit -> Integration -> Manual Inspection.
- Build verde não prova comportamento por si só: testar contratos e fluxos reais.
