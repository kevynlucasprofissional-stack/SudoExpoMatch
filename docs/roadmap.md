# ROADMAP — SudoExpo Match

> **Método:** Quality-First. Uma etapa só é concluída quando código, evidência, não-regressão, mensuração e documentação estão sincronizados.
>
> **Atualizado em:** 12/09/2026, após auditoria completa de produto, UX, operação, matcher, taxonomia, analytics, multi-eventos, fluxo administrativo e dados comportamentais reais da SudoExpo 2026.
>
> **Objetivo:** transformar o SudoExpo Match de um sistema que gera recomendações em um sistema que aprende continuamente quais conexões realmente valem o tempo dos participantes e da equipe ACIRV.

---

# 0. Princípios de evolução

O produto deve reduzir três incertezas:

1. **Participante:** “qual é a melhor conexão para mim agora?”
2. **Operador:** “qual é a próxima ação que devo executar?”
3. **Produto:** “onde está o gargalo que impede uma conexão de virar valor real?”

Princípios obrigatórios:

- estado real > narrativa;
- integridade, privacidade e isolamento entre eventos > conveniência;
- outcomes reais > quantidade de matches;
- exposição real > card apenas carregado;
- evidência comercial verificável > copy persuasiva;
- automação deve reduzir trabalho sem esconder causalidade;
- IA pode entender linguagem, sugerir, sintetizar e explicar, mas regras críticas precisam continuar auditáveis;
- qualquer alteração de pesos/thresholds gera nova `algorithm_version`;
- nenhuma mudança de matcher é promovida apenas porque aumenta clique;
- `interesse` é sinal intermediário e ruidoso, não ground truth de “match correto”;
- nenhuma conclusão sobre falso negativo deve ignorar exposição, rank, seletividade, natureza do match e origem da decisão;
- features comportamentais usadas em previsão só podem usar informação disponível antes do instante previsto;
- não aumentar complexidade antes de medir o gargalo atual;
- hipóteses devem ser tratadas como hipóteses até produzirem evidência.

---

# 1. Estado atual consolidado

## 1.1 Fundação implementada

- [x] eventos separados por `event_id`;
- [x] Café Entre Amigos preservado como evento histórico;
- [x] SudoExpo 2026 separada como evento ativo;
- [x] sandbox isolado;
- [x] lookup/check-in multi-evento;
- [x] `AdminEventContext` e seletor de evento em áreas administrativas principais;
- [x] fluxo de participante veterano;
- [x] governança da taxonomia por revisão;
- [x] estado taxonômico `dirty/clean` por evento;
- [x] rebuild administrativo de matches;
- [x] semântica NEED → OFFER documentada e exposta no admin;
- [x] canonicalização conservadora de texto livre idêntico/único ao catálogo;
- [x] matcher v2.4 documentado como contrato canônico;
- [x] área operacional de staff;
- [x] auditoria de matches e briefing comercial;
- [x] geração de abordagem por WhatsApp;
- [x] confirmação rápida de conexão;
- [x] ranking por sinergia mútua no participante;
- [x] resumo comercial estruturado nos cards;
- [x] onboarding atual reduzido para duas etapas;
- [x] baseline comportamental real da SudoExpo 2026 analisado.

## 1.2 Baseline comportamental auditado em 12/09/2026

A auditoria cruzou 2.471 matches / 4.942 perspectivas, 509 decisões, 15.621 reasons, 127 perfis, ofertas/necessidades, conexões e taxonomia.

- 332 decisões foram `interesse`;
- 223/332 interesses (67,2%) ocorreram com score `<40`;
- 148/223 desses interesses baixos (66,4%) vieram de 17 participantes que, com pelo menos 5 decisões observadas, marcaram `interesse` em 100% delas;
- entre participantes seletivos, score médio observado foi ~43,7 em `interesse` vs. ~23,2 em `agora_nao`;
- AUC do score isolado foi ~0,625 no conjunto completo e ~0,733 entre participantes seletivos;
- propensão individual histórica mostrou alto poder preditivo da próxima decisão, indicando forte diferença de estilo de uso do botão;
- velocidade de decisão sozinha não demonstrou clique acidental;
- `outro_oferece_o_que_procuro` (+55) mostrou associação forte com interesse entre seletivos;
- `outro_procura_o_que_ofereco` (+25) não mostrou lift comparável na amostra atual;
- `perfil_desejado` apresentou comportamento diferente da evidência comercial direta;
- havia apenas 4 matches com interesse mútuo explícito suficiente para análise — amostra insuficiente para reponderação;
- havia 67 conexões, quase todas apenas em `apresentados`; outcomes comerciais fortes ainda são escassos;
- 109/509 decisões (21,4%) apontavam para match recomputado depois da decisão, perdendo o snapshot original visto;
- cobertura taxonômica observada: ~65,2% das necessidades e ~51,9% das ofertas;
- 44 itens ativos, sinônimos efetivamente vazios e zero relações complementares no snapshot;
- não foi encontrada evidência de erro aritmético sistêmico no score v2.4.

Conclusão atual:

```text
A — clique acidental aleatório: não demonstrado
A' — participantes extremamente permissivos: fortemente demonstrado
B — falsos negativos reais: plausíveis, ainda não quantificados com ground truth forte
C — UI/semântica ampla de “interesse”: plausível e precisa ser instrumentada
D — cobertura semântica/taxonomia incompleta: fonte concreta de falsos negativos potenciais
```

---

# 2. North Star e funis canônicos

## 2.1 North Star — Qualified Connection Rate (QCR)

```text
QCR = conexões que produziram outcome útil / participantes ativos
```

Outcome útil em níveis:

```text
conversa relevante
→ reunião agendada
→ proposta solicitada
→ negócio/parceria reportado
```

“Match criado”, “interesse”, “mútuo” e “contato liberado” são sinais intermediários.

## 2.2 Funil de produto

