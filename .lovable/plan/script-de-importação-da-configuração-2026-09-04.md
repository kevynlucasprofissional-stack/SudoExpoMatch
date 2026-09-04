# Script de importação da configuração

Gerar um arquivo SQL pronto para rodar no outro ambiente, recriando exatamente a configuração exportada (mesmos IDs, slugs e vínculos).

## O que o script vai conter

1. **Evento** — a linha do SudoExpo 2026 (id, nome, cidade, datas, ativo).
2. **Segmentos** — as 14 categorias, com emoji, ordem e a marcação de quais podem ser escolhidas no cadastro.
3. **Itens de taxonomia** — os 44 itens, cada um ligado ao seu segmento, com slug, rótulo, tipo, sinônimos e situação ativa.
4. **Relações de taxonomia** — hoje vazio; o bloco fica no script, comentado, pronto para quando existirem relações.
5. **Equipe** — bloco opcional e separado, no fim do arquivo, com apenas o papel de administrador. Vem comentado por padrão, porque só funciona se a mesma conta de usuário já existir no ambiente de destino.

## Como o script se comporta

- Roda dentro de uma transação: ou entra tudo, ou nada.
- Reexecutável: se um registro já existir com o mesmo identificador, ele é atualizado em vez de dar erro.
- A ordem respeita as dependências: evento → segmentos → itens → relações → equipe.
- Nenhum dado de participante, contato, telefone, match, conexão, log ou chave é incluído.

## Onde o arquivo fica

`supabase/seed/config-export.sql`, dentro do projeto, para você copiar ou versionar. Também mostro o conteúdo no chat.

## Detalhes técnicos

- Statements `INSERT ... ON CONFLICT (id) DO UPDATE` para cada tabela, com todas as colunas preservadas (incluindo `created_at`/`updated_at` originais).
- `synonyms` emitido como literal `text[]`; `description` e demais nulos preservados.
- Bloco `event_staff` com `ON CONFLICT DO NOTHING`, comentado, mais uma nota explicando a dependência de `auth.users`.
- O arquivo é apenas um artefato de exportação: não é aplicado neste projeto nem entra no fluxo de migrações daqui.
