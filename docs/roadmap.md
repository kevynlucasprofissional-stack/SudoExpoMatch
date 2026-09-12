# ROADMAP — SudoExpo Match

> **Método:** Quality-First. Uma etapa só é concluída quando código, evidência, não-regressão, mensuração e documentação estão sincronizados.
>
> **Atualizado em:** 12/09/2026, após auditoria de produto, UX, operação, matcher, taxonomia, analytics, multi-eventos e fluxo administrativo.
>
> **Objetivo:** transformar o SudoExpo Match de um sistema que gera recomendações em um sistema que aprende continuamente quais conexões realmente valem o tempo dos participantes e da equipe ACIRV.

---

# 0. Princípios de evolução

O próximo salto do produto não deve vir de adicionar funcionalidades indiscriminadamente. Deve vir de reduzir três tipos de incerteza:

1. **Participante:** “qual é a melhor conexão para mim agora?”
2. **Operador:** “qual é a próxima ação que devo executar?”
3. **Produto:** “onde está o gargalo que impede uma conexão de virar valor real?”

Princípios obrigatórios:

- estado real > narrativa;
- integridade e isolamento entre eventos > conveniência;
- outcomes reais > quantidade de matches;
- exposição real > card apenas carregado;
- evidência comercial verificável > copy persuasiva;
- automação deve reduzir trabalho sem esconder causalidade;
- IA deve gerar candidatos, explicações e síntese; decisões críticas continuam auditáveis;
- qualquer alteração de pesos/thresholds gera nova `algorithm_version`;
- não treinar o matcher diretamente em sinais contaminados por ações administrativas;
- não aumentar complexidade antes de medir o gargalo atual.

---

# 1. Estado atual consolidado

## Fundação já implementada

- [x] eventos separados por `event_id`;
- [x] Café Entre Amigos preservado como evento histórico;
- [x] SudoExpo 2026 como evento ativo separado;
- [x] sandbox isolado;
- [x] lookup/check-in multi-evento;
- [x] `AdminEventContext` e seletor de evento em áreas administrativas principais;
- [x] fluxo de participante veterano;
- [x] governança de taxonomia com revisão global e revisão aplicada por evento;
- [x] evento taxonomicamente `dirty/clean`;
- [x] rebuild administrativo de matches;
- [x] semântica NEED → OFFER documentada e exposta no admin;
- [x] canonicalização conservadora de texto livre idêntico/único ao catálogo;
- [x] matcher v2.4 documentado como contrato canônico;
- [x] área de staff com fila operacional;
- [x] auditoria de matches e briefing comercial;
- [x] outreach via WhatsApp com geração de mensagem e confirmação rápida;
- [x] ranking por sinergia mútua na experiência do participante;
- [x] resumo comercial estruturado nos cards;
- [x] baseline comportamental real da SudoExpo 2026 analisado.

## Dívidas conhecidas que permanecem relevantes

- [ ] remover hardcodes indevidos de `EVENT_ID` em operações multi-evento;
- [ ] tornar gravação de perfil + contato realmente atômica;
- [ ] melhorar harness de testes que ainda depende de `psql` local em partes da suíte;
- [ ] elevar cobertura taxonômica e ativar sinônimos/relações complementares com evidência;
- [ ] preservar snapshot exato visto pelo participante no instante da decisão;
- [ ] substituir analytics de “carregado” por exposição real;
- [ ] construir ground truth de outcomes comerciais.

---

# 2. North Star e funil canônico

## 2.1 North Star — QCR

### Qualified Connection Rate

```text
QCR = conexões que produziram outcome útil / participantes ativos
```

Outcome útil deve ser registrado em níveis progressivos:

```text
conversa relevante
→ reunião agendada
→ proposta solicitada
→ negócio/parceria reportado
```

“Match criado”, “interesse” e “contato liberado” são sinais intermediários, não sucesso final.

## 2.2 Funil canônico de produto

```text
cadastro iniciado
→ cadastro concluído
→ primeiro valor percebido
→ match carregado
→ match realmente visto
→ detalhes abertos
→ interesse / agora não
→ interesse mútuo
→ abordagem
→ resposta
→ apresentação
→ contato
→ conversa
→ reunião
→ proposta
→ negócio/parceria
```

## 2.3 Funil paralelo de eficiência operacional

```text
match acionável
→ entrou na fila
→ operador abriu
→ primeira ação
→ follow-up
→ resposta
→ conexão útil
```

O produto só melhora de verdade quando aumenta valor **sem aumentar desproporcionalmente o trabalho humano**.

---

# 3. Gate P0 — Integridade, privacidade e segurança

Problemas desta seção **não dependem do SudoScore**. Qualquer risco de isolamento entre eventos, privacidade ou integridade de dados entra em P0.

## 3.1 R01/R02/R03 — Isolamento multi-evento no outreach

- [ ] remover `EVENT_ID` hardcoded de toda operação administrativa multi-evento;
- [ ] fazer `WhatsAppOutreachModal` operar com o evento selecionado/derivado do match;
- [ ] `record_outreach_attempt` deve derivar ou validar `event_id` a partir de `match_id`;
- [ ] validar que `_profile_id` pertence ao `_match_id` recebido;
- [ ] rejeitar combinações inconsistentes mesmo quando o operador possua papel em ambos os eventos;
- [ ] criar testes A/B de isolamento: match do Evento A nunca pode gerar log no Evento B;
- [ ] criar invariantes automáticas que cubram outreach, fila, reveal, quick confirm e analytics.

