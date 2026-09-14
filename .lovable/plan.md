# Graph View no Admin (estilo Obsidian)

Nova tela `/admin/graph`: um mapa de rede do evento onde cada bolinha é um participante e cada linha é um match ativo encontrado pelo matcher. As cores das linhas mostram o estado do interesse:

- verde `#27e300` — exatamente um dos dois marcou "tenho interesse"
- azul `#1b26ae` — nenhum dos dois decidiu ainda
- laranja `#ff7c31` — os dois marcaram interesse (mútuo)
- cinza discreto (novo, `#6b7280` em baixa opacidade) — casos em que houve decisão mas nenhum interesse (ex.: "agora não" de um ou dos dois lados, "sem decisão" explícito). Sem essa quarta cor, uma dupla recusada apareceria pintada como "ninguém decidiu", o que é enganoso. Fica desligável por filtro.

Volume atual confirmado no banco do SudoExpo 2026: 2.540 matches ativos e 128 participantes com match. Isso é pequeno para um grafo — roda liso no navegador sem paginação.

## Comportamento da tela

- Área de grafo em tela cheia, com zoom, arrastar e destaque de vizinhos ao passar o mouse (nó apagado quando não é vizinho, como no Obsidian).
- Tamanho do nó = número de matches da pessoa; cor do nó = segmento.
- Clique no nó: abre o painel de detalhe do participante já existente (mesmo componente de `/admin/participantes`), com atalho "ver matches desta pessoa" que navega para `/admin/matches` já filtrado pelo nome.
- Clique na aresta: abre o painel de detalhe do match já existente (mesmo componente de `/admin/matches`), com briefing, razões e ações administrativas.
- Filtros no topo, todos refletidos na URL: estado de interesse (as 4 cores), score mínimo, segmentos, busca por nome/empresa, "só duplas com conexão", "só revisados". Ao filtrar, os nós que ficam sem nenhuma aresta são ocultados (com opção de mostrar isolados).
- Respeita o evento selecionado no seletor do admin (multi-evento já existente): trocar o evento recarrega o grafo.

## Biblioteca recomendada

Recomendação: **react-force-graph-2d** (canvas + d3-force).

| Opção | Prós | Contras | Veredito |
| --- | --- | --- | --- |
| react-force-graph-2d | API React nativa, canvas, layout de força igual ao Obsidian, ~2,5k arestas trivial, desenho customizado de nó/aresta simples, hover/click prontos | menos recursos de análise de grafo | **escolhida** |
| Cytoscape.js | ecossistema grande, layouts e algoritmos ricos | não é React (wrapper imperativo), estética menos "Obsidian", bundle maior, mais código de ciclo de vida | descartada |
| Sigma.js + Graphology | melhor performance em escala (WebGL, 100k+) e modelo de dados sólido | complexidade bem maior, curva de renderização customizada, ganho inútil nesta escala | reavaliar só se passarmos de ~20k arestas |

## Dados: uma RPC nova, dedicada

Reaproveitar `admin_list_matches` seria errado: ela é paginada, pesada por linha (briefing, razões, cidades) e ordenada para lista. O grafo precisa de um payload magro e completo.

Nova função `public.admin_match_graph(_event_id text, filtros...)` com `SECURITY DEFINER`, autorizada por `has_any_event_role` (mesmo padrão das demais RPCs admin/staff), retornando um único JSON:

- `nodes`: `profile_id`, `name`, `company`, `segment_id`, `segment_label`, `degree`
- `edges`: `match_id`, `a_profile_id`, `b_profile_id`, `score_for_a`, `score_for_b`, `decision_a`, `decision_b`, `interest_state` (`mutual` | `single` | `none` | `declined`), `connection_status`, `reviewed`, `has_briefing`
- `meta`: totais por estado, para as legendas

Nenhum dado de contato trafega (mesma regra dos schemas atuais, coberta pelo teste de `hasPrivateKey`). Payload estimado: ~450 KB, uma única requisição, cache de 30s no TanStack Query.

## Arquivos

Adicionados:

- `supabase/migrations/<timestamp>_admin_match_graph.sql` — RPC + grants
- `src/routes/admin_.graph.tsx` — rota, filtros na URL, head próprio (noindex)
- `src/features/admin/graphSchemas.ts` — contratos Zod (nodes/edges/meta)
- `src/features/admin/graphUrlState.ts` — normalização dos filtros na URL
- `src/features/admin/useAdminMatchGraph.ts` — hook de query + chave de cache por evento/filtros
- `src/features/admin/MatchGraphCanvas.tsx` — componente do grafo (carregado só no cliente)
- `src/features/admin/graphPresentation.ts` — puro: cor da aresta, tamanho do nó, derivação de `interest_state`, filtragem em memória
- `src/__tests__/impl27-admin-graph.test.ts` — testes

Alterados:

- `src/routes/admin.tsx` — link "Mapa de conexões" na navegação do admin
- `src/features/admin/MatchDetailSheet.tsx` e `ParticipantDetailSheet.tsx` — abertura controlada por props, para serem reutilizados pelo grafo (sem mudar o comportamento nas telas atuais)
- `docs/CURRENT_STATE.md`, `docs/roadmap.md`, `docs/specs/` — registro da feature
- `package.json` — dependências `react-force-graph-2d` e `d3-force`

## Notas técnicas

- A biblioteca usa canvas e mede o DOM: importar dentro de `<ClientOnly>` com `React.lazy`, nunca import estático numa rota com SSR.
- Lógica de cor/estado fica em `graphPresentation.ts` (puro, testável sem canvas); o componente só desenha.
- `interest_state` é derivado no SQL a partir de `match_decisions` (fonte autoritativa), não da coluna legada `matches.label`; `agora_nao` e `sem_decisao` nunca contam como interesse.
- Só `matches.is_active = true` e do `event_id` selecionado — o isolamento por evento é mantido no `WHERE` da RPC, não no cliente.
- Nada do matcher, pesos, taxonomia ou dados de produção é alterado: a feature é somente leitura sobre o que já existe.
- Testes: derivação das 4 cores incluindo `agora_nao`/`sem_decisao`, ausência de campos privados no payload, filtros produzindo o subgrafo esperado, isolamento por evento, e navegação nó→participante / aresta→match.
- Verificação: `npm run typecheck`, a suíte Vitest e prova SQL da nova RPC em `scripts/`.
