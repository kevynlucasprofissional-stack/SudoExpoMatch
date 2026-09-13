# Liberar contato e concluir todos os matchs com interesse (ação única)

Ação pontual, feita uma única vez agora, sem mudar nenhuma regra do produto: todo match do SudoExpo 2026 que tenha interesse registrado por qualquer um dos dois lados terá o contato liberado para as duas pessoas e será contado como conexão concluída no painel público.

## Situação conferida no banco (SudoExpo 2026)

- 340 matchs têm interesse registrado por pelo menos um lado.
- Desses 340, apenas 30 já possuem conexão criada no sistema.
- Conexões existentes hoje: 34 apresentados, 4 contato trocado, 30 concluídas (68 no total).
- 11 duplas fora do sistema já estão registradas à parte e continuam somando no painel.

## O que será feito

1. Para os 310 matchs com interesse que ainda não têm conexão: criar a conexão do match.
2. Para todos os 340: marcar o contato como liberado para os dois lados (as duas pessoas passam a ver o WhatsApp uma da outra no painel delas, com o botão de abrir conversa).
3. Marcar todos os 340 como concluídos, preenchendo as datas de apresentação, troca de contato e conclusão quando estiverem vazias.
4. Registrar tudo no histórico e na auditoria como liberação e fechamento em lote pela administração, com a justificativa de que é uma ação única autorizada.

## Efeito no painel público

Depois da execução, as conexões concluídas do evento passam de 41 para 351 (340 do sistema + 11 registradas fora dele). As 4 duplas que estavam em "contato trocado" e as 34 em "apresentados" que tenham interesse registrado entram nessa conta; conexões sem nenhum interesse registrado não são alteradas.

## Observações

- Quem não tiver WhatsApp cadastrado simplesmente não terá número para exibir; a liberação e a conclusão acontecem do mesmo jeito, sem erro.
- Nada disso muda o comportamento futuro: o fluxo normal (interesse mútuo / liberação pela equipe) permanece exatamente como está, sem alteração de código.

## Detalhes técnicos

Uma única operação de dados (sem migração de schema, sem mudança de código):

- Conjunto-alvo: `matches m` do evento `sudoexpo-2026` com pelo menos um `match_decisions.decision = 'interesse'`.
- `INSERT INTO public.connections (match_id, event_id, a_profile_id, b_profile_id, status, ...)` para os matchs sem conexão, respeitando a unicidade por `match_id`.
- `UPDATE public.connections` do conjunto-alvo: `status = 'concluido'`, `contact_released_at = now()`, `contact_release_reason = 'Liberação em lote autorizada pela administração (ação única)'`, `contact_released_by` = usuário admin executor quando disponível, e `presented_at` / `contact_exchanged_at` / `completed_at` preenchidos via `COALESCE(..., now())`.
- Inserção em `public.connection_status_history` (`to_status = 'concluido'`) e `public.connection_events` (`action = 'admin_release_contact'` e `action = 'advance'`, `metadata` com `source: admin_batch`).
- `event_stats` já soma `offline_connections` em `total_connections`/`completed_connections`, então o painel público reflete o novo total sem ajustes.
- Verificação após a execução: contagem por status em `connections`, contagem de `contact_released_at` preenchido e leitura de `event_stats('sudoexpo-2026')`.
