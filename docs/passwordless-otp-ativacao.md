# Acesso passwordless multicanal (WhatsApp + SMS) — ativação

O código está pronto e desligado com segurança. Enquanto o provedor externo
não estiver ativo, a tela de acesso continua oferecendo apenas o **código
pessoal de recuperação** (fallback preservado).

## Como o app decide os canais

`derivePhoneAuthCapability()` (server-side, em `src/lib/phone-auth.ts`) combina:

1. a configuração pública de auth do backend (`external.phone`, `sms_provider`);
2. flags de ambiente do servidor.

Regras: WhatsApp só é anunciado se o provedor suportar (Twilio / Twilio Verify)
**e** houver remetente confirmado; SMS só é anunciado se não for desligado;
`PHONE_OTP_CHANNELS` apenas restringe. Nenhuma variável do frontend influencia
a decisão.

### Variáveis de ambiente do servidor (nenhum segredo no repositório)

| Variável | Efeito | Padrão |
| --- | --- | --- |
| `PHONE_OTP_WHATSAPP_ENABLED` | `true` habilita o canal WhatsApp | inferido do remetente |
| `TWILIO_WHATSAPP_FROM` | remetente WhatsApp configurado (`whatsapp:+55...`) | vazio |
| `PHONE_OTP_SMS_ENABLED` | `false` desliga o canal SMS | ligado |
| `PHONE_OTP_PREFERRED_CHANNEL` | canal recomendado na UI | `whatsapp` se disponível |
| `PHONE_OTP_CHANNELS` | allowlist final (`whatsapp,sms`) | sem filtro |
| `PHONE_OTP_ALLOW_SIMULTANEOUS` | envio nos dois canais ao mesmo tempo | **`false`** |
| `PHONE_OTP_SHOULD_CREATE_USER` | `0` proíbe criar identidade nova no pedido de OTP | `true` |

## Checklist de ativação externa (fora do código)

1. Conta Twilio ativa com **WhatsApp Business sender** aprovado e template de
   OTP aprovado pela Meta.
2. No painel de autenticação do backend, habilitar **Phone provider** e
   informar as credenciais Twilio:
   - Account SID
   - Auth Token (ou API Key SID + Secret)
   - Message Service SID / número remetente SMS
   - Para Twilio **Verify**: Verify Service SID (recomendado — é o produto
     específico de OTP, faz roteamento e fraud guard do lado do provedor).
3. Definir as variáveis da tabela acima no ambiente do servidor.
4. Ativar CAPTCHA (hCaptcha/Turnstile) no provedor de auth para controle de
   custo/abuso no pedido de OTP em produção.
5. Rodar o E2E real: WhatsApp → OTP → verify → claim; depois o mesmo por SMS.

### Send SMS Hook — avaliado e **não adotado**

O hook oficial só compensa com roteamento próprio multi-provedor. O provedor
nativo Twilio/Twilio Verify já entrega WhatsApp e SMS com escolha de canal por
requisição, que é exatamente o que a UI faz. Adotar o hook hoje só adicionaria
um serviço de envio próprio (mais superfície de abuso e de custo) sem ganho.

## Decisões de segurança

- `shouldCreateUser` continua `true`: o cadastro do participante é anônimo, sem
  identidade de telefone prévia; com `false` nenhum participante conseguiria
  reivindicar o perfil. Impacto controlado — criar identidade de auth não dá
  acesso a nada: o claim exige `phone_confirmed_at` **e** hash do telefone
  igual ao do perfil no evento. Quando todos os perfis já tiverem identidade,
  basta setar `PHONE_OTP_SHOULD_CREATE_USER=0`.
- `verifyOtp` usa `type: "sms"` para os dois canais — é o tipo de verificação
  de telefone do GoTrue; não existe tipo `whatsapp`.
- `claim_profile_by_verified_phone` **não recebe telefone do cliente**: lê
  `auth.users.phone` + `phone_confirmed_at`. Spoofing pela tela não tem efeito.
- Sem fallback silencioso: falha imediata de canal oferece botão explícito
  "Tentar por SMS/WhatsApp".
- Mensagens idênticas para número cadastrado e não cadastrado; nenhum telefone
  ou OTP em log, URL ou storage.

## Auditoria de capability — 2026-08-20 (cutover BLOQUEADO)

Leitura real da configuração pública de auth (`/auth/v1/settings`) + inventário
de flags/segredos do servidor:

| Item | Estado real |
| --- | --- |
| Phone provider (`external.phone`) | **enabled** |
| `sms_provider` | **twilio** |
| `phone_autoconfirm` | true |
| Canal WhatsApp | **unavailable** (sem remetente/flag) |
| Canal SMS | available (depende das credenciais Twilio no provedor de auth) |
| `preferredChannel` derivado | `sms` |
| `PHONE_OTP_WHATSAPP_ENABLED` | missing |
| `PHONE_OTP_WHATSAPP_SENDER` / `TWILIO_WHATSAPP_FROM` | missing |
| `PHONE_OTP_SMS_ENABLED` | missing (default: habilitado) |
| `PHONE_OTP_PREFERRED_CHANNEL` | missing |
| `PHONE_OTP_CHANNELS` / `PHONE_OTP_ALLOW_SIMULTANEOUS` / `PHONE_OTP_SHOULD_CREATE_USER` | missing (defaults) |

Consequência: o canal principal do produto (WhatsApp) **não está operacional**,
não houve E2E real e, portanto, o fallback por código pessoal permanente
**permanece ativo**. `private.profile_recovery`, `recover_profile_v2`,
`RecoveryCodeDialog` e os estados `generating_code` /
`awaiting_code_confirmation` / `code_failed` seguem em produção até o gate
passar.
