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
