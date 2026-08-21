# Trocar a verificação por OTP por uma confirmação simples do número

## Contexto

O envio de código não funciona porque o backend não tem provedor de SMS com credenciais (o endpoint de OTP responde "Unable to get SMS provider"). Em vez de esperar a Twilio, o cadastro deixa de depender de código: no fim do fluxo aparece um pop-up pedindo apenas para conferir o número digitado, evitando telefone errado.

## Como fica o /participar

1. Etapa 1 continua pedindo o WhatsApp normalmente.
2. Na etapa de Revisão, o bloco "Confirme seu WhatsApp" com envio de código some.
3. Ao clicar em "Finalizar cadastro", abre um pop-up:
   - título "Confirme seu WhatsApp";
   - o número completo, formatado e bem visível;
   - texto curto: é por esse número que os contatos vão te encontrar;
   - botões "Corrigir número" (volta para a etapa 1, com foco no campo) e "Está correto, finalizar".
4. Confirmando, o perfil é salvo, o contato gravado, o Instagram vinculado e os matches calculados — como já acontece hoje.
5. No modo edição o pop-up também aparece quando o número foi alterado; se não mudou, salva direto.

## Impacto que você deve saber

Sem OTP, o participante não ganha mais uma identidade vinculada ao telefone. Ele continua acessando o painel pelo mesmo aparelho/navegador (sessão automática). Recuperar o perfil em outro aparelho ficará indisponível até o provedor de SMS/WhatsApp ser configurado — o código já existente para isso fica preservado e desligado, pronto para religar depois.

## Detalhes técnicos

- `src/features/onboarding/steps.tsx`: remover `PhoneConfirmBlock` e o uso de `WhatsappAccessCard` na revisão; o botão final volta a ficar habilitado pela validação do formulário.
- `src/routes/participar.tsx`: substituir o estado `phoneVerified` por `pendingConfirm`; o clique em finalizar abre um `AlertDialog` de confirmação e só então chama `startSubmit`. "Corrigir número" usa o `goToIdentity()` existente.
- Guard atual `if (mode === "create" && !phoneVerified)` em `startSubmit` passa a exigir apenas número válido (normalização E.164 já existente).
- `handlePhoneVerified` e a revalidação de perfil pós-OTP saem do fluxo de cadastro.
- Nada é removido de `src/features/access/*` (`WhatsappAccessCard`, `api.ts`, capability): continuam servindo a tela de acesso/recuperação, que só aparece quando a capability estiver habilitada.
- Testes: atualizar `src/__tests__/onda-b.test.ts` e `onda-b-hardening-2.test.ts` (ordem verificação → salvamento) e ajustar os casos de `impl14`/`impl18` que assumem OTP obrigatório no cadastro.
