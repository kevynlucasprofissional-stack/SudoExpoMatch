# Engineering Journal — CURRENT

## Status Atual
- **Ciclo**: Governança do Matcher v2.4 e ativação segura da taxonomia
- **Data**: 2026-09-09
- **Branch**: `feat/matcher-taxonomy-governance`

### H-001 — O modelo relacional existente já suporta particionamento por `event_id` nativamente?
- **Status**: VALIDADA
- **Claim**: O banco já possui `event_id` nas entidades transacionais centrais e o matcher restringe candidatos ao mesmo evento.
- **Evidência**: schema/migrations + `_recompute_matches_for_profile`.
- **Implicação**: separação lógica por evento é suficiente; não é necessário banco físico por edição.

### H-002 — É possível separar o Café Entre Amigos da SudoExpo sem perder histórico?
- **Status**: VALIDADA E IMPLEMENTADA
- **Claim**: evento histórico próprio + migração transacional preservam o piloto enquanto `sudoexpo-2026` recebe apenas participantes legítimos/check-ins.
- **Evidência**: `20260909155500_multi_eventos_separacao_e_checkin.sql`.

### H-003 — Veteranos conseguem entrar no evento atual sem recadastro completo?
- **Status**: VALIDADA E IMPLEMENTADA
- **Evidência**: fluxo de lookup/check-in por telefone, `PhoneLoginCard.tsx`, RPCs de check-in e testes multi-eventos.

### H-004 — O admin consegue alternar contexto de evento?
- **Status**: VALIDADA, COM BUG PONTUAL CORRIGIDO NESTA BRANCH
- **Claim**: `AdminEventContext`/`EventSelector` cobrem as telas principais, mas `/admin/taxonomia` ainda passava `EVENT_ID` fixo ao `TaxonomyItemSheet`.
- **Evidência**: `src/routes/admin_.taxonomia.tsx`.
- **Correção**: detalhe e mutações da taxonomia agora recebem `selectedEventId`.

### H-005 — Alterar taxonomia atualiza automaticamente matches já persistidos?
- **Status**: REFUTADA NO ESTADO ANTERIOR; MITIGAÇÃO IMPLEMENTADA NESTA BRANCH
- **Claim testada**: criar/editar/desativar item, sinônimo ou relação deveria alterar imediatamente os snapshots existentes.
- **Evidência**: RPCs administrativas de taxonomia não chamavam `_recompute_matches_for_profile`; os próprios testes de relação precisavam recomputar manualmente para observar o novo score.
- **Risco**: scores/reasons antigos poderiam permanecer ativos depois de uma mudança semântica.
- **Implementação**: revisão global de taxonomia + revisão aplicada por evento + status `dirty` + RPC de rebuild completo + auditoria.
- **Prova esperada**: `scripts/matcher-taxonomy-governance-proof.sql`.
- **Validação pendente**: executar contra PostgreSQL/Supabase real antes do merge final.

### H-006 — “Relação complementar” representa apenas uma associação genérica A ↔ B?
- **Status**: REFUTADA
- **Claim correta**: a relação é dirigida e significa `NECESSIDADE (from) → OFERTA (to)`.
- **Evidência**: joins de `taxonomy_relations` dentro do matcher v2.4.
- **Risco UX anterior**: textos “este item complementa o outro” permitiam cadastrar a seta invertida sem perceber.
- **Correção**: formulário e detalhe agora mostram explicitamente “PRECISA DE → OFERECE” e avisam que o inverso precisa ser cadastrado separadamente.

### H-007 — O `+5` chamado de complementaridade usa a taxonomia?
- **Status**: REFUTADA
- **Claim correta**: o `+5` é apenas `segment_id` diferente + overlap comercial direto.
- **Implicação**: documentação/UI nova deve chamar isso de **conexão entre segmentos**, reservando “relação taxonômica complementar” ao grafo curado de até +30.

### H-008 — O matcher possui similaridade semântica genérica entre textos?
- **Status**: REFUTADA
- **Evidência**: `taxonomy_match()` usa identidade canônica, igualdade normalizada, sinônimos explícitos e contenção com fronteira de palavra; não há embedding/LLM/cosine/fuzzy score no core.
- **Implicação**: inteligência semântica deve permanecer principalmente no onboarding/canonicalização; o matcher SQL segue determinístico e auditável.

### H-009 — A taxonomia estava efetivamente explorando sinônimos e grafo complementar no snapshot auditado?
- **Status**: REFUTADA
- **Evidência**: `supabase/seed/config-export.sql` de 04/09/2026 tinha 44 itens, todos `kind=both`, sinônimos vazios e zero relações complementares.
- **Implicação**: o próximo ganho de qualidade depende mais de cobertura/curação do conhecimento do que de reescrever o algoritmo.

