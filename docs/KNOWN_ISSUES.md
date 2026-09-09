# KNOWN_ISSUES — SudoExpo Match

## 1. Suíte de Testes Legada Acoplada ao psql Local
- **Problema**: Alguns arquivos de teste em `src/__tests__` (ex: `seg2-grants.test.ts`, `seg3-realtime-isolation.test.ts`) realizam chamadas diretas com `execSync('psql ...')`.
- **Status**: Classificado como limitação de harness local (harness failure vs product failure).
- **Ação**: Em ambientes de desenvolvimento sem PostgreSQL cliente instalado no PATH do Windows, esses testes específicos de harness de infraestrutura falham ao invocar `psql`. Os testes de produto que não usam `psql` rodam normalmente.

## 2. Hardcoded EVENT_ID no Frontend
- **Problema**: Vários componentes administrativos importavam diretamente `EVENT_ID` de `@/config/event`.
- **Status**: Em resolução através do novo Roadmap de Multi-Eventos (introdução de contexto e seletor de evento).
