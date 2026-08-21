# Confirmação do WhatsApp na etapa final do /participar

Hoje o cadastro salva o perfil e só então abre um pop-up bloqueante pedindo o código do WhatsApp. A mudança: a confirmação passa a ser um bloco dentro da própria etapa de Revisão, e nada é gravado antes do código ser confirmado.

## Como fica a etapa de Revisão (modo cadastro)

1. Resumo do perfil, como já é hoje.
2. Novo bloco "Confirme seu WhatsApp" logo acima do botão final, com o número informado na etapa 1 (não editável) e o botão "Enviar código".
3. Depois de digitar o código e confirmar, o bloco vira um estado confirmado (número mascarado + selo de verificado).
4. O botão final só fica habilitado após a confirmação; ao clicar, o perfil é salvo, o contato é gravado, o Instagram é vinculado e os matches são calculados — então o participante vai para o painel.

Se o número precisar ser corrigido, o bloco oferece um atalho "Alterar número" que volta para a etapa 1.

No modo edição nada muda: continua sem exigir nova verificação.

## Detalhes técnicos

- `src/routes/participar.tsx`: remover o uso de `PhoneVerificationDialog`; passar para `StepReview` o estado de verificação e o callback de confirmação. `startSubmit` passa a exigir `phoneVerified === true` no modo create.
- `src/features/onboarding/steps.tsx` (`StepReview`): renderizar o bloco inline reaproveitando `WhatsappAccessCard` (`lockPhone`, `confirmLabel="Confirmar WhatsApp"`), com fallback quando `usePhoneAuthCapability` indicar OTP indisponível (mesmo comportamento de hoje do diálogo).
- `src/features/onboarding/submitMachine.ts` / `submitOrchestrator.ts`: remover o estágio `awaiting_phone_verification` e o evento `AWAIT_PHONE_VERIFICATION` do meio do fluxo; no create o orquestrador passa a terminar em `MATCH_OK` como na edição, já que a verificação acontece antes.
- Sessão: `verifyPhoneOtp` troca a sessão anônima pela identidade com telefone verificado. Como o save passa a rodar depois, o perfil já nasce com `owner_id` correto. Após a verificação, revalidar `qk.ownProfile` — se já existir perfil para aquele telefone (participante que voltou), reaproveitar o caminho de conflito/edição existente em vez de criar duplicado.
- `PhoneVerificationDialog.tsx` fica sem uso e será removido junto com seus imports.
- Testes existentes de `submitMachine`/`submitOrchestrator` atualizados para a nova ordem.