### H-010 — É seguro alterar pesos/labels/assimetria agora sem decisão de produto?
- **Status**: NÃO VALIDADA; MANTER COMO DECISÃO PENDENTE
- **Motivo**: o matcher sobrepõe oportunidade comercial e networking por perfil-alvo; mudanças em score podem alterar semântica, operação e comparabilidade histórica.
- **Decisão provisória**: não mudar scoring silenciosamente. Qualquer alteração relevante deve versionar o algoritmo (ex.: v2.5), possuir matriz de cenários e evidência em dados reais.

### H-011 — A falha `duplicate_need_label` do incidente de cadastro de 09/09/2026 vinha de divergência de normalização entre front e banco?
- **Status**: CONFIRMADA
- **Evidência**: o banco compara com `public.norm_label` (minúsculas, sem acentos, espaços colapsados); os caminhos de adição em `steps.tsx` e o `mergeCapped` comparavam só por `toLowerCase()`. `validateWizardForSubmit` e `mapWizardToSaveProfileInput` não checavam duplicidade, então o erro só surgia na RPC final.
- **Implicação**: identidade canônica única (`itemIdentity`) aplicada a todos os caminhos de entrada e às defesas de fronteira, sem alterar o check do banco, pesos ou matcher. Detalhes em `docs/incidents/2026-09-09-onboarding-duplicate-item.md`.

### H-012 — Texto livre e item de catálogo podem convergir para o mesmo label?
- **Status**: CONFIRMADA
- **Evidência**: existe perfil real com necessidade de texto livre cujo label coincide com item ativo do catálogo, mas com `taxonomy_item_id` nulo. O catálogo ativo, por si só, não tem colisões internas por `norm_label`.
- **Implicação**: a equivalência de itens precisa considerar label normalizado além do id; a canonicalização automática de texto livre fica como melhoria separada por afetar o matcher.

### H-013 — É possível dar ao participante uma leitura de IA da conexão sem expor a visão interna do match?
- **Status**: CONFIRMADA
- **Evidência**: `match_briefings` guarda `sides.{a,b}`, `risks` e `evidence`; a projeção por perspectiva em `list_own_matches_v2` entrega apenas `summary`, `my_side`, `evidence`, `approach` e frescor, e o schema Zod do cliente descarta qualquer chave extra vinda do banco.
- **Implicação**: o briefing do participante e o briefing do admin podem compartilhar a mesma tabela e o mesmo gerador, desde que a projeção segura seja feita no banco e revalidada no schema de entrada.

### H-014 — Limitar a geração de IA ao Top 3 exige reordenar a lista do participante?
- **Status**: CORRIGIDA (a premissa original estava ERRADA)
- **Premissa refutada pela auditoria**: assumiu-se que a lista exibida seguia `score_me DESC, generated_at DESC, match_id`. Não seguia: a UI ordena por `sortMatchesByMutualInterest` (tiers de sinergia mútua, menor assimetria, `agora_nao` ao final).
- **Consequência do erro**: o Top 3 autorizado no banco podia ser um conjunto diferente do Top 3 exibido; e marcar `isTopThree` por índice fazia os 3 primeiros da aba filtrada "Interesses" parecerem Top 3.
- **Correção (14/09/2026)**: `public._participant_match_rank` foi reescrita para reproduzir EXATAMENTE a ordenação da UI (dismissed → tier → gap → soma → score_me → score_other → id) e `compareMatchesForRanking` ganhou desempate final por `match_id`. SQL e TypeScript passaram a compartilhar a mesma semântica, com teste de equivalência por fixtures. O Top 3 é resolvido por `resolveTopThreeMatchIds` na rota do participante e propagado por `match_id`.

### H-015 — Achados da auditoria externa da primeira versão da IMPL 31
- **Status**: CONFIRMADOS e CORRIGIDOS
- **Achado 1 (crítico)**: a migration inicial concedeu `EXECUTE` a `authenticated` em `participant_get_match_dossier` e `participant_save_match_briefing`, permitindo que um participante autenticado sobrescrevesse o briefing oficial com payload arbitrário. **Correção**: nova migration revoga `PUBLIC`/`anon`/`authenticated` dessas RPCs (e de `_participant_match_rank`), deixando-as service-role-only, e cria as pontes server-only `service_participant_briefing_context` / `service_participant_save_briefing` com `_actor_user_id` explícito e revalidação completa (match ativo, evento correto, dono de uma ponta, Top 3 canônico). O participante só grava passando pela server function autenticada.
- **Achado 2 (crítico)**: divergência de Top 3 entre banco e tela — ver H-014.
- **Nota histórica**: os dois achados existiram em produção entre 14/09/2026 (primeira versão) e a correção do mesmo dia. Registro mantido de propósito: correção histórica não se esconde.