**Aceite:** nenhuma RPC crítica confia apenas em `event_id` fornecido pelo frontend quando pode derivá-lo de uma entidade autoritativa.

## 3.2 R04 — Contato como leitura explícita, nunca fallback com efeito colateral

- [ ] remover fallback de leitura de contatos para RPC que libera/revela contato;
- [ ] uma falha de `admin_get_match_contacts` deve ser erro observável, não gatilho de mutação;
- [ ] separar semanticamente `read contact`, `reveal contact` e `release contact`;
- [ ] testar ausência de side effects em consultas administrativas.

## 3.3 R10/R11 — `.env` e auditoria de segredos

- [ ] adicionar `.env` ao `.gitignore`;
- [ ] auditar o `.env` já rastreado e o histórico Git;
- [ ] classificar valores como públicos, sensíveis ou secretos;
- [ ] rotacionar qualquer segredo real que tenha sido exposto;
- [ ] mover segredos para mecanismo apropriado de ambiente/deploy;
- [ ] documentar quais variáveis são deliberadamente públicas.

## 3.4 R05 — Cadastro e contato atômicos

- [ ] substituir persistência parcial de perfil + contato por operação transacional única quando possível;
- [ ] manter idempotência por evento e participante;
- [ ] preservar retry seguro sem duplicação;
- [ ] criar teste de falha exatamente entre save de perfil e contato;
- [ ] garantir rollback ou estado explicitamente recuperável.

---

# 4. P0/P1 — Semântica correta do outreach e WhatsApp

## 4.1 W01–W05 — Consertar histórico de abordagem

Hoje “copiar” ou “abrir WhatsApp” não prova envio real. O modelo de dados deve refletir isso.

Criar eventos distintos:

```text
message_generated
message_edited
message_copied
whatsapp_opened
send_confirmed
response_positive
response_negative
response_no_answer
followup_created
followup_sent
```

- [ ] não incrementar “contato realizado” ao apenas copiar mensagem;
- [ ] não considerar `whatsapp_opened` como envio confirmado;
- [ ] não retornar sucesso fictício quando RPC de log falhar;
- [ ] detectar “primeiro contato” apenas com base em `send_confirmed` ou equivalente confiável;
- [ ] registrar canal, template/version, operador, match, perfil-alvo e timestamp;
- [ ] tornar logs append-only para auditoria;
- [ ] manter um estado derivado de outreach, sem destruir o histórico bruto.

## 4.2 W02/A06/A07 — Resposta e follow-up como estados reais

- [ ] criar estados operacionais claros: `sem_abordagem`, `abordado`, `aguardando_resposta`, `respondeu_sim`, `respondeu_nao`, `sem_resposta`, `followup_pendente`, `encerrado`;
- [ ] registrar prazo de follow-up;
- [ ] mostrar idade do interesse e da última abordagem;
- [ ] resposta positiva deve permitir confirmar/avançar conexão sem passos redundantes;
- [ ] resposta negativa deve retirar item da fila ativa preservando histórico;
- [ ] “sem resposta” deve permitir follow-up manual contextual;
- [ ] medir conversão por tentativa e por template.

---

# 5. P0/P1 — Plataforma de mensuração confiável

Esta seção é pré-requisito para reponderar matcher, comparar UX e automatizar priorização.

## 5.1 D01 — Exposição real de cards

- [ ] separar `match_loaded` de `match_impressed`;
- [ ] gerar impressão apenas quando o card entrar de fato na viewport (`IntersectionObserver` ou equivalente);
- [ ] registrar `rank_position` no instante da impressão;
- [ ] registrar primeira impressão e número de impressões;
- [ ] impedir múltiplos eventos acidentais por rerender;
- [ ] testar que cards fora da viewport não contam como vistos;
- [ ] medir abertura de detalhes e resumo comercial separadamente.

## 5.2 D02/D03 — Onboarding por etapa/campo e tempo

Eventos mínimos:

```text
onboarding_started
onboarding_step_viewed
onboarding_field_focused
onboarding_field_completed
onboarding_step_completed
instagram_enrichment_started
instagram_enrichment_completed
instagram_enrichment_failed
onboarding_abandoned
onboarding_completed
first_match_available
```

Registrar:

- [ ] `event_id`;
- [ ] `profile_id` quando disponível;
- [ ] etapa/campo;
- [ ] versão do onboarding;
- [ ] origem da entrada;
- [ ] duração entre eventos;
- [ ] uso de autofill/sugestão;
- [ ] erro/retry quando houver.

## 5.3 D04–D09 — Funil de match + esforço administrativo

Eventos mínimos:

```text
match_impressed
match_details_opened
match_decision_created
match_decision_changed
mutual_interest_created
admin_queue_item_opened
admin_action_started
admin_action_completed
outreach_event
connection_presented
connection_contact_released
connection_completed
connection_outcome_recorded
```

Registrar para cada ação administrativa:

