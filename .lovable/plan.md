
## ENTREGA 1 — Descoberta automática de matches

**Migration única** (`recompute_on_save`), sem trigger por linha:

1. Cria função interna `public._recompute_matches_for_profile(p_profile_id uuid, p_event_id text) RETURNS int`
   - `SECURITY DEFINER`, `search_path=public`, sem `auth.uid()`.
   - Recebe o profile diretamente; reaproveita a mesma lógica hoje em `recompute_own_matches` (loop sobre outros perfis, pesos 55/25/10/5/3/2, upsert simétrico do par `matches` já preservando `is_active` de matches com conexão).
   - `REVOKE EXECUTE ... FROM anon, authenticated` — só chamável server-side / SECURITY DEFINER.
2. Refatora `public.recompute_own_matches(_event_id text)` para: validar `auth.uid()`, localizar o próprio perfil e delegar ao helper interno. Contrato de retorno (`int`) preservado.
3. No final de `save_own_profile_v2`, após persistir perfil/ofertas/necessidades/consent, chama `_recompute_matches_for_profile(v_id, v_event)` **na mesma transação**. Falha aborta o save (atomicidade). Retorno da RPC (`uuid`) permanece o mesmo — nenhum consumidor quebra. A contagem recalculada fica disponível via `recompute_own_matches` (usado só como recuperação manual).
4. `algorithm_version = 'v2.1'` preservado; auditoria mínima já ocorre em `matches.generated_at`/`updated_at`.
5. Simetria: como o loop hoje já grava `reasons_for_a` e `reasons_for_b` no par, quando B entra depois de A o cálculo de B **já popula ambas as perspectivas** — A vê o novo match ao consultar o painel sem recomputar.
6. Botão "Procurar/Recalcular" continua apenas como recuperação explícita.

**Testes** (`src/__tests__/entrega-1-auto-recompute.test.ts`):
- Contrato: `_recompute_matches_for_profile` sem execute para roles públicas (via `pg_proc`/`has_function_privilege`).
- Regressão: `record_match_decision_v2` / conexão preservada quando perfil re-salva.
Nota: testes de integração DB completos rodam via psql em script separado (existente); adiciono asserts contratuais nos schemas.

## ENTREGA 2 — A1/A2 via Lovable AI Gateway (com fallback)

**Dependências**: `bun add ai @ai-sdk/openai-compatible`.

**Server-side**:
- `src/lib/ai-gateway.server.ts` — helper `createLovableAiGatewayProvider` conforme knowledge, lê `process.env.LOVABLE_API_KEY` dentro do handler.
- `src/lib/onboarding-ai.functions.ts` — `suggestOnboardingItems = createServerFn({ method: "POST" })`:
  - Input Zod: `{ eventId, segmentId, summary (<=800 chars), existingLabels? (<=10, <=80 chars) }`. Zero PII.
  - Handler: `.middleware([requireSupabaseAuth])` para rate-limit por user; carrega catálogo do evento do banco (`list_event_segments_and_taxonomy`); rate-limit em memória (10 chamadas / 5 min por userId); cache LRU por hash `sha256(eventId+segmentId+summary+promptVersion+catalogVersion)`.
  - Modelo: `google/gemini-3.6-flash` (padrão do gateway). Prompt versão `a1a2-v1`. Timeout 12s + 1 retry.
  - Saída estruturada via `generateText({ output: Output.object(schema) })` com schema plano (sem enums grandes) — depois valida IDs contra o catálogo (drop se `id` inexistente/inativo/segmento errado/kind incompatível → `null`).
  - Registra em `ai_runs`: `run_kind='onboarding_suggest'`, model, latency, sucesso, `input={hash, segmentId, summaryLen}` (sem summary bruto), `output={items, understanding}`, `error` quando aplicável.
  - Em qualquer falha (timeout/402/429/schema inválido) → chama `heuristicSuggestionProvider` e retorna com `source: "heuristic"`.
- Nova migration mínima: grant `INSERT` em `ai_runs` para `service_role` (já ok) — confirmado que RLS bloqueia usuário; server fn usa `supabaseAdmin` para logar.

**Cliente/Wizard**:
- `src/features/onboarding/suggestions.ts` — mantém o provider heurístico como fallback e exporta novo `aiSuggestionProvider` que chama a server fn via `useServerFn`.
- `src/features/onboarding/steps.tsx` (step de ofertas/necessidades) — botão explícito "Analisar meu resumo com IA" (economiza créditos; opção documentada). Estados: idle / loading / result / error-silenciosa.
- Componente `AiSuggestionsPanel` mostra `understanding`, listas separadas de ofertas e necessidades, ações: aceitar (individual/todas), editar, ignorar. Itens aceitos entram em `draft` com `source:'ai'`; `user_confirmed=true` só após ação.
- Mensagem de fallback: "Usamos sugestões padrão desta vez." — sem detalhes técnicos.

**Contrato de saída** (validado com Zod):
```
{ understanding: { summary, mainActivity, keywords[], clarifyingQuestion? },
  offers: Suggestion[], needs: Suggestion[],
  source: "ai" | "heuristic", promptVersion: "a1a2-v1" }
```
Cada `Suggestion`: `{ taxonomyItemId: string|null, label, kind, confidence: 0..1, rationale }`.

**Testes** (`src/__tests__/entrega-2-ai.test.ts`):
- Schema aceita/rejeita corretamente (IDs inválidos → null).
- Normalização remove item com `kind='need'` fora do segmento correto.
- Mock do gateway: sucesso, timeout, 402, resposta malformada → fallback heurístico.
- Payload enviado ao gateway não contém `name/phone/email/whatsapp/recoveryCode`.
- Rate-limit: 11ª chamada em <5min do mesmo user cai para heurístico.
- Cache: 2 chamadas idênticas → 1 hit no gateway.
- Aceitar/ignorar/editar suggestion → estado do wizard correto (unit test do reducer/handler).

## Segurança / restrições
- `LOVABLE_API_KEY` só no servidor. Nunca `VITE_*`.
- Cliente **não** chama o gateway.
- `ai_runs` sem PII (só hash, len, structured output).
- Nenhuma notificação nova. Nenhum badge, toast fora do wizard, nada.
- Design system preservado (usa componentes shadcn atuais).

## Validação final
- `bunx vitest run` — suíte completa + novos testes.
- `bunx tsgo --noEmit`.
- `bun run build`.
- Smoke Playwright 390×844 do wizard (analisar → aceitar sugestão → salvar) + `/participante` após save mostra match sem clicar em "recalcular".

## Relatório entregue no final
- Commit SHA, migrations criadas, arquivos alterados, modelo (`google/gemini-3.6-flash`), como o fallback funciona, quando o recompute automático dispara (dentro de `save_own_profile_v2`), resultados dos testes, e nota de que `LOVABLE_API_KEY` já é provisionada automaticamente pelo Lovable — nenhum passo manual necessário.
