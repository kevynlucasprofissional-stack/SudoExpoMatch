# KNOWN_ISSUES — SudoExpo Match

## 1. Suíte de Testes Legada Acoplada ao psql Local
- **Problema**: Alguns arquivos de teste em `src/__tests__` (ex: `seg2-grants.test.ts`, `seg3-realtime-isolation.test.ts`) realizam chamadas diretas com `execSync('psql ...')`.
- **Status**: Classificado como limitação de harness local (harness failure vs product failure).
- **Ação**: Em ambientes de desenvolvimento sem PostgreSQL cliente instalado no PATH do Windows, esses testes específicos de harness de infraestrutura falham ao invocar `psql`. Os testes de produto que não usam `psql` rodam normalmente.

## 2. Hardcoded EVENT_ID no Frontend
- **Problema**: Vários componentes administrativos importavam diretamente `EVENT_ID` de `@/config/event`.
- **Status**: Em resolução através do novo Roadmap de Multi-Eventos (introdução de contexto e seletor de evento).

## 3. Gravação de perfil e contato em RPCs separadas
- **Problema**: no onboarding, `save_own_profile_v2` e a gravação do contato (WhatsApp) são chamadas distintas. Se o perfil grava e o contato falha, o resultado é parcial.
- **Mitigação atual**: o rascunho é preservado e a UI oferece repetir apenas a etapa de contato.
- **Status**: risco residual aceito e documentado no incidente de cadastro de 09/09/2026.

## 4. Texto livre não é canonicalizado para item de taxonomia
- **Problema**: uma necessidade/oferta digitada livremente pode ter label idêntico a um item ativo do catálogo e ainda assim ser salva com `taxonomy_item_id` nulo, perdendo sinal no matcher.
- **Status**: melhoria separada; não tratada na correção do incidente de 09/09/2026 porque altera a semântica do matching.
