# Acesso único por WhatsApp (OTP) — fim do código de recuperação

Hoje o app tem dois caminhos de acesso: código de recuperação (gerado no fim do cadastro) e OTP por telefone (já implementado, mas tratado como opcional). O objetivo é deixar só o WhatsApp: cadastro e login confirmam o número por código OTP, e o código de recuperação some do app e do banco.

## O que muda para o participante

1. **No fim do cadastro (etapa 4)**: em vez do modal "Guarde seu código de recuperação", aparece a verificação do WhatsApp — enviamos um código de 6 dígitos para o número informado, ele digita, e o perfil fica vinculado ao número verificado.
2. **Na tela do participante**: some o bloco de código de recuperação e o botão de gerar novo código. O acesso em outro aparelho passa a ser: informar o WhatsApp → receber o código → entrar.
3. **Entrega**: tentamos WhatsApp primeiro; se o provedor recusar, oferecemos o mesmo código por SMS, com aviso claro de onde procurar.
4. **Perfis antigos**: continuam acessíveis pelo número de WhatsApp já cadastrado no perfil — nenhum participante fica sem entrada.

## Etapas

**1. Verificação obrigatória no cadastro**
- Substituir o passo `awaiting_code_confirmation` da máquina de submissão por um passo de verificação OTP.
- Novo componente de verificação (reaproveitando a lógica já existente do cartão de WhatsApp): enviar código, reenviar com contagem regressiva, limite de tentativas, troca para SMS.
- Depois de verificado, o perfil é vinculado ao telefone verificado antes de seguir para o painel.

**2. Login/recuperação só por WhatsApp**
- A tela de recuperação passa a mostrar apenas o fluxo WhatsApp → código → painel (sem campo de código de recuperação).
- Remover o cartão condicional: se o provedor estiver indisponível, mostrar mensagem de indisponibilidade em vez de cair no código antigo.

**3. Remoção do código de recuperação (frontend)**
- Excluir: `RecoveryCodeDialog`, `RotateRecoveryButton`, `useRecoverProfile`, `features/recovery/*` e os campos/estados de código na máquina de submissão e nos tipos.
- Ajustar textos, tipos de erro e testes que citam código de recuperação.

**4. Limpeza do banco (migração)**
- Remover as funções `recover_profile_v2`, `rotate_own_recovery_code` e `hash_recovery_code`.
- Remover a coluna/hash de código de recuperação da tabela privada de contatos e o retorno de código em `save_own_profile_v2`.
- Garantir que `claim_profile_by_verified_phone` cubra perfis antigos (vínculo pelo telefone normalizado já cadastrado).

**5. Configuração e testes**
- Ajustar a capability de telefone para o par WhatsApp+SMS (canal preferido WhatsApp, alternativo SMS).
- Rodar a suíte e um teste de ponta a ponta do cadastro até o painel.

## Detalhes técnicos

- OTP via `supabase.auth.signInWithOtp({ phone, channel })` + `verifyOtp({ type: "sms" })`, já encapsulados em `src/features/access/api.ts`.
- Vínculo do perfil ao número verificado via RPC `claim_profile_by_verified_phone` (o telefone não trafega: o backend lê a identidade autenticada).
- Telefone e código só em estado local do componente — nunca URL, storage ou logs.

## Pendências de configuração (fora do código)

- O canal WhatsApp exige um remetente WhatsApp do Twilio e as variáveis `PHONE_OTP_WHATSAPP_ENABLED` e `TWILIO_WHATSAPP_FROM`. Enquanto não estiverem definidas, o envio cai em SMS.
- A opção de confirmação automática de telefone está ligada no backend; ela precisa ser desativada para que o código OTP seja realmente exigido. Faço esse ajuste na implementação.
