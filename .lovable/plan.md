# Por que o SMS não chega — e como destravar

## Diagnóstico (confirmado agora)

Chamei o endpoint real de envio de OTP do backend com um número válido. A resposta foi:

```text
500 unexpected_failure — "Unable to get SMS provider"
```

Ou seja: o app está fazendo tudo certo. O login por telefone está **ligado** no backend, mas **não há provedor de SMS com credenciais configuradas** (Twilio). Sem credenciais, o backend nem tenta enviar — devolve erro 500, que a tela traduz para a mensagem genérica "Não foi possível concluir o acesso. Tente novamente."

Isso não é bug de código do wizard, do `WhatsappAccessCard` nem da nova confirmação inline. Nenhuma alteração de frontend faz o código chegar.

## O que precisa ser feito para funcionar de verdade

1. Conta Twilio ativa (ou Twilio Verify) com número remetente de SMS para o Brasil.
2. Cadastrar no provedor de autenticação do backend: Account SID, Auth Token (ou API Key SID/Secret) e Message Service SID / número remetente — ou o Verify Service SID.
3. Para o canal WhatsApp: sender WhatsApp Business aprovado + template de OTP aprovado pela Meta, e as flags `PHONE_OTP_WHATSAPP_ENABLED` / `TWILIO_WHATSAPP_FROM` no ambiente do servidor.
4. Teste E2E real: pedir código → receber → confirmar → concluir cadastro.

Sem o item 1–2 nada muda. Posso conduzir a configuração assim que você tiver as credenciais Twilio.

## O que eu posso ajustar no app enquanto isso

Melhorar o diagnóstico e não deixar o participante travado:

- **Mensagem honesta**: quando o backend responder "provedor de SMS indisponível", mostrar "Envio de código temporariamente indisponível" em vez de "Tente novamente" (que sugere erro do usuário e leva a repetição inútil).
- **Detecção de capacidade real**: hoje `derivePhoneAuthCapability` considera SMS disponível só porque o provedor de telefone está ligado, sem saber se há credenciais. Passar a marcar o canal como indisponível após uma falha de provedor, escondendo o botão em vez de oferecer algo que sempre falha.
- **Saída para o participante**: na etapa de Revisão, quando o envio estiver indisponível, permitir concluir o cadastro sem verificação (perfil salvo, contato pendente de confirmação) — ou manter bloqueado, se você preferir integridade do contato acima de tudo.

## Detalhes técnicos

- `src/lib/phone-auth.ts`: novo código de erro `provider_unavailable` no `mapOtpError` para `unexpected_failure` / "Unable to get SMS provider", com texto próprio.
- `src/features/access/WhatsappAccessCard.tsx`: estado de canal indisponível — desabilita o botão de envio e exibe aviso, sem loop de retry.
- `src/features/onboarding/steps.tsx` + `src/routes/participar.tsx`: comportamento do botão final quando a verificação estiver indisponível (conforme sua escolha acima).
- Testes em `src/__tests__/impl18-passwordless-multicanal.test.ts` cobrindo o novo mapeamento de erro.
