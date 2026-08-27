# Briefing do match: "por que aprovar esta conexão"

Hoje o painel `/admin/matches` mostra números (score A/B, assimetria, tipo, versão) mas não conta a história. A equipe precisa bater o olho e entender, em linguagem comercial, por que vale a pena juntar aquelas duas pessoas — usando tudo que já temos: cadastro, ofertas, necessidades, "quem eu procuro", segmento, cidade e o contexto extraído do Instagram.

## O que muda na prática

**No card da lista** — uma linha nova, sempre visível, com o "porquê" resumido:

```text
Vólus  ×  Clube Campestre
Score 30 / 90 · direto · assimetria 60
» Clube Campestre procura gestão de eventos corporativos e Vólus
  oferece exatamente isso. Ambos em Rio Verde. Instagram do Clube
  posta sobre eventos há 2 semanas.
[ Sinais: oferta↔necessidade · mesma cidade · Instagram ativo ]
```

**Ao abrir o match** — um bloco "Por que conectar" no topo do painel lateral, antes dos detalhes técnicos, com:

- **Resumo em uma frase** do encaixe comercial.
- **A ganha com B / B ganha com A** — duas colunas, cada uma listando os ganhos concretos daquele lado (necessidade atendida, oferta demandada, perfil desejado batendo).
- **Evidências** — cada item citando a origem: `cadastro`, `IA do onboarding`, `Instagram (@handle, post de 3 semanas atrás)`.
- **Pontos de atenção** — assimetria alta, um lado sem necessidades cadastradas, Instagram desatualizado, dados fracos. Serve para a equipe não apresentar um match frouxo como se fosse forte.
- **Sugestão de abordagem** — uma frase que a equipe pode literalmente falar ao apresentar as duas pessoas no evento.

**Botão "Gerar leitura comercial com IA"** — o resumo determinístico aparece sempre e de graça; a leitura narrativa da IA é gerada sob demanda por match, salva no banco e reaproveitada (com data de geração e botão de regenerar). Também dá para gerar em lote os matches ainda não revisados da página atual.

## Como o resumo é montado

Duas camadas:

1. **Camada determinística (sempre presente, instantânea)** — construída a partir de `match_reasons` (que já guarda por perspectiva o código, o peso, a necessidade e a oferta envolvidas, e a relação de taxonomia), mais os campos de perfil dos dois lados. Cada código do matcher vira uma frase legível:
   - `outro_oferece_o_que_procuro` → "B oferece **X**, que A listou como necessidade"
   - `outro_procura_o_que_ofereco` → "B procura **Y**, que A oferece"
   - `perfil_desejado` / `perfil_desejado_mutuo` → "A procura exatamente o perfil de B (porte, tipo, segmento)"
   - `complementaridade` → "atividades complementares via taxonomia: **X → Y**"
   - `prioridade`, `atualidade`, `proximidade` → prioridade declarada, cadastro recente, mesma cidade/bairro
   Isso é 100% auditável e não depende de IA.

2. **Camada IA (sob demanda, cacheada)** — recebe um dossiê estruturado dos dois lados (perfil, ofertas, necessidades, alvo desejado, resumo do cadastro, bio/temas/posts recentes do Instagram já persistidos no cache social) e devolve, em JSON validado: resumo de uma frase, ganhos de cada lado, evidências com origem, riscos e frase de abordagem. Só usa Instagram quando há dado real e ele é citado explicitamente como evidência ("posta sobre X há N semanas"), nunca inventado.

## Detalhes técnicos

**Banco**
- Nova tabela `match_briefings` (1 por match): `match_id`, `event_id`, `summary`, `sides` (jsonb com ganhos por perspectiva), `evidence` (jsonb), `risks` (jsonb), `approach`, `source` (`ai`), `model`, `inputs_fingerprint`, `generated_by`, `generated_at`. GRANTs + RLS restritos a staff/admin do evento (leitura) e escrita só pela RPC.
- `admin_list_matches` passa a devolver, por linha, um `why` compacto derivado das `match_reasons` (top 2 sinais por lado) + `has_briefing`/`briefing_summary` quando existir.
- `admin_get_match_detail` passa a devolver o briefing salvo, se houver, e os campos de perfil hoje ausentes (`business_size`, `business_type`, `niche`, `target_*`) para alimentar a explicação.
- Nova RPC `admin_save_match_briefing` (admin/staff do evento) para persistir o resultado da IA e registrar em `audit_logs`.
- `inputs_fingerprint` marca o briefing como "desatualizado" quando perfis/reasons mudaram após a geração.

**Frontend**
- `src/features/admin/matchExplanation.ts` — tradutor puro dos códigos de reason em frases pt-BR, montagem do resumo do card e dos sinais (com testes unitários).
- `src/features/admin/MatchBriefingPanel.tsx` — bloco "Por que conectar" no `MatchDetailSheet`, com estados: sem IA (só determinístico), gerando, gerado, desatualizado.
- `src/features/admin/matchesSchemas.ts` — novos campos e schema Zod do briefing.
- `src/routes/admin_.matches.tsx` — linha de explicação + chips de sinais no card, e filtro extra "com/sem briefing".

**IA**
- Server function `src/lib/match-briefing.functions.ts` chamando o Lovable AI Gateway (`google/gemini-3.7-flash`, structured output com schema estrito), montando o dossiê server-side a partir do Supabase (perfis, ofertas, necessidades, reasons, cache social), com sanitização anti-prompt-injection do conteúdo vindo do Instagram e registro em `ai_runs`.
- Erros do gateway tratados por status (429/5xx com backoff; 402/403 terminais com mensagem clara na UI).

**Testes**
- Unitários do tradutor determinístico (todos os códigos de reason, incluindo casos sem oferta/necessidade vinculada).
- Teste do schema do briefing e do fallback quando a IA falha.
- Verificação de que nenhum dado de contato (telefone/e-mail) entra no briefing.
