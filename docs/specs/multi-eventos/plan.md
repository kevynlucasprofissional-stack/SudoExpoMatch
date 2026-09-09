# PLAN / DESIGN: Arquitetura Multi-Eventos e Isolamento

## 1. Spec de Origem
- `docs/specs/multi-eventos/spec.md`

## 2. Resumo da Abordagem
A solução adota o modelo **Multi-Tenant Lógico Nativo** (já suportado pelas colunas `event_id` no PostgreSQL).
1. Criamos a migration de separação histórica:
   - Cadastra `cafe-entre-amigos-ago-2026` em `public.events`.
   - Remaneja os participantes, contatos, ofertas, necessidades e matches do piloto para `cafe-entre-amigos-ago-2026`.
   - Deixa `sudoexpo-2026` como evento ativo limpo e pronto.
2. Criamos as RPCs de Lookup e Check-in:
   - `lookup_participant_multi_event(_phone_e164 text)`: busca se o telefone existe no evento atual ou em algum evento anterior.
   - `participant_checkin_to_event(_target_event_id text, _source_profile_id uuid)`: copia os dados cadastrais (nome, empresa, cargo/nicho, segmento, ofertas, necessidades) para o novo evento, gera os contatos protegidos e roda o algoritmo de matchmaking imediatamente.
3. Atualizamos a camada de Front-End:
   - Em `/`, `/participar` e cards de login: se o usuário já tem cadastro no Café, exibe um diálogo elegante de boas-vindas com botão "Fazer Check-in na SudoExpo 2026".
   - No Admin (`/admin`, `/admin/participantes`, `/admin/matches`):
     - Adiciona um `EventContext` / seletor de evento ativo.
     - Permite filtrar participantes por "Todos os Eventos", "SudoExpo 2026", "Café Entre Amigos".
     - Adiciona ação de botão no painel: "Check-in na SudoExpo".

## 3. Arquitetura e Modelagem
```
+-------------------------------------------------------------------------+
|                              PUBLIC.EVENTS                              |
| id: 'cafe-entre-amigos-ago-2026' | id: 'sudoexpo-2026' (active: true)   |
+-------------------------------------------------------------------------+
             |                                          |
             v                                          v
+-----------------------------+            +-----------------------------+
|    CAFÉ ENTRE AMIGOS        |            |        SUDOEXPO 2026        |
| - Perfis históricos         |            | - Novos inscritos SudoExpo  |
| - Matches do Café           |            | - Veteranos com Check-in    |
| - Conexões passadas         |            | - Matches exclusivos Sudo   |
+-----------------------------+            +-----------------------------+
             ^                                          ^
             |============ [ CHECK-IN ] ===============|
             (Reutiliza dados sem redigitar do zero)
```

## 4. Estratégia de Migração e Rollback
- **Migration SQL**:
  - Inserção de `cafe-entre-amigos-ago-2026`.
  - Migração condicional (se os dados do piloto estiverem atualmente em `sudoexpo-2026`).
- **Rollback**:
  - Temos o backup completo no GitHub: branch `backup-pre-multi-eventos-20260909` e tag `backup-pre-multi-eventos`.
  - Scripts SQL com capacidade de rollback reverso se necessário.

## 5. Estratégia de Validação
- **Verificação no Banco**:
  - Provar que `SELECT COUNT(*) FROM profiles WHERE event_id = 'cafe-entre-amigos-ago-2026'` reflete a base do piloto.
  - Provar que `SELECT COUNT(*) FROM profiles WHERE event_id = 'sudoexpo-2026'` não contém pessoas não checadas.
  - Provar que `_recompute_matches_for_profile` na SudoExpo só gera pares dentro do próprio evento.
- **Verificação de Interface**:
  - Testar o fluxo de onboarding com número inédito (criação direta em SudoExpo).
  - Testar com número do Café (alerta de veterano -> check-in com 1 clique).
  - Testar filtros no `/admin/participantes`.
