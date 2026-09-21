# Documento único com toda a base de dados do SudoExpo Match

Gerar **um arquivo JSON** com absolutamente todos os dados do sistema — todos os eventos, com contatos reais incluídos.

## O que entra no arquivo

**Dados públicos (25 tabelas):** eventos, segmentos, participantes (perfis), o que cada um oferece e procura, taxonomia e relações curadas, matches com scores e justificativas, decisões, conexões e todo o histórico, briefings de match, equipe, consentimentos, conexões registradas fora do sistema, logs de auditoria, eventos de analytics e execuções de IA.

**Dados protegidos (8 tabelas do schema privado):** contatos completos dos 133 participantes (WhatsApp/telefone), perfis sociais vinculados, cache de análise do Instagram (115 registros, com o conteúdo bruto vindo da API e a análise de IA), cache de onboarding por IA (358 registros), contadores de uso de IA e tentativas de login.

**Painel de inteligência:** os números do painel são calculados a partir dessas mesmas tabelas. Como o arquivo traz todas as linhas de origem, o painel é integralmente reproduzível a partir dele. Não há tabela separada de "relatórios" — os relatórios de IA persistidos são os briefings de match e o histórico de execuções de IA, ambos incluídos.

## Estrutura do arquivo

```text
{
  "gerado_em": "...",
  "escopo": "todos os eventos",
  "contem_dados_pessoais": true,
  "tabelas": {
    "public.events": { "linhas": 2, "dados": [ ... ] },
    "public.profiles": { "linhas": 133, "dados": [ ... ] },
    ...
    "private.profile_contacts": { "linhas": 133, "dados": [ ... ] }
  },
  "resumo": { "total_de_tabelas": 33, "total_de_linhas": ... }
}
```

Cada tabela aparece com todas as colunas originais, sem renomear, sem anonimizar e sem cortar linhas.

## Aviso importante

O arquivo conterá telefones reais e o conteúdo bruto raspado do Instagram. É um documento **altamente sensível sob a LGPD**: uso restrito seu, não deve ser compartilhado nem versionado no projeto. Ele vai apenas para os seus Arquivos, não para o código do app.

Nenhuma chave, senha ou segredo do sistema entra no arquivo.

## Detalhes técnicos

- Exportação linha a linha por tabela usando `json_agg`, sem alterar nada no banco (somente leitura).
- Tabelas do schema `public` exportadas via `psql`; tabelas do schema `private` via a ferramenta de leitura do Cloud (o papel do `psql` não tem acesso a `private`), em lotes paginados para tabelas acima de 1000 linhas.
- Montagem final do JSON único em `/tmp` e cópia do resultado para `/mnt/documents/sudoexpo-match-base-completa.json`.
- Verificação pós-geração: contagem de linhas por tabela no arquivo comparada com `count(*)` no banco, mais checagem de que o JSON é válido e de que nenhuma tabela ficou vazia por erro de permissão. Relato do tamanho final e de qualquer tabela que não tenha podido ser lida.
- Nenhum arquivo do projeto é criado ou alterado.
