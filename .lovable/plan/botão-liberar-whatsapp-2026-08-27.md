# Botão "Liberar WhatsApp"

Ação única, rápida, para o admin destravar o contato entre as duas pessoas de um match — disponível no detalhe do match em `/admin` e na fila de conexões em `/equipe`.

## Como vai funcionar

1. O admin abre o match (ou a conexão na central da equipe) e clica em **Liberar WhatsApp**.
2. Um diálogo confirma quem são as duas partes e pede uma justificativa curta quando ainda não há interesse mútuo ou apresentação presencial.
3. Ao confirmar:
   - A conexão do match é criada (se ainda não existir) e marcada como liberada, no status `apresentados`.
   - Os dois participantes passam a ver o WhatsApp um do outro no painel deles, imediatamente.
   - O admin recebe na tela os dois números com botões **Abrir WhatsApp** (links `wa.me`) e **Copiar número**, com feedback de "Copiado".
4. Tudo fica registrado em auditoria: quem liberou, quando, para qual match e com qual justificativa.
5. Se o contato já estiver liberado, o botão muda para **WhatsApp liberado** e mostra apenas os links de contato.

Regras de permissão: liberar sem interesse mútuo é exclusivo de admin. Staff comum continua com o fluxo atual de atendimento (apresentar → contato trocado) e só vê os links depois da apresentação.

Casos em que a liberação é bloqueada com mensagem clara: participante sem WhatsApp cadastrado ou com compartilhamento de contato desativado.

## Detalhes técnicos

Banco (migração aditiva):
- Nova RPC `admin_release_contact_for_match(_match_id uuid, _reason text default null)`, `SECURITY DEFINER`, restrita a admin do evento (`has_event_role(..., 'admin')`), que:
  - cria a `connections` do match quando ausente (mesma forma do fluxo de interesse mútuo, respeitando o lock de atribuição);
  - move o status para `apresentados` preenchendo `presented_at`, registrando em `connection_events` e `connection_status_history` a ação `admin_release_contact` com o motivo;
  - grava em `audit_logs`;
  - retorna os dois contatos (nome, empresa, `phone_e164`, e-mail).
- `reveal_contact_for_match` (lado participante) passa a aceitar o caso liberado por admin sem exigir interesse mútuo, mantendo as demais checagens (participante do match, contato existente, `contact_sharing_enabled`).
- `GRANT EXECUTE` da nova função apenas para `authenticated`; a checagem de papel é interna.

Frontend:
- `src/features/staff/useConnectionsQueue.ts`: novo hook `useReleaseWhatsApp` (mutation) chamando a nova RPC, com parse Zod dos contatos retornados.
- Novo componente compartilhado `src/features/connections/ReleaseWhatsAppDialog.tsx`: confirmação, campo de justificativa, lista dos dois contatos com `wa.me/<e164>` e copiar-número.
- `src/features/admin/MatchDetailSheet.tsx`: botão na aba Conexão (e no topo quando não há conexão), com estado "liberado".
- `src/routes/equipe.tsx`: botão na ficha da conexão, junto de "Revelar contatos", visível como liberação direta apenas para admin.
- Invalida as queries de fila/estatísticas e do detalhe do match após a liberação.

Testes:
- Prova SQL transacional: admin libera sem interesse mútuo → conexão criada, status `apresentados`, auditoria gravada, participante consegue revelar; não-admin recebe `forbidden`.
- Vitest para o hook, o diálogo (montagem do link `wa.me` e copiar) e os estados do botão.