- [ ] operador;
- [ ] tela/origem;
- [ ] match/conexão;
- [ ] ação;
- [ ] timestamp início/fim;
- [ ] quantidade de clicks/touches quando aplicável;
- [ ] estado anterior e posterior;
- [ ] erro/retry;
- [ ] versão da UI.

## 5.4 D10/D11 — Cohorts e comparação entre algoritmos

Dimensões obrigatórias:

- [ ] evento;
- [ ] segmento;
- [ ] origem do participante;
- [ ] novo vs. veterano;
- [ ] `algorithm_version`;
- [ ] UI/experiment version;
- [ ] tipo/natureza do match;
- [ ] faixa de score;
- [ ] posição/rank;
- [ ] seletividade histórica do participante.

## 5.5 D12 — Experimentos controlados

- [ ] criar `experiment_id`, `variant` e versão da experiência em analytics;
- [ ] permitir rollout percentual por evento/feature;
- [ ] evitar randomização em caminhos de segurança/privacidade;
- [ ] registrar exposição à variante antes de medir comportamento;
- [ ] suportar holdout temporal/evento para matcher;
- [ ] criar guardrails de regressão de QCR, abandono e esforço administrativo.

---

# 6. Métricas oficiais do produto

Implementar captura, cálculo e dashboard para todas as métricas abaixo.

| Métrica | Fórmula | Diagnóstico |
| --- | --- | --- |
| **Onboarding Completion** | concluídos / iniciados | fricção |
| **TTFV** | cadastro → primeiro match relevante | velocidade de valor |
| **Interest@3** | interesses nos Top-3 / Top-3 vistos | qualidade do ranking |
| **Reject@3** | `agora_nao` nos Top-3 / Top-3 vistos | falsos positivos |
| **Reciprocity Rate** | mútuos / pares com ≥1 interesse | qualidade bidirecional |
| **Inbound Conversion** | mútuos após interesse recebido visto / interesses recebidos vistos | efeito da reciprocidade explícita |
| **Interest→Connection** | conexões / pares com interesse | matcher + operação |
| **Connection→Outcome** | outcomes / conexões concluídas | valor real |
| **Median Time to Mutual** | primeiro interesse → mútuo | velocidade |
| **Median Time to Contact** | interesse → primeira abordagem confirmada | operação |
| **Admin Touches/Connection** | ações admin / conexão concluída | fricção interna |
| **Admin Minutes/Connection** | tempo ativo admin / conexão | custo operacional |
| **Backlog Age P90** | idade dos 10% mais antigos | gargalo operacional |
| **Taxonomy Coverage** | entradas canonicalizadas / total | qualidade semântica |
| **Direct Match Precision** | interesse em matches oferta↔necessidade / exposições | qualidade da regra principal |
| **Outcome@Algorithm** | outcomes / matches por versão | evolução do matcher |
| **AI Suggestion Acceptance** | sugestões aceitas / sugestões exibidas | utilidade real da IA |
| **Message Positive Response** | respostas positivas / envios confirmados | qualidade do outreach |
| **Follow-up Recovery** | respostas positivas pós-follow-up / follow-ups enviados | valor do follow-up |
| **Qualified Connections/Admin Hour** | conexões úteis / hora operacional | produtividade |
| **QCR** | conexões com outcome útil / participantes ativos | North Star |

## 6.1 Métricas adicionais obrigatórias

- [ ] step conversion do onboarding;
- [ ] abandono por campo;
- [ ] tempo por campo e etapa;
- [ ] canonicalization rate por origem (`catalog`, texto livre, IA, Instagram);
- [ ] decision latency;
- [ ] undo/change rate de decisões;
- [ ] taxa de impressão por posição;
- [ ] interest/reject por bucket de score;
- [ ] mutual/outcome por bucket de score;
- [ ] distribuição de conexões por participante para detectar concentração;
- [ ] saturação de exposição por participante;
- [ ] taxa de briefing gerado → ação útil;
- [ ] custo de IA por conexão útil;
- [ ] erro/retry rate das RPCs críticas;
- [ ] tempo p50/p90/p99 de recompute/rebuild;
- [ ] dados incompletos por evento;
- [ ] cobertura de outcomes por conexões concluídas.

## 6.2 Regras de qualidade dos dados

- [ ] eventos analíticos devem ser versionados;
- [ ] timestamps devem ser server-authoritative quando a ordem causal importar;
- [ ] nenhuma métrica crítica deve depender de sucesso silencioso no frontend;
- [ ] não misturar ação espontânea do participante com ação administrativa;
- [ ] preservar evento, algoritmo e UI vistos no momento da ação;
- [ ] criar checks de duplicidade e cardinalidade inesperada;
- [ ] manter documentação do significado de cada evento/métrica.

---

# 7. P1 — Preservar o contexto histórico da decisão

Recomputações futuras não podem apagar o contexto que gerou uma decisão.

- [ ] criar trilha append-only `match_decision_events` ou equivalente;
- [ ] persistir `match_id`, `profile_id`, decisão e origem;
- [ ] persistir `algorithm_version`;
- [ ] persistir `score_me`, `score_other`, labels, kind, score gap;
- [ ] persistir reasons e pesos relevantes ou referência imutável ao snapshot;
- [ ] persistir posição/rank e variante de UI;
- [ ] distinguir `participant`, `staff/admin`, automação, migração/backfill;
- [ ] backfill histórico conservador, usando `unknown` quando não for possível reconstruir;
- [ ] testar que rebuild posterior não altera a interpretação histórica.

