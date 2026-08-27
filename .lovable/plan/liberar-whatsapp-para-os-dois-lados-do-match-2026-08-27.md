# Liberar WhatsApp para os dois lados do match

Hoje o botão "Liberar WhatsApp" existe em `/admin` e `/equipe`, mas duas coisas limitam o resultado:

1. Só o admin consegue liberar (a equipe recebe erro de permissão).
2. O painel do participante ainda exige interesse mútuo para mostrar o contato. Quando o admin libera sem interesse mútuo, o participante não vê o telefone nem o link do WhatsApp.

Esta rodada resolve as duas coisas.

## O que muda

**Quem pode liberar**
- Admin e qualquer membro da equipe do evento passam a poder liberar o WhatsApp de um match.
- Continua registrado na auditoria quem liberou, quando e com qual justificativa.

**O que o participante passa a ver**
- Assim que a liberação acontece, o match aparece na área de conexões do participante mesmo sem interesse mútuo registrado, com o aviso de que a equipe liberou o contato.
- O botão "Ver contato" fica habilitado e, dentro dele, além do número e do "Copiar telefone", entra um botão destacado **"Abrir WhatsApp"** que abre a conversa direto no wa.me com a outra pessoa.
- Isso vale para os dois lados do match, não só para quem clicou.

**Equipe e admin**
- Nada muda no que já funciona: o diálogo de liberação continua mostrando os dois contatos com links wa.me para a equipe acionar na hora.
- O texto do diálogo passa a deixar claro que a liberação também abre o contato para os dois participantes.

## Detalhes técnicos

- `admin_release_contact_for_match`: liberar a chamada para `staff` além de `admin` (mantendo a checagem de vínculo com o evento) e manter o registro em `audit_logs` / `connection_events` com o papel do autor.
- `list_own_matches_v2`: incluir `contact_released_at` no objeto `connection` retornado ao participante.
- `reveal_contact_for_match`: já respeita a flag de liberação administrativa — sem mudança.
- Frontend participante:
  - `matchConnectionSchema` ganha `contact_released_at`.
  - `canRevealForMatch` passa a retornar `true` quando `contact_released_at` estiver preenchido, independentemente de interesse mútuo.
  - `filterActiveConnections` / `filterPendingConnections` incluem matches liberados pela equipe.
  - `revealDisabledHint` e `PARTICIPANT_STATUS_MESSAGE` ganham o texto do caso "liberado pela equipe".
  - `RevealContactDialog` ganha o botão "Abrir WhatsApp" (`wa.me`) abaixo da linha do telefone.
- Testes: atualizar as suítes de `presentation`, `ConnectionsList` e grants/RPC para o novo papel e o novo campo; prova SQL transacional cobrindo staff liberando e participante revelando sem interesse mútuo.
