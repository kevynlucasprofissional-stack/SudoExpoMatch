# Entrar só com o número de WhatsApp

Hoje a tela /participante já é uma tela de acesso sem senha, mas o envio de código por telefone está desligado no app — por isso aparece "acesso por WhatsApp temporariamente indisponível" e ninguém consegue entrar. A mudança troca o código de 6 dígitos por uma entrada direta pelo número.

## Como vai funcionar

1. A pessoa abre /participante e digita o WhatsApp.
2. O app procura o cadastro por esse número.
3. Se encontrar, mostra uma confirmação curta: "É você? Aureo C. — SoftAgro sistemas" com os botões "Sim, sou eu" e "Não é meu número".
4. Ao confirmar, ela entra direto no painel (matches, interesses, conexões e perfil).
5. Se não houver cadastro com aquele número, aparece um aviso com o atalho "Criar meu perfil".

O código de 6 dígitos e o aviso de indisponibilidade somem da tela.

## Aviso importante

Sem o código, qualquer pessoa que saiba o número de outra pode abrir o perfil dela e ver os contatos liberados. Isso é aceitável para uso no evento, mas fica registrado quem entrou e quando. Se depois você quiser voltar ao código, é só ligar o provedor de telefone — o fluxo antigo permanece no código, apenas desativado.

## Proteções incluídas

- Máximo de 5 tentativas por número/navegador a cada 15 minutos.
- A tela nunca mostra nome completo, telefone ou dados sensíveis antes da confirmação — só primeiro nome, inicial do sobrenome e empresa.
- Cada entrada gera registro de auditoria (número mascarado, data/hora).

## Detalhes técnicos

- Nova função no banco `claim_profile_by_phone_simple(_event_id, _phone_e164)` (SECURITY DEFINER): normaliza o telefone, faz hash com `hash_phone`, localiza em `private.profile_contacts`, transfere `owner_id` do perfil para o `auth.uid()` anônimo atual, grava em `public.audit_logs` e aplica rate limit igual ao de `claim_profile_by_verified_phone`. GRANT apenas para `authenticated`.
- Função irmã `lookup_profile_by_phone(_event_id, _phone_e164)` devolvendo somente `{ found, display_name, company }` mascarados, para a etapa de confirmação; mesmo rate limit.
- Frontend: novo `PhoneLoginCard.tsx` em `src/features/access/` (duas fases: número → confirmação), usado por `RecoveryView.tsx` no lugar de `WhatsappAccessCard`. `WhatsappAccessCard`, `usePhoneAuthCapability` e `phone-auth.functions.ts` continuam no projeto sem uso na tela de login.
- Após o claim: invalidar `qk.ownProfile` e `qk.ownMatches` e permanecer em /participante.
- Testes Vitest para normalização/rate limit e um teste de fluxo da nova tela.