---

# 8. P1 — Ground truth de valor real

- [ ] aumentar cobertura de `conversa_realizada`;
- [ ] registrar `reuniao_agendada`;
- [ ] registrar `proposta_solicitada`;
- [ ] registrar `negocio_reportado` / parceria;
- [ ] registrar timestamps e origem do outcome;
- [ ] criar input simples para staff e, quando fizer sentido, participante;
- [ ] separar contato liberado de sucesso comercial;
- [ ] criar hierarquia de labels de avaliação do matcher;
- [ ] outcomes fortes devem pesar mais que cliques em avaliações futuras;
- [ ] medir `P(mutual)`, `P(conversa)`, `P(reuniao)`, `P(proposta)`, `P(negocio)` por bucket e natureza do match.

---

# 9. P1 — Next Best Action para a operação

## 9.1 A01/A02/A03/A04 — Fila orientada à próxima ação

Transformar `/admin/matches` de uma tela de investigação em uma central que diga o que deve ser feito agora.

Ordem inicial sugerida:

```text
1. interesse mútuo ainda não apresentado
2. resposta positiva aguardando avanço
3. interesse unilateral com alto potencial de reciprocidade
4. follow-up vencido
5. abordagem inicial pendente
6. auditoria/manual review
```

- [ ] mostrar diretamente “A quer B → abordar B”;
- [ ] uma única ação primária contextual por item;
- [ ] filtros técnicos ficam em “Avançado”;
- [ ] mostrar motivo de prioridade da fila;
- [ ] auto-marcar revisão quando existir ação operacional suficiente;
- [ ] após concluir ação, oferecer/abrir próximo item prioritário;
- [ ] medir cliques, minutos e conexões por hora.

## 9.2 A08/A09/A10/A11/A12/A13/A14/A15

- [ ] idade do interesse;
- [ ] idade da última abordagem;
- [ ] próxima ação sugerida;
- [ ] atalhos de teclado para operação intensiva;
- [ ] briefing IA sob demanda quando tiver valor incremental;
- [ ] mensagem pode ser pré-calculada sem gerar side effect;
- [ ] visão “Só preciso agir nestes N”;
- [ ] indicador de backlog vencido;
- [ ] indicar contato recorrente apenas com base em envio confiável.

## 9.3 A16 — Cockpit único equipe + admin

- [ ] desenhar arquitetura de informação única para `/equipe` e `/admin/matches`;
- [ ] preservar papéis e permissões diferentes;
- [ ] compartilhar a mesma fila/estado operacional;
- [ ] manter investigação avançada como modo secundário;
- [ ] evitar navegação duplicada para executar a mesma conexão;
- [ ] medir navegações, toques e tempo antes/depois.

---

# 10. P1 — Reciprocidade explícita para o participante

## P03/P04/P05 — “Querem falar com você”

Esta é uma das hipóteses com melhor relação impacto/esforço.

- [ ] criar seção “Querem falar com você”;
- [ ] quando o outro já demonstrou interesse, tornar isso visualmente prioritário;
- [ ] copy direta: “X quer se conectar com você. Faz sentido conversar?”;
- [ ] CTA deve permitir resposta rápida;
- [ ] separar “Meus interesses” de “Interesse em mim”;
- [ ] mostrar próximo estado: “se você aceitar, a ACIRV faz a aproximação”;
- [ ] medir Inbound Conversion e Median Time to Mutual;
- [ ] comparar reciprocidade antes/depois.

---

# 11. P1 — Canonicalização e taxonomia semântica

## T01/T02 — Canonicalização de texto livre

- [ ] canonicalizar automaticamente correspondência idêntica/única já suportada em todas as fronteiras;
- [ ] evoluir para sugestão de similaridade sem assumir vínculo automaticamente;
- [ ] “Você quis dizer X?” antes de persistir novo texto livre quando confiança for alta;
- [ ] registrar candidato, confiança, escolha do usuário e origem;
- [ ] criar fila de conceitos livres recorrentes;
- [ ] medir Taxonomy Coverage por evento.

## T03/T04/T05 — Ativar de verdade a taxonomia

- [ ] popular sinônimos de alta confiança usando linguagem real dos participantes;
- [ ] criar 20–40 relações complementares NEED → OFFER de alta confiança como primeiro lote;
- [ ] revisar os itens hoje `kind = both`;
- [ ] separar produto, serviço, parceria, canal e capacidade quando isso melhorar matching;
- [ ] evitar relações amplas que aumentem recall destruindo precisão;
- [ ] medir matches gerados, interesse, mutual e outcomes por relação;
- [ ] permitir desativar relação e rebuild com rastreabilidade;
- [ ] versionar/exportar curadoria para auditoria.

## Meta inicial

- [ ] ≥90% de cobertura canônica em itens confirmados antes de depender fortemente do grafo;
- [ ] alertar quando cobertura cair abaixo da meta.

---

# 12. P1 — Razões comerciais exatas e verificáveis

