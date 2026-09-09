# TESTING — SudoExpo Match

## 1. Políticas de Evidência e Validação
Seguindo o Playbook Quality-First:
- **Build verde ≠ Software correto**: Apenas compilar não garante regras de negócio.
- **Lint e Typecheck**: Garantem conformidade estrutural e contratos de tipos TypeScript.
- **Testes Unitários**: Garantem regras isoladas de domínio (ex: hashing de telefone, normalização, filtros de matching, serialização de estado).
- **Testes de Integração / RPC**: Validam o comportamento real de procedimentos armazenados e isolamento entre eventos.
- **Validação E2E / Manual**: Inspeção dos fluxos no navegador via preview ou dev server.

## 2. Matriz de Testes para Multi-Evento
1. **Teste de Isolamento de Matchmaking**:
   - Criação de Perfil A no evento `cafe-entre-amigos-ago-2026`.
   - Criação de Perfil B no evento `sudoexpo-2026`.
   - Executar recálculo de matches para ambos: Provar que NENHUM match é gerado entre A e B.
2. **Teste de Check-in de Perfil Pré-existente**:
   - Perfil A (do Café) executa check-in na SudoExpo.
   - Um registro ativo de Perfil A é criado/ativado em `sudoexpo-2026`.
   - Recálculo de matches agora gera conexões compatíveis entre Perfil A e Perfil B na SudoExpo 2026.
3. **Teste de Não-Regressão de Contatos Privados**:
   - O telefone de Perfil A continua protegido por hash e seguro em `private.profile_contacts`.
4. **Teste de Governança do Admin**:
   - Alternar evento no Admin altera corretamente os totais de participantes, matches e conexões exibidos.
