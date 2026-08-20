# ACIRV Connect — estado atual

Este arquivo descreve o que **existe hoje** no código. Roadmaps antigos foram removidos:
as fases descritas neles já estão implementadas.

## Entregue

- **Banco**: schema normalizado (perfis, ofertas, necessidades, segmentos, taxonomia,
  relações complementares, matches, motivos, decisões, conexões, histórico, auditoria,
  analytics, `ai_runs`), RLS estrita, grants explícitos e mutações apenas por RPC
  `SECURITY DEFINER`. PII de contato e recuperação no schema `private`.
- **Matcher v2.3** no Postgres, com pesos 55/25/10/5/3/2, rótulo por perspectiva
  (alta ≥75 · boa ≥40 · possível <40) e `match_reasons` explicáveis por lado.
- **Descoberta automática e simétrica** de matches: `save_own_profile_v2` chama
  `_recompute_matches_for_profile` na mesma transação; o botão de recalcular é só recuperação.
- **Complementaridade real** via `taxonomy_relations`, editável em `/admin/taxonomia`.
- **Taxonomia** com segmento por item (autoridade do item) e `needKind` propagado do wizard
  até as explicações.
- **IA A1/A2** via Lovable AI Gateway em server function, cross-segment, saída Zod, cache,
  rate limit, concorrência controlada, logs sem PII e fallback heurístico.
- **Telas**: `/`, `/como-funciona`, `/participar`, `/participante`, `/publico`, `/equipe`,
  `/admin`, `/admin/participantes`, `/admin/matches`, `/admin/taxonomia`.
- **Operação**: fila de conexões com atribuição atômica, máquina de estados linear, notas,
  revelação auditada de contato, pins de mapa físico e registro de resultados comerciais.
- **Analytics** agregado e sem PII (funil de onboarding, matches, conexões).
- **Configuração do evento** centralizada em `src/config/event.ts` (single-event).

## Decisões firmes

- **Sem notificações** de qualquer tipo (push, e-mail, SMS, WhatsApp automático).
- Sem store local ou catálogo mockado: a fonte de verdade é sempre o banco.
- Sem credenciais em código ou migrations; provisionamento do primeiro admin documentado
  no README e feito fora do repositório.
- `src/testing/matching-spec.ts` é espelho de especificação **apenas para testes**, com
  guarda estática impedindo uso em produção.

## Validação

`npm run test` · `npm run typecheck` · `npm run build` · `npm run lint`.
Provas SQL manuais em `scripts/*.sql`.