## M03/M04/C04

- [ ] no `+55`, persistir exatamente qual necessidade encontrou qual oferta;
- [ ] no `+25`, persistir exatamente qual oferta encontrou qual necessidade do outro;
- [ ] exibir “Você procura X · esta empresa oferece Y”;
- [ ] exibir principais overlaps quando houver múltiplos;
- [ ] manter score saturado para evitar inflação por quantidade de overlaps;
- [ ] separar razão principal de detalhes adicionais;
- [ ] reasons devem ser auditáveis e reprodutíveis.

---

# 13. P1 — Confiança, IA e linguagem do produto

## C01/C02/C05

- [ ] renomear camada determinística para algo como **“Leitura do Match”**, sem fingir geração por IA;
- [ ] `is_ai_enhanced` só deve ser verdadeiro quando houve enriquecimento generativo real;
- [ ] remover claims não garantidos pelos dados, como “tomador de decisão”, “entrega imediata” ou equivalentes sem evidência;
- [ ] separar visualmente **fato**, **inferência** e **sugestão**;
- [ ] indicar quando texto foi gerado por modelo e qual evidência sustentou a síntese;
- [ ] evitar fallback genérico que afirma “alta compatibilidade” sem reason suficiente;
- [ ] usar copy “Tenho interesse em conversar” para medir abertura real a contato;
- [ ] versionar mudanças relevantes de copy/UX.

## C03/C06/C07/C08 — Backlog associado

- [ ] cada razão apresentada deve apontar para evidência visível;
- [ ] feedback opcional “Esse motivo faz sentido?”;
- [ ] registrar razões rejeitadas;
- [ ] usar feedback como sinal de auditoria da regra, não como ground truth isolado.

---

# 14. P2 — Experiência do participante: menos decisão, mais valor

## P01/P02 — Top 3 primeiro

- [ ] abrir painel com “Suas 3 melhores oportunidades agora”;
- [ ] restante atrás de “Ver mais oportunidades”;
- [ ] medir Interest@3 e Reject@3;
- [ ] medir se redução de escolha aumenta decisão sem ocultar oportunidades úteis;
- [ ] não aplicar antes da instrumentação real de impressão/rank.

## P06–P12 — Hipóteses complementares

- [ ] separar “Meus interesses” e “Interesse em mim”;
- [ ] testar modo de triagem um match por vez;
- [ ] avaliar comparação de duas oportunidades próximas;
- [ ] mostrar uma razão principal e detalhes sob demanda;
- [ ] remover nomenclatura técnica do matcher da superfície principal;
- [ ] explicar estado após “Tenho interesse”;
- [ ] mostrar expectativa operacional (“aguardando resposta”, “ACIRV fará a aproximação”).

---

# 15. P2 — Progressive profiling e onboarding

## U03/U04/U05 — Perguntar menos no caminho crítico

- [ ] testar porte como opcional no cadastro inicial;
- [ ] testar tipo empresarial como opcional no cadastro inicial;
- [ ] mover detalhes secundários para refinamento progressivo;
- [ ] só pedir informação quando houver hipótese clara de ganho no match;
- [ ] usar experimento controlado e medir conclusão, TTFV e qualidade dos matches;
- [ ] nunca remover campo que prove ter ganho líquido de outcome sem alternativa equivalente.

## U01/U02 — Instagram assíncrono + autofill

- [ ] enrichment do Instagram não deve bloquear avanço quando não for necessário;
- [ ] executar enrichment assíncrono com estado explícito;
- [ ] preencher segmento/resumo/tipo somente quando confiança for alta;
- [ ] mostrar sugestões como editáveis/confirmáveis;
- [ ] medir latência, taxa de sucesso, campos aceitos e efeito no QCR;
- [ ] fallback deve manter cadastro utilizável sem Instagram.

## Backlog U06–U12

- [ ] explicar por que cada campo é útil;
- [ ] remover campos sem efeito comprovado do caminho crítico;
- [ ] autosave robusto de rascunho;
- [ ] estimativa de tempo restante;
- [ ] avaliar resumo empresarial como principal campo semântico;
- [ ] perguntar “qual é seu principal objetivo na feira?”;
- [ ] exemplos personalizados por segmento.

---

# 16. P1/P2 — Natureza do match separada da força

## M01/M02

Classificar natureza sem confundir com intensidade:

```text
venda / prospecção
compra / fornecedor
parceria
indicação/canal
networking estratégico
exploratória
```

- [ ] definir taxonomia de natureza;
- [ ] mostrar natureza separada do score;
- [ ] não chamar match de perfil de “oportunidade comercial” sem evidência comercial;
- [ ] medir interesse/outcome por natureza;
- [ ] testar compreensão com equipe e participantes.

---

# 17. P1/P2 — Calibração comportamental e matcher baseado em evidência

## Baseline observado em 12/09/2026

A auditoria real mostrou que `interesse` é um sinal comportamental ruidoso. Muitos participantes marcam interesse em quase tudo; entre usuários seletivos o score v2.4 discrimina melhor. Portanto não reponderar o matcher apenas porque existem interesses com score baixo.

A evolução deve separar:

```text
compatibilidade objetiva
+ intenção/seletividade individual
+ natureza do match
+ exposição/rank
+ resultado real produzido
```