```text
cadastro iniciado
→ cadastro concluído
→ primeiro valor percebido
→ match carregado
→ match realmente visto
→ detalhes abertos
→ decisão
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

## 2.3 Funil de eficiência administrativa

```text
match acionável
→ fila operacional
→ operador abre
→ primeira ação
→ abordagem
→ follow-up
→ resposta
→ conexão útil
```

O produto deve aumentar valor sem aumentar desproporcionalmente o trabalho humano.

---

# 3. SudoScore — priorização oficial

Cada hipótese recebe 0–5 em:

- **I — Impacto em conexões qualificadas**;
- **A — Alavancagem administrativa**;
- **R — Reach/alcance**;
- **S — Redução de risco**;
- **L — Learning value**;
- **C — Confiança da evidência**;
- **E — Esforço**, 1 fácil → 5 difícil.

```text
SudoScore = 5I + 3A + 2R + 3S + 2L + 2C + 3(6−E)
```

Regras:

- [ ] manter scores em estrutura versionável;
- [ ] recalcular após cada evento ou novo bloco relevante de evidência;
- [ ] anexar métricas/queries que justifiquem impacto e confiança;
- [ ] registrar dependências;
- [ ] P0 de integridade supera o SudoScore;
- [ ] itens “Após dados” não furam o gate de mensuração;
- [ ] coorte pequena não recebe confiança alta;
- [ ] reavaliar ranking quando outcomes confiáveis crescerem.

## 3.1 Ranking inicial oficial — 20 prioridades

| # | Item | Score | Classe |
| ---: | --- | ---: | --- |
| 1 | **R01/R02/R03 — isolamento multi-evento no outreach** | gate | **P0** |
| 2 | **R04 — contato sem fallback para RPC com efeito colateral** | gate | **P0** |
| 3 | **W01–W05 — semântica correta do histórico de WhatsApp** | 87 | P0/P1 |
| 4 | **W02/A06/A07 — resposta + aguardando + follow-up como estados reais** | 81 | P1 |
| 5 | **D01–D09 — mensuração confiável do funil e esforço admin** | 80 | P1 |
| 6 | **A01/A02/A03/A04 — Next Best Action administrativa** | 76 | P1 |
| 7 | **P03/P04/P05 — destacar quem já quer falar comigo** | 76 | P1 |
| 8 | **T01/T02 — canonicalizar texto livre** | 74 | P1 |
| 9 | **R05 — tornar cadastro + contato atômicos** | 74 | P1 |
| 10 | **D08/D10/D11 — outcomes + feedback loop do matcher** | 74 | P1 |
| 11 | **M03/M04/C04 — razões comerciais exatas/verificáveis** | 73 | P1 |
| 12 | **C01/C02/C05 — narrativa de IA e claims fundamentados** | 71 | P1 |
| 13 | **P01/P02 — Top 3 primeiro; resto sob demanda** | 69 | P2 |
| 14 | **T03/T04/T05 — ativar taxonomia semântica** | 69 | P2 |
| 15 | **R06/R07 — CI + harness reproduzível** | 69 | P1 técnico |
| 16 | **A16 — cockpit único equipe/admin** | 67 | P2 |
| 17 | **U03/U04/U05 — progressive profiling** | 61 | experimento |
| 18 | **M06/M07 — calibrar pesos por comportamento/outcome** | 61 | após dados |
| 19 | **R10/R11 — `.env` + auditoria de segredos** | gate | **P0 auditoria** |
| 20 | **U01/U02 — Instagram assíncrono + autofill** | 59 | P2 |

---

# 4. Gate P0 — integridade, privacidade e segurança

## R01 — remover `EVENT_ID` hardcoded de operações multi-evento

- [ ] auditar todas as referências a `EVENT_ID`;
- [ ] distinguir evento público padrão de contexto administrativo selecionável;
- [ ] fazer fila, outreach, analytics, quick confirm e reveal usarem evento autoritativo.

## R02 — RPC de outreach deve derivar/validar evento pelo match

- [ ] `record_outreach_attempt` não deve confiar apenas em `_event_id` do frontend;
- [ ] derivar `event_id` a partir de `match_id` ou validar igualdade;
- [ ] rejeitar mismatch mesmo se usuário possuir papel nos dois eventos.

## R03 — validar pertencimento do perfil ao match

- [ ] `_profile_id` precisa ser A ou B do `_match_id`;
- [ ] teste negativo obrigatório para perfil externo ao match.

## R04 — contato como leitura explícita

- [ ] remover fallback de consulta de contatos para RPC de release/reveal;
- [ ] falha em `admin_get_match_contacts` deve ser observável e sem side effect;
- [ ] separar `read`, `reveal` e `release` no domínio.

## R05 — perfil + contato atômicos

- [ ] substituir save parcial por operação transacional;
- [ ] manter idempotência;
- [ ] retry seguro;
- [ ] teste de falha entre persistência de perfil e contato;
- [ ] rollback ou estado explicitamente recuperável.

## R10 — `.env` no `.gitignore`

- [ ] ignorar `.env` e arquivos equivalentes sensíveis;
- [ ] manter `.env.example`/documentação sem segredos quando necessário.

## R11 — auditar histórico e rotacionar segredos

- [ ] classificar valores já rastreados como públicos/sensíveis/secretos;
- [ ] auditar histórico Git;
- [ ] rotacionar qualquer segredo real;
- [ ] documentar quais variáveis são deliberadamente públicas.

## R12 — invariantes automáticas de isolamento

- [ ] Evento A nunca gera match, outreach, analytics ou contato no Evento B;
- [ ] cobrir fila, reveal, quick confirm, decisions, outcomes e rebuild;
- [ ] executar em CI.

**Aceite P0:** nenhuma operação crítica confia em contexto de evento fornecido pelo cliente quando pode derivá-lo de entidade autoritativa.

---

# 5. Plataforma de mensuração confiável

## 5.1 Contrato comum de evento analítico

Todo evento novo deve, quando aplicável, carregar:

```text
event_name
schema_version
event_id
occurred_at_server
client_event_id / idempotency_key
session_id
actor_type
actor_id/profile_id quando permitido
match_id
connection_id
algorithm_version
ui_version
experiment_id
variant
source_surface
metadata tipado
```

Regras:

- [ ] `client_event_id`/idempotência para evitar duplicidade por retry;
- [ ] timestamps server-authoritative quando ordem causal importar;
- [ ] schema versionado;
- [ ] sem PII desnecessária;
- [ ] erros de tracking não podem fingir sucesso;
- [ ] eventos críticos de backend devem nascer no backend sempre que possível;
- [ ] documentação de significado e cardinalidade de cada evento;
- [ ] data dictionary versionado.

## D01 — impressão real do match

- [ ] separar `match_loaded` de `match_impressed`;
- [ ] `IntersectionObserver` ou equivalente;
- [ ] registrar rank no instante da impressão;
- [ ] primeira impressão + contagem;
- [ ] impedir duplicidade por rerender;
- [ ] cards fora da viewport não contam;
- [ ] detalhes/resumo abertos são eventos separados.

## D02 — onboarding por campo/etapa

- [ ] `onboarding_started`;
- [ ] `onboarding_step_viewed`;
- [ ] `onboarding_field_focused`;
- [ ] `onboarding_field_completed`;
- [ ] `onboarding_step_completed`;
- [ ] `onboarding_abandoned`;
- [ ] `onboarding_completed`.

## D03 — tempo por etapa / TTFV

- [ ] duração por etapa e campo;
- [ ] cadastro concluído → primeiro match disponível;
- [ ] cadastro concluído → primeira impressão de oportunidade;
- [ ] separar “match disponível” de “valor realmente percebido”.

## D04 — card impression → interesse

- [ ] denominador só inclui match realmente visto;
- [ ] registrar rank, score, kind, reasons e versão.

## D05 — interesse unilateral → mútuo

- [ ] timestamp do primeiro interesse;
- [ ] timestamp da reciprocidade;
- [ ] origem da descoberta do interesse recebido.

## D06 — mútuo → apresentação

- [ ] medir tempo e taxa;
- [ ] distinguir avanço manual, quick confirm e automação futura.

## D07 — apresentação → conclusão

- [ ] medir fulfillment real;
- [ ] separar `apresentados`, `contato_liberado`, `conversa_realizada`.

## D08 — conclusão → outcome comercial

- [ ] conversa relevante;
- [ ] reunião;
- [ ] proposta;
- [ ] negócio/parceria;
- [ ] timestamps e origem do relato.

## D09 — esforço administrativo

- [ ] `admin_queue_item_opened`;
- [ ] `admin_action_started`;
- [ ] `admin_action_completed`;
- [ ] cliques/toques;
- [ ] duração ativa;
- [ ] erro/retry;
- [ ] estado anterior/posterior.

## D10 — cohorts

Dimensões:

- [ ] evento;
- [ ] segmento;
- [ ] origem;
- [ ] novo/veterano;
- [ ] algorithm version;
- [ ] UI version;
- [ ] experimento;
- [ ] natureza/kind;
- [ ] score bucket;
- [ ] rank;
- [ ] seletividade histórica;
- [ ] objetivo declarado;
- [ ] origem da decisão.

## D11 — comparar algoritmos por outcomes

- [ ] não usar score médio como métrica de sucesso;
- [ ] comparar interest, mutual, conversa, reunião, proposta e negócio por versão;
- [ ] normalizar por exposição/coorte.

## D12 — experimentos A/B / rollout

- [ ] `experiment_id` + `variant`;
- [ ] registrar exposição antes do comportamento;
- [ ] rollout percentual por evento/feature;
- [ ] holdout quando necessário;
- [ ] evitar experimentos em privacidade/segurança;
- [ ] guardrails de QCR, abandono, latência e esforço admin.

## D13 — semântica da decisão e clique acidental

- [ ] undo imediato sem fricção;
- [ ] evento `match_decision_changed` preservando a decisão anterior;
- [ ] medir reversão em até 10s e janelas maiores;
- [ ] não usar latência isoladamente como prova de acidente;
- [ ] feedback opcional pós-interesse: comprar/contratar, vender/oferecer, parceria, indicação/canal, networking, outro;
- [ ] avaliar intensidade opcional “aberto a conversar” vs. “forte interesse” apenas via experimento;
- [ ] ausência de feedback opcional não conta como negativo.

---

# 6. Métricas oficiais e dashboards

Implementar captura, cálculo e visualização para:

| Métrica | Fórmula | Diagnóstico |
| --- | --- | --- |
| **QCR** | conexões com outcome útil / participantes ativos | North Star |
| **Onboarding Completion** | concluídos / iniciados | fricção |
| **TTFV** | cadastro → primeiro valor | velocidade de valor |
| **Interest@3** | interesses nos Top-3 realmente vistos / Top-3 vistos | ranking |
| **Reject@3** | `agora_nao` nos Top-3 realmente vistos / Top-3 vistos | falso positivo |
| **Reciprocity Rate** | mútuos / pares com ≥1 interesse | qualidade bidirecional |
| **Inbound Conversion** | mútuos após interesse recebido visto / interesses recebidos vistos | reciprocidade explícita |
| **Interest→Connection** | conexões / pares com interesse | matcher + operação |
| **Connection→Outcome** | outcomes / conexões concluídas | valor real |
| **Median Time to Mutual** | primeiro interesse → mútuo | velocidade |
| **Median Time to Contact** | interesse → primeira abordagem confirmada | operação |
| **Admin Touches/Connection** | ações admin / conexão concluída | fricção interna |
| **Admin Minutes/Connection** | tempo ativo admin / conexão | custo operacional |
| **Backlog Age P90** | idade dos 10% mais antigos | gargalo |
| **Taxonomy Coverage** | itens canonicalizados / total | qualidade semântica |
| **Direct Match Precision** | interesse em matches diretos / exposições diretas | regra principal |
| **Outcome@Algorithm** | outcomes / exposições por versão | evolução do matcher |
| **AI Suggestion Acceptance** | sugestões aceitas / exibidas | utilidade da IA |
| **Message Positive Response** | respostas positivas / envios confirmados | outreach |
| **Follow-up Recovery** | respostas positivas pós-follow-up / follow-ups | recuperação |
| **Qualified Connections/Admin Hour** | conexões úteis / hora ativa | produtividade |
| **Immediate Decision Reversal** | reversões rápidas / decisões | provável acidente/confusão |
| **Reason Lift** | P(resultado|reason) vs. baseline comparável | valor do reason |
| **Low-score Selective Success** | low-score útil de seletivos / low-score expostos | falso negativo |
| **Calibration Error** | ECE/Brier/log loss | calibração |

Métricas adicionais:

- [ ] conversão por step;
- [ ] abandono por campo;
- [ ] tempo por campo;
- [ ] canonicalization rate por origem;
- [ ] decision latency;
- [ ] undo/change rate;
- [ ] impressão por posição;
- [ ] interest/reject por score bucket;
- [ ] mutual/outcome por score bucket;
- [ ] interest/outcome por kind/natureza;
- [ ] interest/outcome por reason;
- [ ] interest/outcome por objetivo declarado;
- [ ] distribuição de `interest_propensity`;
- [ ] concentração de conexões/exposição por participante;
- [ ] saturação;
- [ ] briefing IA → ação útil;
- [ ] custo de IA por conexão útil;
- [ ] erro/retry rate de RPCs;
- [ ] p50/p90/p99 de recompute/rebuild;
- [ ] cobertura de outcomes;
- [ ] missingness/cardinalidade por evento;
- [ ] amostra e intervalo de confiança junto de métricas usadas para reponderar.

## 6.1 Painéis mínimos

### Produto
- QCR;
- funil completo;
- TTFV;
- reciprocidade;
- outcomes.

### Matcher
- exposure por score/rank;
- Interest@3/Reject@3;
- reason lift;
- score buckets;
- algorithm versions;
- calibração;
- low-score residuals.

### Operação
- backlog;
- idade P50/P90;
- tempo para abordagem;
- respostas;
- follow-up;
- conexões/hora;
- touches/minutes por conexão.

### Dados/taxonomia
- cobertura offer/need;
- texto livre recorrente;
- sinônimos;
- relações;
- qualidade/missingness.

---

# 7. Preservar contexto histórico e ground truth

## 7.1 Snapshot append-only da decisão

- [ ] `match_decision_events` ou equivalente;
- [ ] match/profile/decision/origin;
- [ ] algorithm version;
- [ ] score A/B;
- [ ] labels/kind/gap;
- [ ] reasons/pesos ou referência imutável;
- [ ] rank;
- [ ] UI/experiment version;
- [ ] first impression/decision timestamp;
- [ ] objetivo/intenção quando declarados;
- [ ] distinguir participante, staff/admin, automação e backfill;
- [ ] backfill conservador usando `unknown` quando necessário;
- [ ] rebuild futuro não altera interpretação histórica.

## 7.2 Outcomes reais

- [ ] `conversa_realizada`;
- [ ] `conversa_util` quando capturável com baixa fricção;
- [ ] `reuniao_agendada`;
- [ ] `proposta_solicitada`;
- [ ] `negocio_reportado`/parceria;
- [ ] quem reportou + nível de confiança quando necessário;
- [ ] follow-up D+1/D+7/pós-evento de baixa fricção;
- [ ] evitar survey excessivo;
- [ ] medir viés de não resposta antes de tratar outcome reportado como verdade absoluta.

---

# 8. Operação administrativa e WhatsApp

## A01 — `/admin/matches` como fila de próximas ações
- [ ] deixar investigação como modo secundário.

## A02 — ordenação operacional
Ordem inicial sugerida:
1. mútuo ainda não apresentado;
2. resposta positiva aguardando avanço;
3. interesse unilateral com alto potencial;
4. follow-up vencido;
5. abordagem inicial pendente;
6. revisão manual.

## A03 — mostrar “A quer B → abordar B”
- [ ] sem exigir abrir múltiplas telas.

## A04 — uma ação primária contextual por item
- [ ] CTA muda conforme estado.

## A05 — filtros técnicos em “Avançado”
- [ ] caminho principal otimizado para agir, não investigar.

## A06 — estados reais de resposta
- [ ] `sem_abordagem`;
- [ ] `abordado`;
- [ ] `aguardando_resposta`;
- [ ] `respondeu_sim`;
- [ ] `respondeu_nao`;
- [ ] `sem_resposta`;
- [ ] `followup_pendente`;
- [ ] `encerrado`.

## A07 — follow-up com prazo
- [ ] vencimento e próxima ação explícitos.

## A08 — idade do interesse
- [ ] p50/p90 e badge operacional.

## A09 — idade da última abordagem
- [ ] distinguir primeira abordagem/follow-up.

## A10 — próximo item automático
- [ ] após ação concluída, oferecer/abrir próxima prioridade.

## A11 — revisão automática após ação suficiente
- [ ] evitar clique redundante de “revisado”.

## A12 — atalhos de teclado
- [ ] somente para operador intensivo; manter acessibilidade.

## A13 — IA somente quando incremental
- [ ] briefing sob demanda;
- [ ] medir briefing → ação útil e custo/conexão.

## A14 — pré-gerar mensagem sem side effect
- [ ] geração não conta como outreach;
- [ ] não registrar contato antes de ação real.

## A15 — visão “Só preciso agir nestes N”
- [ ] foco em backlog acionável.

## A16 — cockpit único equipe + admin
- [ ] mesma superfície operacional para o cenário atual;
- [ ] preservar camada de autorização para futura diferenciação de papéis;
- [ ] compartilhar fila/estado;
- [ ] investigação avançada como modo secundário;
- [ ] medir navegações/toques/tempo antes/depois.

## A17 — fila de low-score residuals para curadoria
- [ ] revisão de falsos negativos de alta evidência.

### WhatsApp

## W01 — separar eventos de mensagem
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

## W02 — registrar resposta positiva/negativa/sem resposta
## W03 — copiar não é contato realizado
## W04 — RPC falha deve falhar; nunca inventar sucesso
## W05 — primeiro contato só após envio confiável
## W06 — atribuir conversa ao match
## W07 — histórico compacto da pessoa
## W08 — “sim” avança sem passos redundantes
## W09 — “não” encerra fila ativa preservando histórico
## W10 — follow-up manual contextual
## W11 — mensagem pela perspectiva correta do alvo
## W12 — medir desempenho por template/version

Para W01–W12:
- [ ] logs append-only;
- [ ] operador/canal/template/match/profile/timestamp;
- [ ] estado derivado separado do log bruto;
- [ ] `send_confirmed` como denominador de response rate.

---

# 9. Experiência do participante pós-match

## P01 — “Suas 3 melhores oportunidades agora”
- [ ] somente após tracking de impressão/rank.

## P02 — resto sob “Ver mais oportunidades”
- [ ] medir se reduz carga sem ocultar valor.

## P03 — seção “Querem falar com você”
- [ ] alta prioridade visual.

## P04 — interesse recebido vira CTA dominante
- [ ] quando houver interesse unilateral da outra parte.

## P05 — copy “X já quer se conectar com você. Faz sentido?”
- [ ] medir Inbound Conversion.

## P06 — separar “Meus interesses” e “Interesse em mim”
## P07 — testar triagem um match por vez
## P08 — permitir comparar duas oportunidades semelhantes
## P09 — uma razão principal + detalhes sob demanda
## P10 — remover jargão técnico do matcher na superfície principal
## P11 — explicar o que acontece após “Tenho interesse”
## P12 — expectativa operacional explícita
- [ ] “aguardando resposta”;
- [ ] “ACIRV fará a aproximação”.

## P13 — feedback opcional do motivo do interesse
- [ ] um toque, não bloqueante.

## P14 — undo imediato mensurável
- [ ] evitar modal obrigatório em todo clique antes de existir evidência de acidente.

---

# 10. Onboarding e perfil

## U01 — Instagram enrichment assíncrono
- [ ] não bloquear avanço;
- [ ] estados loading/sucesso/falha;
- [ ] fallback sem Instagram.

## U02 — autofill de segmento/resumo/tipo
- [ ] somente alta confiança;
- [ ] sempre editável/confirmável;
- [ ] medir aceitação.

## U03 — testar porte opcional inicialmente
## U04 — testar tipo empresarial opcional inicialmente
## U05 — progressive profiling
- [ ] perguntar detalhes quando houver valor demonstrável.

## U06 — explicar por que cada campo existe
## U07 — remover campos sem efeito comprovado do caminho crítico
## U08 — autosave silencioso e recuperação robusta
## U09 — estimativa de tempo restante
## U10 — avaliar resumo empresarial como campo semântico central
## U11 — objetivo principal na feira
Opções iniciais:
- comprar/contratar;
- vender/prospectar;
- parceria;
- buscar fornecedores;
- indicação/canal;
- networking;
- explorar oportunidades.

Regras U11:
- [ ] persistir por evento;
- [ ] pode permitir múltiplos com um principal;
- [ ] começar como dimensão analítica, não peso automático;
- [ ] medir ganho incremental além do v2.4.

## U12 — exemplos personalizados por segmento
## U13 — refinamento opcional após primeira sessão de matches
- [ ] não sobrecarregar cadastro inicial.

---

# 11. Taxonomia, ofertas e necessidades

## T01 — canonicalizar texto idêntico/similar com segurança
- [ ] exato/único pode ser automático;
- [ ] similaridade deve começar como sugestão.

## T02 — “Você quis dizer X?”
- [ ] registrar candidato/confiança/escolha/origem.

## T03 — popular sinônimos de alta confiança
## T04 — criar relações complementares NEED → OFFER de alta confiança
- [ ] primeiro lote 20–40, não centenas especulativas.

## T05 — revisar itens `kind = both`
## T06 — medir e promover termos livres recorrentes
## T07 — sugestão semântica durante digitação
## T08 — aprender candidatos a sinônimos a partir de correções humanas
## T09 — separar produto/serviço/parceria/distribuição quando útil
## T10 — auditar default semântico de necessidades manuais
## T11 — prioridade principal mais explícita
## T12 — explicar prioridade como “o que mais quero resolver”

Governança:

- [ ] meta inicial ≥90% de itens confirmados canonicalizados antes de depender do grafo;
- [ ] acompanhar offer e need separadamente;
- [ ] alertar queda de cobertura;
- [ ] medir matches/interesses/mutual/outcomes por relação;
- [ ] rationale humana em relações efetivas;
- [ ] desativação + rebuild rastreável;
- [ ] export/versionamento da curadoria;
- [ ] evitar sinônimos amplos;
- [ ] testes de fronteira de palavra;
- [ ] política explícita para item desativado.

---

# 12. Matcher, explicabilidade e evolução baseada em evidência

## M01 — separar força de natureza
## M02 — classificar natureza

Naturezas candidatas:

```text
venda/prospecção
compra/fornecedor
parceria
indicação/canal
networking estratégico
exploratória
```

## M03 — persistir exatamente need ↔ offer que gerou sinal
## M04 — exibir principais overlaps comerciais
## M05 — auditar/reduzir confiança de sinais genéricos sem evidência comercial direta
## M06 — calibrar pesos usando decisões reais, controlando ruído
## M07 — calibrar com conexões/outcomes, não apenas clique
## M08 — testar peso de prioridade por outcome
## M09 — investigar assimetria comprador/fornecedor
## M10 — testar penalização de assimetria somente offline antes de produção
## M11 — disponibilidade temporal como feature futura
## M12 — diversidade no Top-N
## M13 — evitar monopólio de exposição por empresa popular
## M14 — medir saturação de participante
## M15 — identificar sinais associados a negócio real
## M16 — benchmark artificial permanente de pares bons/ruins/fronteiriços

## M17 — valor marginal dos reason codes

- [ ] lift bruto e ajustado;
- [ ] reproduzir +55 e +25 em novos dados;
- [ ] medir `perfil_desejado` com/sem evidência comercial;
- [ ] testar prioridade, cidade, recência, segmentos e target profile;
- [ ] interações entre reasons;
- [ ] N + intervalo de confiança;
- [ ] comparar clique e outcome.

## M18 — dual score offline antes de um número único

```text
commercial_score
  oferta ↔ necessidade
  prioridade
  relações NEED → OFFER

