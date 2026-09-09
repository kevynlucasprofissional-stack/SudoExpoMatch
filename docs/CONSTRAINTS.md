# CONSTRAINTS — SudoExpo Match

## 1. Restrições de Plataforma e Infraestrutura
1. **Supabase & Lovable**:
   - As migrações devem ser compatíveis com PostgreSQL 14.5+ / 15.
   - Scripts de migração SQL ficam em `supabase/migrations/`.
   - O git não deve sofrer force pushes ou rebase de commits remotos para preservar o histórico do editor Lovable.
2. **Ambiente Local**:
   - Node.js e Bun presentes no ambiente Windows.
   - Não depender de comandos ausentes no ambiente cliente (ex: assunções de `psql` direto no PATH de produção).

## 2. Restrições de Segurança e Privacidade
1. **Dados de Contato (LGPD)**:
   - O telefone do participante NUNCA deve ser armazenado em texto legível desprotegido em tabelas públicas.
   - A tabela `private.profile_contacts` protege o telefone com SHA-256 (`phone_hash`) e criptografia/acesso restrito.
   - Apenas a equipe autorizada ou participantes com match mútuo consentido podem revelar dados de contato via RPCs `reveal_contact_for_match` ou `staff_reveal_contact_for_match`.
2. **Controle de Acesso (RLS & RPCs)**:
   - Todas as tabelas públicas continuam com RLS habilitada.
   - Mutação em massa ou administrativas ocorrem exclusivamente via RPCs com `SECURITY DEFINER` e validação explícita de `has_event_role(_event_id, 'admin' | 'staff', auth.uid())`.

## 3. Invariantes de Domínio
1. **Isolamento de Matchmaking**:
   - Um participante do Evento A NUNCA receberá sugestões de conexão (matches) de participantes do Evento B, a menos que ele tenha realizado check-in explícito no Evento B.
2. **Idempotência de Check-in**:
   - Fazer check-in repetidas vezes no mesmo evento não deve duplicar perfis nem criar inconsistências de dados.
3. **Preservação de Conexões Passadas**:
   - Conexões, anotações de staff e briefings gerados em eventos passados são imutáveis e pertencem estritamente àquele evento.