## M06/M07 — Calibrar pesos por comportamento/outcome

**Somente após a plataforma de mensuração e cobertura de outcomes.**

- [ ] replay offline reproduzível do v2.4;
- [ ] calcular `interest_propensity` usando apenas histórico anterior ao ponto previsto;
- [ ] comparar v2.4 com baseline de propensão individual;
- [ ] AUC, PR-AUC, Brier score/log loss e calibração por buckets;
- [ ] controlar por rank/exposição;
- [ ] usar outcomes fortes como labels prioritários;
- [ ] split temporal e, quando possível, validação entre eventos;
- [ ] qualquer novo peso/threshold = nova `algorithm_version`;
- [ ] só promover mudança se melhorar holdout sem piorar guardrails.

## Low-score residuals

- [ ] fila: score `<40` + interesse de participante seletivo;
- [ ] prioridade maior se houver mutual;
- [ ] prioridade máxima se houver conversa/reunião/proposta/negócio;
- [ ] classificar causa provável: taxonomia, sinônimo, relação complementar, target parcial, semântica externa, ruído comportamental;
- [ ] usar residuals para propor melhorias de catálogo/relations;
- [ ] manter controle de low-score rejeitados para medir falsos positivos.

---

# 18. P2 — Viés de ranking, diversidade e saturação

## M12/M13/M14

- [ ] evitar Top-N dominado por empresas quase idênticas;
- [ ] medir concentração de exposição;
- [ ] definir limite/penalidade de saturação apenas se dados mostrarem necessidade;
- [ ] manter endpoints fortes e não sacrificar relevância apenas por diversidade;
- [ ] considerar exploração controlada apenas dentro de bandas seguras;
- [ ] registrar experimento e posição para aprendizado contrafactual.

---

# 19. P1 técnico — CI e harness reproduzível

## R06/R07

- [ ] CI obrigatório: lint → typecheck → unit → integration;
- [ ] remover dependência implícita de `psql` no PATH do desenvolvedor;
- [ ] criar harness reproduzível com Supabase/Postgres controlado;
- [ ] separar claramente harness failure de product failure;
- [ ] rodar provas de isolamento multi-evento em CI;
- [ ] rodar matriz comportamental do matcher em CI;
- [ ] proteger migrations/RPCs com contratos estáticos e testes executáveis.

## Backlog técnico associado

- [ ] decompor `equipe.tsx` em módulos/fluxos menores;
- [ ] decompor `participar.tsx` em máquina de estados/steps mais explícitos;
- [ ] regenerar tipos Supabase após migrations aplicadas;
- [ ] benchmark de recompute/rebuild em 100/250/500/1.000 perfis;
- [ ] definir SLO operacional antes de otimizar prematuramente.

---

# 20. Matriz permanente de provas do matcher

Manter casos artificiais versionados cobrindo:

- [ ] direto puro `+55`;
- [ ] inverso puro `+25`;
- [ ] bidirecional;
- [ ] prioridade direta;
- [ ] segmentos diferentes `+5`;
- [ ] cidade e recência;
- [ ] 1/2/3 critérios de perfil desejado;
- [ ] target parcial = zero;
- [ ] target mútuo;
- [ ] relação peso 39 = zero;
- [ ] relação peso 40 = +12;
- [ ] relação peso 100 = +30;
- [ ] duas relações aplicáveis → só a maior conta;
- [ ] relação unidirecional não cria inversa;
- [ ] sinônimo explícito;
- [ ] igualdade por `taxonomy_item_id`;
- [ ] texto livre;
- [ ] falso positivo de substring;
- [ ] eventos diferentes nunca cruzam;
- [ ] conexão histórica é preservada em rebuild;
- [ ] decisão histórica mantém snapshot após rebuild;
- [ ] RPCs de outreach não cruzam eventos/perfis.

---

# 21. SudoScore — mecanismo de priorização do roadmap

Cada hipótese recebe nota 0–5 em:

- **I — Impacto em conexões qualificadas**
- **A — Alavancagem administrativa**
- **R — Reach/alcance**
- **S — Redução de risco**
- **L — Learning value**
- **C — Confiança da evidência**
- **E — Esforço**, 1 fácil → 5 difícil

Fórmula:

```text
SudoScore = 5I + 3A + 2R + 3S + 2L + 2C + 3(6−E)
```

Faixa nominal: 0–100.

## Regras

- [ ] manter score por hipótese em estrutura versionável;
- [ ] recalcular após cada evento relevante ou novo bloco de evidência;
- [ ] anexar métricas/queries que justificam I/C quando disponíveis;
- [ ] registrar dependências que impedem implementação imediata;
- [ ] P0 de integridade supera o score;
- [ ] hipóteses “Após dados” não podem furar o gate de mensuração;
- [ ] revisar ranking após instrumentação e primeiros outcomes confiáveis.

---

# 22. Ranking inicial oficial — 20 prioridades

> Este ranking é baseado no estado do código e na auditoria de 12/09/2026. Deve ser recalculado após a nova telemetria produzir evidência confiável.