networking_score
  perfil desejado
  segmento/tipo/porte-alvo
  afinidade estratégica
```

- [ ] replay sem alterar produção;
- [ ] medir por intenção declarada;
- [ ] testar UI separando os eixos;
- [ ] só compor se houver justificativa empírica.

## M19 — propensão individual regularizada

- [ ] não usar `interesses/decisões` bruto com N pequeno;
- [ ] shrinkage/Bayes ou equivalente;
- [ ] prior global/do evento para cold start;
- [ ] tamanho da amostra + incerteza;
- [ ] snapshot da propensão anterior à decisão;
- [ ] uso inicial para interpretação/calibração, não punição no ranking.

## M20 — target profile parcial
- [ ] testar 1/3, 2/3, 3/3 como feature offline.

## M21 — objetivo declarado × natureza do match
- [ ] medir interação.

## M22 — modelo hierárquico por participante/evento
- [ ] avaliar antes de ML excessivamente complexo.

### Low-score residuals

- [ ] score `<40` + interesse de seletivo;
- [ ] prioridade maior se mutual;
- [ ] prioridade máxima se conversa/reunião/proposta/negócio;
- [ ] reconstruir reasons, offer, need, target, taxonomia, intenção e exposição;
- [ ] classificar causa: cobertura, sinônimo, relação, target parcial, informação externa, ruído, UI;
- [ ] simular quantos residuals nova relação/sinônimo recuperaria antes de ativar;
- [ ] manter controle de low-score rejeitados;
- [ ] revisão humana amostral com registro de concordância.

### Reponderação v2.5

- [ ] não alterar +55 apenas com a amostra atual;
- [ ] +25 é hipótese prioritária de auditoria, não erro comprovado;
- [ ] `perfil_desejado` baixo em clique não prova peso negativo causal;
- [ ] replay + holdout + nova algorithm version obrigatórios;
- [ ] v2.4 precisa continuar reproduzível e disponível para rollback.

---

# 13. Confiança, IA e linguagem

## C01 — renomear camada determinística para “Leitura do Match” ou equivalente honesto
## C02 — nunca afirmar fatos comerciais ausentes dos dados
## C03 — cada razão ancorada em evidência visível
## C04 — mostrar “Você procura X · esta empresa oferece Y”
## C05 — separar fato, inferência e sugestão
## C06 — indicar quando houve geração real por modelo
## C07 — feedback opcional “Esse motivo faz sentido?”
## C08 — usar feedback para detectar regras ruins, não como ground truth isolado

Tarefas associadas:

- [ ] `is_ai_enhanced` só verdadeiro com enriquecimento generativo real;
- [ ] remover claims como “tomador de decisão”, “entrega imediata” etc. sem evidência;
- [ ] remover fallback genérico de alta compatibilidade sem reasons;
- [ ] score não deve ser apresentado como porcentagem/probabilidade enquanto não calibrado;
- [ ] versionar copy/UX quando comparações históricas dependerem dela;
- [ ] medir razões rejeitadas e seu lift real.

---

# 14. Viés de ranking, exploração e diversidade

- [ ] medir exposição por rank antes de interpretar interesse;
- [ ] normalizar análises por exposição;
- [ ] não inferir rejeição para candidato não visto;
- [ ] evitar Top-N com empresas quase idênticas quando isso reduzir cobertura útil;
- [ ] medir concentração de exposição;
- [ ] saturação só vira penalidade se dados mostrarem necessidade;
- [ ] exploração controlada apenas entre candidatos plausíveis e próximos;
- [ ] registrar probabilidade de seleção/exposição para análise contrafactual (IPS ou equivalente);
- [ ] guardrails impedem exibição claramente inadequada;
- [ ] comparar ranking atual/alternativo por QCR, cobertura, diversidade e falsos positivos.

---

# 15. Replay, calibração e Matcher v3

## Replay offline obrigatório

- [ ] reconstruir v2.4 reproduzivelmente;
- [ ] comparar contra baseline de propensão;
- [ ] AUC;
- [ ] PR-AUC;
- [ ] Brier/log loss;
- [ ] ECE/curva de calibração quando probabilidades existirem;
- [ ] split temporal;
- [ ] validação entre eventos quando possível;
- [ ] group holdout/leave-participants-out quando apropriado;
- [ ] nenhuma feature usa futuro.

## Matcher v3 — somente após outcomes suficientes

```text
features determinísticas v2.4
+ taxonomia/grafo
+ semântica
+ commercial_score / networking_score
+ target profile
+ objetivo declarado
+ contexto da dupla
+ propensão regularizada
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
- [ ] terceira previsão para valor da dupla;
- [ ] manter reasons determinísticos como camada explicável;
- [ ] não treinar ação administrativa como intenção orgânica;
- [ ] calibrar probabilidades e incerteza;
- [ ] comparar sempre contra v2.4 e regras simples;
- [ ] rollback simples;
- [ ] não promover ML sem ground truth suficiente.

---

# 16. Engenharia, testes, performance e reprodutibilidade

## R06 — CI
- [ ] lint → typecheck → unit → integration;
- [ ] migrations/RPCs cobertas por contratos e testes executáveis.

## R07 — harness reproduzível
- [ ] remover dependência implícita de `psql` no PATH;
- [ ] Supabase/Postgres controlado;
- [ ] diferenciar harness failure de product failure.

## R08 — decompor `equipe.tsx`
- [ ] módulos por fluxo/domínio;
- [ ] reduzir acoplamento da rota.

## R09 — decompor `participar.tsx`
- [ ] steps/máquina de estados mais explícitos;
- [ ] comportamento preservado por testes.

## Dataset analítico reproduzível

- [ ] `scripts/export-matcher-analysis.*` ou equivalente;
- [ ] uma linha/perspectiva A→B/B→A;
- [ ] score/label/version/reasons;
- [ ] decisão + origem;
- [ ] perfil comercial anonimizado;
- [ ] ofertas/necessidades/taxonomia;
- [ ] conexão/outcomes;
- [ ] generated_at/decided_at;
- [ ] flag de snapshot original vs. reconstruído;
- [ ] allowlist explícita;
- [ ] sem telefone/e-mail/tokens;
- [ ] IDs anonimizados de forma estável no snapshot;
- [ ] data dictionary;
- [ ] cardinalidade/missingness automáticas;
- [ ] reconciliação reasons ↔ score;
- [ ] política segura de armazenamento/expiração;
- [ ] fixtures sintéticas separadas de produção.