| # | Item | Score | Classe | Dependência principal |
| ---: | --- | ---: | --- | --- |
| 1 | **R01/R02/R03 — corrigir isolamento multi-evento no outreach** | gate | **P0** | nenhuma |
| 2 | **R04 — remover/auditar fallback de contato para RPC de release** | gate | **P0** | nenhuma |
| 3 | **W01–W05 — consertar semântica do histórico de WhatsApp** | 87 | P0/P1 | #1/#2 |
| 4 | **W02/A06/A07 — resposta + aguardando + follow-up como estados reais** | 81 | P1 | #3 |
| 5 | **D01–D09 — instrumentação confiável do funil e esforço admin** | 80 | P1 | nenhuma |
| 6 | **A01/A02/A03/A04 — Next Best Action administrativa** | 76 | P1 | #4/#5 |
| 7 | **P03/P04/P05 — destacar quem já quer falar comigo** | 76 | P1 | #5 |
| 8 | **T01/T02 — canonicalizar texto livre** | 74 | P1 | métricas de cobertura |
| 9 | **R05 — tornar cadastro + contato atômico** | 74 | P1 | nenhuma |
| 10 | **D08/D10/D11 — medir outcome e fechar feedback loop do matcher** | 74 | P1 | #5 |
| 11 | **M03/M04/C04 — razões comerciais exatas e verificáveis** | 73 | P1 | matcher/reasons |
| 12 | **C01/C02/C05 — corrigir narrativa “IA” e claims não fundamentados** | 71 | P1 | nenhuma |
| 13 | **P01/P02 — Top 3 primeiro; resto sob demanda** | 69 | P2 | #5 |
| 14 | **T03/T04/T05 — ativar de verdade a taxonomia semântica** | 69 | P2 | #8 + governança |
| 15 | **R06/R07 — CI + harness reproduzível** | 69 | P1 técnico | nenhuma |
| 16 | **A16 — fundir equipe + admin em um cockpit** | 67 | P2 | #4/#6 |
| 17 | **U03/U04/U05 — progressive profiling** | 61 | experimento | #5 |
| 18 | **M06/M07 — calibrar pesos por comportamento/outcome real** | 61 | após dados | #5/#10 |
| 19 | **R10/R11 — `.env` + auditoria de segredos** | gate | **P0 auditoria** | nenhuma |
| 20 | **U01/U02 — enrichment assíncrono + autofill** | 59 | P2 | #5 |

---

# 23. Backlog expandido de hipóteses

Estas hipóteses não substituem o ranking acima. Devem ser promovidas apenas quando houver evidência, dependência resolvida ou custo baixo suficiente.

## Participante / onboarding

- [ ] U06 explicar por que cada informação é solicitada;
- [ ] U07 remover do caminho crítico campos sem efeito comprovado;
- [ ] U08 autosave silencioso e recuperação robusta;
- [ ] U09 tempo restante estimado;
- [ ] U10 resumo empresarial como possível campo semântico central;
- [ ] U11 objetivo principal na feira;
- [ ] U12 exemplos de oferta/procura por segmento.

## Taxonomia

- [ ] T06 promover termos livres recorrentes ao catálogo;
- [ ] T07 busca/sugestão semântica durante digitação;
- [ ] T08 aprender candidatos a sinônimos a partir de correções humanas;
- [ ] T09 separar produto/serviço/parceria/distribuição quando útil;
- [ ] T10 auditar default semântico de necessidades manuais;
- [ ] T11 prioridade principal mais explícita;
- [ ] T12 copy da prioridade = “o que mais quero resolver”.

## Matcher

- [ ] M05 reduzir confiança de sinais genéricos sem evidência oferta↔necessidade;
- [ ] M08 testar peso de necessidade prioritária por outcome;
- [ ] M09 investigar assimetria comprador/fornecedor;
- [ ] M10 testar penalização de assimetria apenas offline;
- [ ] M11 disponibilidade temporal como feature futura;
- [ ] M15 aprender sinais associados a negócio real;
- [ ] M16 manter benchmark artificial permanente.

## Participante pós-match

- [ ] P07 triagem rápida um match por vez;
- [ ] P08 comparação de oportunidades;
- [ ] P09 razão principal + detalhes sob demanda;
- [ ] P10 remover jargão técnico;
- [ ] P11 explicar próximo estado;
- [ ] P12 expectativa operacional explícita.

## Confiança

- [ ] C03 razões ancoradas em evidência;
- [ ] C06 identificar claramente geração por modelo;
- [ ] C07 feedback sobre razão;
- [ ] C08 detectar regras ruins a partir desse feedback.

## Administração

- [ ] A05 filtros técnicos em modo avançado;
- [ ] A08 idade do interesse;
- [ ] A09 idade da abordagem;
- [ ] A10 próximo item automático;
- [ ] A11 revisão automática após ação suficiente;
- [ ] A12 atalhos de teclado;
- [ ] A13 IA apenas quando incremental;
- [ ] A14 pré-geração segura de mensagem;
- [ ] A15 visão somente acionável.

## WhatsApp

- [ ] W06 atribuição de conversa ao match;
- [ ] W07 histórico compacto da pessoa;
- [ ] W08 “sim” avança sem redundância;
- [ ] W09 “não” encerra fila ativa;
- [ ] W10 follow-up manual contextual;
- [ ] W11 perspectiva correta na mensagem;
- [ ] W12 performance por template/version.