## Performance

- [ ] benchmark 100 perfis;
- [ ] 250;
- [ ] 500;
- [ ] 1.000;
- [ ] medir tempo, queries, locks e impacto de rebuild;
- [ ] definir SLO antes de otimizar;
- [ ] job assíncrono/idempotente se rebuild síncrono virar gargalo.

---

# 17. Matriz permanente de provas

Cobrir automaticamente:

- [ ] direto puro +55;
- [ ] inverso puro +25;
- [ ] bidirecional;
- [ ] prioridade direta;
- [ ] segmentos diferentes +5;
- [ ] cidade e recência;
- [ ] target 1/2/3 critérios;
- [ ] target parcial = zero no v2.4;
- [ ] target parcial experimental no replay;
- [ ] target mútuo;
- [ ] relação peso 39 = zero;
- [ ] peso 40 = +12;
- [ ] peso 100 = +30;
- [ ] múltiplas relações → maior conta conforme contrato atual;
- [ ] relação unidirecional não cria inversa;
- [ ] sinônimo explícito;
- [ ] igualdade por taxonomy id;
- [ ] texto livre;
- [ ] falso positivo de substring;
- [ ] eventos diferentes nunca cruzam;
- [ ] conexão histórica preservada em rebuild;
- [ ] decisão histórica preserva snapshot;
- [ ] RPC de outreach não cruza evento/perfil;
- [ ] card fora da viewport não gera impressão;
- [ ] rerender não duplica impressão;
- [ ] undo não apaga decisão anterior;
- [ ] ação admin não vira intenção orgânica;
- [ ] propensão usa apenas passado;
- [ ] split temporal não consulta futuro;
- [ ] dataset analítico não contém PII proibida;
- [ ] dual score preserva reasons separados.

---

# 18. Cobertura integral da auditoria de hipóteses

A análise original afirmou “72 hipóteses”, mas a enumeração codificada contém **112 hipóteses originais**:

```text
U01–U12  = 12
T01–T12  = 12
M01–M16  = 16
P01–P12  = 12
C01–C08  = 8
A01–A16  = 16
W01–W12  = 12
D01–D12  = 12
R01–R12  = 12
TOTAL     = 112
```

Todas as 112 estão representadas neste roadmap. Além delas, a auditoria comportamental adicionou D13, U13, P13–P14, A17, M17–M22 e itens de infraestrutura analítica.

## 18.1 Mapa de cobertura

| Família | IDs originais | Seção principal |
| --- | --- | --- |
| Onboarding | U01–U12 | §10 |
| Taxonomia | T01–T12 | §11 |
| Matcher | M01–M16 | §12/§14/§15 |
| Participante | P01–P12 | §9 |
| Confiança | C01–C08 | §13 |
| Administração | A01–A16 | §8 |
| WhatsApp | W01–W12 | §8 |
| Dados | D01–D12 | §5/§6/§7 |
| Engenharia | R01–R12 | §4/§16/§17 |

Regra de governança:

- [ ] uma hipótese não pode ser removida silenciosamente;
- [ ] se descartada, registrar decisão + evidência + data;
- [ ] se promovida, adicionar métrica primária, guardrail e critério de aceite;
- [ ] se implementada, marcar `[x]` apenas após Definition of Done;
- [ ] manter rastreabilidade ID → implementação → experimento → métrica → decisão.

---

# 19. Ciclo padrão para qualquer hipótese

Toda hipótese nova ou já listada deve seguir:

```text
1. formular hipótese
2. definir usuário/fluxo afetado
3. definir baseline
4. escolher métrica primária
5. escolher guardrails
6. estimar SudoScore
7. implementar atrás de versão/flag quando necessário
8. registrar exposição real
9. medir resultado
10. decidir: promover / iterar / reverter / arquivar
11. registrar decisão no roadmap/docs
```

Template mínimo:

```text
Hipótese:
Problema:
Usuário afetado:
Mudança proposta:
Métrica primária:
Guardrails:
Baseline:
Target:
SudoScore:
Dependências:
Experiment/feature version:
Critério de sucesso:
Critério de rollback:
Resultado:
Decisão:
```

---

# 20. Ordem recomendada de execução

```text
ONDA 1 — CONFIANÇA / P0
R01/R02/R03 isolamento de outreach
R04 contato sem side effect
R10/R11 env/segredos
W01–W05 semântica real do WhatsApp
R05 atomicidade perfil+contato
R12 invariantes multi-evento

ONDA 2 — MENSURAÇÃO E QUALIDADE DO LABEL
D01 impressão real
D02/D03 onboarding e tempo
D04–D09 funil + esforço admin
D13 undo + semântica da decisão
snapshot append-only
outcomes reais
D10/D11 cohorts e comparação
D12 experiment framework
dataset analítico reproduzível
SudoExpo Intelligence V1 (`/admin/inteligencia`) — superfície oficial para observar a nova telemetria

ONDA 3 — THROUGHPUT OPERACIONAL
W02/A06/A07 estados de resposta/follow-up
A01–A04 Next Best Action
A08–A15 redução de fricção
P03/P04/P05 interesse recebido
A16 cockpit único

ONDA 4 — QUALIDADE SEMÂNTICA E UX
T01/T02 canonicalização
M03/M04/C04 reasons exatos
C01–C08 confiança/IA
U11 objetivo principal
T03–T12 taxonomia
M01/M02 natureza do match
M17 auditoria dos reasons
M18 dual score offline
P01/P02 Top 3
P06–P14 simplificação do participante
U01–U13 onboarding progressivo
Intelligence V1.1 — segment intelligence (heatmap segmento × segmento) + cross-filter/drilldown entre gráficos

ONDA 5 — INTELIGÊNCIA ADAPTATIVA
M19 propensão regularizada
M06/M07 replay/calibração
low-score residual mining
M20–M22 experimentos estruturais
exploração controlada
Matcher v3 somente com labels/outcomes suficientes
```