---

# 24. Ordem recomendada de execução

```text
ONDA 1 — CONFIANÇA / P0
R01/R02/R03 isolamento outreach
R04 leitura de contato sem side effect
R10/R11 .env/segredos
W01–W05 semântica real do outreach
R05 atomicidade perfil+contato

ONDA 2 — MENSURAÇÃO
D01 impressão real
D02/D03 onboarding
D04–D09 funil + esforço admin
snapshot append-only de decisões
outcomes comerciais
D10/D11 cohorts e algorithm comparison
D12 experiment framework

ONDA 3 — THROUGHPUT
W02/A06/A07 estados de resposta/follow-up
A01–A04 Next Best Action
P03/P04/P05 “Querem falar com você”
A16 cockpit único quando fluxo estiver validado

ONDA 4 — QUALIDADE
T01/T02 canonicalização
M03/M04/C04 reasons verificáveis
C01/C02/C05 linguagem e IA honestas
T03/T04/T05 taxonomia semântica
P01/P02 Top 3
progressive profiling + Instagram assíncrono

ONDA 5 — INTELIGÊNCIA ADAPTATIVA
M06/M07 replay e calibração
low-score residual mining
exploração controlada
Matcher v3 probabilístico apenas com outcomes suficientes
```

---

# 25. Matcher v3 — visão de longo prazo, não tarefa imediata

Somente após mensuração confiável e quantidade suficiente de outcomes.

```text
features determinísticas v2.4
+ taxonomia/grafo
+ semântica
+ target profile
+ contexto da dupla
+ propensão comportamental
+ exposição/rank
+ outcomes históricos
        ↓
modelo calibrado e auditável
        ↓
P(A quer conversar com B)
P(B quer conversar com A)
P(dupla produz conexão valiosa)
```

- [ ] prever A→B e B→A separadamente;
- [ ] prever valor da dupla independentemente do clique unilateral;
- [ ] manter reasons determinísticos como camada explicável;
- [ ] não treinar em ações administrativas como se fossem intenção orgânica;
- [ ] validação temporal e entre eventos;
- [ ] comparar sempre contra v2.4;
- [ ] rollback simples para v2.4;
- [ ] não promover ML enquanto ground truth forte for insuficiente.

---

# 26. Definition of Done

Uma tarefa só recebe `[x]` quando:

1. implementação está revisável e `main` permanece funcional;
2. critérios de aceitação estão explícitos;
3. migrations são idempotentes e possuem RLS/grants corretos quando aplicável;
4. testes/provas relevantes existem;
5. validação executável foi rodada quando o ambiente permite;
6. ausência de regressão em login, onboarding, participante, staff/admin e matching foi verificada;
7. documentação canônica reflete comportamento real;
8. analytics necessário existe **antes** de declarar sucesso de experimento;
9. mudança de score/semântica possui `algorithm_version` apropriada;
10. mudança de UX relevante possui versão/experimento quando comportamento histórico será comparado;
11. não existe sucesso silencioso que corrompa métricas;
12. para features de priorização, impacto deve ser avaliado em QCR, conversão do funil e/ou esforço operacional.

---

# 27. Histórico consolidado de entregas

## Multi-eventos

- [x] evento Café Entre Amigos separado;
- [x] SudoExpo 2026 ativa e limpa;
- [x] lookup inteligente;
- [x] check-in idempotente;
- [x] isolamento do matcher;
- [x] seletor/contexto no admin;
- [x] sandbox e reset administrativo.

## Matcher/taxonomia

- [x] contrato matcher v2.4 documentado;
- [x] governança de revisão taxonômica;
- [x] rebuild administrativo;
- [x] direção NEED → OFFER corrigida na UI;
- [x] canonicalização conservadora no onboarding;
- [x] incidente de item duplicado resolvido e coberto por regressão.

## Participante

- [x] check-in de veterano;
- [x] ranking por sinergia mútua;
- [x] resumo comercial nos cards;
- [x] suporte via WhatsApp;
- [x] fluxo de onboarding reduzido para duas etapas no estado atual do produto.

## Operação/admin

- [x] fila operacional;
- [x] auditoria de matches;
- [x] briefing IA sob demanda;
- [x] geração de mensagem de WhatsApp;
- [x] confirmação rápida de conexão;
- [x] histórico inicial de outreach — **a ser corrigido semanticamente conforme seção 4**.

---

# 28. Princípio arquitetural a preservar

```text
linguagem humana ambígua
        ↓
IA / heurística produz candidatos e síntese
        ↓
canonicalização para IDs + sinônimos
        ↓
grafo comercial curado NEED → OFFER
        ↓
matcher determinístico, versionado e auditável
        ↓
exposição mensurada
        ↓
decisão do participante preservada como snapshot
        ↓
operação orientada à próxima ação
        ↓
outcome real
        ↓
aprendizado e recalibração offline
```

A prioridade é fechar o circuito:

```text
SudoExpo sugere
→ pessoa vê
→ pessoa decide
→ outra responde
→ ACIRV conecta
→ algo acontece
→ SudoExpo aprende
```

O produto deve evoluir quando o ciclo produz evidência, não quando apenas produz mais features.