---

# 21. Definition of Done

Uma tarefa só recebe `[x]` quando:

1. código está revisável e `main` permanece funcional;
2. critérios de aceite estão explícitos;
3. migration é idempotente e possui RLS/grants corretos quando aplicável;
4. testes/provas relevantes existem;
5. validação executável foi rodada quando o ambiente permite;
6. ausência de regressão em login, onboarding, participante, staff/admin e matcher foi verificada;
7. documentação canônica reflete comportamento real;
8. analytics necessário existe antes de declarar sucesso experimental;
9. mudança de score/semântica possui algorithm version adequada;
10. mudança relevante de UX possui UI/experiment version quando comparação histórica depender dela;
11. não existe sucesso silencioso que corrompa métricas;
12. impacto é medido em QCR, funil e/ou esforço operacional;
13. análise de peso/modelo declara N, período, coorte, exposição, origem e incerteza;
14. feature comportamental preditiva usa somente informação passada;
15. ganho de clique não compensa piora ou ausência de ganho em outcomes/guardrails;
16. coorte pequena é hipótese, não verdade;
17. P0 possui teste negativo explícito;
18. evento analítico novo possui schema/documentação;
19. hipótese implementada possui resultado registrado depois de janela suficiente;
20. rollback é possível para mudança de matcher/experimento de alto impacto.

---

# 22. Histórico consolidado de entregas

## Multi-eventos
- [x] Café Entre Amigos separado;
- [x] SudoExpo 2026 ativa;
- [x] lookup/check-in;
- [x] isolamento do matcher;
- [x] seletor/contexto administrativo;
- [x] sandbox/reset.

## Matcher/taxonomia
- [x] contrato v2.4 documentado;
- [x] governança de revisão;
- [x] rebuild administrativo;
- [x] NEED → OFFER corrigido/documentado;
- [x] canonicalização conservadora;
- [x] incidente de duplicidade coberto;
- [x] baseline comportamental real auditado.

## Participante
- [x] fluxo veterano;
- [x] ranking por sinergia mútua;
- [x] resumo comercial;
- [x] suporte por WhatsApp;
- [x] onboarding em duas etapas.

## Operação/admin
- [x] fila operacional;
- [x] auditoria de matches;
- [x] briefing comercial;
- [x] mensagem de WhatsApp;
- [x] confirmação rápida;
- [x] logging inicial de outreach — **semanticamente provisório até W01–W05**.

---

# 23. Princípio arquitetural a preservar

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
eixos comercial/networking mensuráveis
        ↓
exposição real mensurada
        ↓
decisão preservada como snapshot + semântica/origem
        ↓
operação orientada à próxima ação
        ↓
outcome real
        ↓
análise reproduzível + replay/calibração
        ↓
modelo adaptativo somente quando superar baselines com segurança
```

Circuito que precisa ser fechado:

```text
SudoExpo sugere
→ pessoa vê
→ pessoa entende por quê
→ pessoa decide
→ sabemos o que a decisão significa
→ outra responde
→ ACIRV conecta
→ algo acontece
→ outcome é registrado
→ SudoExpo aprende sem confundir clique com verdade
```

**O produto deve evoluir quando o ciclo produz evidência, não quando apenas produz mais features.**

---

# 24. Mapa de Conexões — Graph View estilo Obsidian

Objetivo: criar uma nova visualização administrativa `/admin/graph` em formato de rede force-directed, semelhante ao Graph View do Obsidian, para visualizar participantes, matches e estados de interesse do evento selecionado.

## 24.1 Semântica visual

Cada nó representa uma pessoa cadastrada no SudoExpo Match.

Cada aresta representa um match ativo encontrado pelo matcher entre dois perfis.

Estados das arestas:

- [ ] azul `#1b26ae` — nenhuma das partes tomou decisão;
- [ ] verde `#27e300` — exatamente uma das partes marcou `interesse`;
- [ ] laranja `#ff7c31` — ambas as partes marcaram `interesse` (interesse mútuo);
- [ ] cinza discreto, baixa opacidade — houve decisão sem interesse, incluindo `agora_nao` ou estados mistos; deve poder ser ocultado por filtro para não confundir rejeição com ausência de decisão.

Regras:

- [ ] `match_decisions` é a fonte autoritativa para derivar o estado da aresta;
- [ ] `agora_nao` e `sem_decisao` nunca contam como interesse;
- [ ] somente `matches.is_active = true` do evento selecionado entram no grafo;
- [ ] nenhuma informação privada de contato pode trafegar no payload do grafo.

## 24.2 Interação do grafo

- [ ] zoom e pan;
- [ ] arrastar nós;
- [ ] física force-directed semelhante ao Obsidian;
- [ ] hover em um nó destaca o nó, seus vizinhos e arestas relacionadas, esmaecendo o restante;
- [ ] clique no nó abre o detalhe do participante reutilizando `ParticipantDetailSheet`;
- [ ] clique na aresta abre o detalhe do match reutilizando `MatchDetailSheet`;
- [ ] nó deve exibir nome/empresa em tooltip ou detalhe contextual;
- [ ] tamanho do nó proporcional ao grau/número de matches visíveis;
- [ ] cor do nó pode representar segmento, mantendo a cor das arestas exclusivamente para estado da relação;
- [ ] oferecer atalho do participante para `/admin/matches` já filtrado pela pessoa;
- [ ] nós sem arestas após filtros ficam ocultos por padrão, com opção de mostrar isolados.

## 24.3 Filtros

Filtros refletidos na URL para manter estado compartilhável/recarregável:

- [ ] busca por nome/empresa;
- [ ] estado da relação: sem decisão, interesse unilateral, mútuo e recusado/misto;
- [ ] score mínimo;
- [ ] score máximo quando útil para investigação;
- [ ] segmento;
- [ ] somente duplas com conexão;
- [ ] somente matches revisados;
- [ ] mostrar/ocultar nós isolados;
- [ ] evento selecionado via `AdminEventContext` / `EventSelector`.

Casos analíticos prioritários:

- [ ] `interesse` com score baixo para investigar falsos negativos do matcher;
- [ ] score alto sem interesse para investigar falsos positivos;
- [ ] interesse mútuo para visualizar conexões efetivamente validadas por ambos;
- [ ] concentração de matches por participante para identificar hubs;
- [ ] pontes entre segmentos e clusters de oportunidade.

## 24.4 Payload e RPC dedicada

Não reutilizar `admin_list_matches` como fonte principal do grafo, pois a RPC atual é paginada e retorna payload mais pesado orientado à lista/auditoria.

Criar RPC dedicada, read-only, por exemplo:

```text
admin_match_graph(_event_id text, filtros...)
```

Contrato sugerido:

```text
nodes
  profile_id
  name
  company
  segment_id
  segment_label
  degree

edges
  match_id
  a_profile_id
  b_profile_id
  score_for_a
  score_for_b
  decision_a
  decision_b
  interest_state
  connection_status
  reviewed
  has_briefing

meta
  total_nodes
  total_edges
  no_decision
  single_interest
  mutual
  declined_or_mixed
```

`interest_state`:

```text
none
single_interest
mutual
declined
```

Requisitos da RPC:

- [ ] `SECURITY DEFINER` seguindo o padrão seguro das RPCs administrativas existentes;
- [ ] autorização por papel no evento;
- [ ] isolamento obrigatório por `event_id`;
- [ ] retornar payload mínimo necessário;
- [ ] não retornar telefone, e-mail, código, token ou outro dado privado;
- [ ] índices/queries adequados para milhares de arestas;
- [ ] uma única requisição para carregar o subgrafo filtrado;
- [ ] cache curto via TanStack Query.

## 24.5 Frontend

Biblioteca recomendada para a primeira versão: `react-force-graph-2d`, usando canvas + layout de força.

Motivo:

- integração direta com React;
- comportamento visual semelhante ao Obsidian;
- zoom/pan/drag/hover/click prontos;
- desenho customizado de nós e arestas;
- escala atual de centenas de nós e poucos milhares de arestas é pequena para canvas;
- menor complexidade que Sigma.js/Graphology para a necessidade atual.

Reavaliar Sigma.js + Graphology somente se o volume crescer para dezenas de milhares de nós/arestas ou se análises avançadas de rede passarem a exigir WebGL/modelo de grafo dedicado.

Arquivos previstos:

```text
src/routes/admin_.graph.tsx
src/features/admin/MatchGraphCanvas.tsx
src/features/admin/useAdminMatchGraph.ts
src/features/admin/graphSchemas.ts
src/features/admin/graphPresentation.ts
src/features/admin/graphUrlState.ts
supabase/migrations/<timestamp>_admin_match_graph.sql
src/__tests__/impl27-admin-graph.test.ts
scripts/admin-match-graph-proof.sql
```

Alterações previstas em arquivos existentes:

- [ ] adicionar entrada “Mapa de conexões” à navegação administrativa;
- [ ] tornar `ParticipantDetailSheet` reutilizável/controlável pelo Graph View sem regressão da tela de participantes;
- [ ] tornar `MatchDetailSheet` reutilizável/controlável pelo Graph View sem regressão da auditoria de matches;
- [ ] adicionar dependências necessárias ao `package.json`/lockfile;
- [ ] carregar o componente de canvas apenas no cliente quando necessário para preservar SSR.

## 24.6 Painel contextual do mapa

Exibir contadores do subgrafo atual:

```text
pessoas visíveis
matches visíveis
sem decisão
interesse unilateral
interesse mútuo
recusado/misto
```

Ao selecionar uma pessoa, exibir pelo menos:

```text
nome
empresa
segmento
matches visíveis
grau total quando disponível
interesses enviados
interesses recebidos
interesses mútuos
```

Métricas avançadas futuras, somente quando houver utilidade operacional/analítica comprovada:

- centralidade;
- hubs;
- comunidades/clusters;
- pontes entre segmentos;
- densidade de rede;
- concentração de exposição/conexões.

## 24.7 Uso como laboratório visual do matcher

O Graph View deve permitir investigação de erros do matcher, e não ser apenas uma visualização estética.

Perguntas que a ferramenta deve ajudar a responder:

- [ ] onde existem interesses humanos em duplas com score baixo?;
- [ ] quais reasons aparecem com frequência nesses falsos negativos potenciais?;
- [ ] quais matches de score alto são ignorados ou rejeitados?;
- [ ] determinados segmentos formam clusters que a taxonomia atual não captura bem?;
- [ ] existem participantes que funcionam como hubs ou pontes comerciais?;
- [ ] há concentração excessiva de matches em poucas pessoas?;
- [ ] mudanças futuras de matcher alteram a topologia da rede de forma coerente?;

Usos prioritários:

```text
score baixo + interesse
→ candidato a falso negativo

score alto + agora_não após exposição
→ candidato a falso positivo

interesse mútuo
→ evidência mais forte que interesse unilateral

outcome comercial futuro
→ ground truth mais forte que interesse mútuo
```

O mapa não deve promover automaticamente alterações de peso. Ele serve para descoberta, auditoria e geração de hipóteses que ainda precisam passar por replay, exposição correta e outcomes conforme as regras deste roadmap.

## 24.8 Testes e critérios de aceite

- [ ] derivação correta das quatro categorias de aresta;
- [ ] `interesse/interesse` = laranja;
- [ ] `interesse/sem_decisao` = verde;
- [ ] ausência de decisões = azul;
- [ ] qualquer combinação sem `interesse` mas com `agora_nao` = cinza/declined;
- [ ] isolamento entre eventos;
- [ ] payload sem PII privada;
- [ ] filtros produzem o subgrafo esperado;
- [ ] filtros persistem na URL;
- [ ] clique em nó abre participante correto;
- [ ] clique em aresta abre match correto;
- [ ] hover destaca vizinhança sem mutar os dados;
- [ ] tela funciona com o volume atual e possui benchmark mínimo com 100, 250, 500 e 1.000 perfis quando datasets de teste permitirem;
- [ ] `npm run typecheck` aprovado;
- [ ] testes Vitest relevantes aprovados;
- [ ] prova SQL da RPC executável;
- [ ] nenhuma alteração nos pesos, reasons ou `algorithm_version` do matcher;
- [ ] nenhuma regressão nas telas atuais de participantes e auditoria de matches.

## 24.9 Evolução futura — Network Intelligence

Após a primeira versão estável, avaliar:

- [ ] filtros por `algorithm_version` para comparar topologias;
- [ ] modo de comparação antes/depois de uma versão do matcher;
- [ ] heatmap de segmentos;
- [ ] clusterização/comunidades;
- [ ] centralidade e bridges;
- [ ] destacar low-score residuals automaticamente;
- [ ] destacar high-score rejects automaticamente;
- [ ] sobrepor outcomes comerciais;
- [ ] modo temporal mostrando a rede evoluindo durante o evento;
- [ ] export analítico anonimizado para estudos offline;
- [ ] usar o mapa como superfície de curadoria de taxonomia/relações sem misturar visualização com alteração automática do matcher.

**Princípio:** o Graph View deve transformar o banco relacional do SudoExpo Match em uma representação visual investigável da rede comercial, sem confundir visualização com verdade causal e sem alterar o matcher apenas por intuição visual.
