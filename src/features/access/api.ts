import { supabase } from "@/integrations/supabase/client";
import {
  mapClaimError,
  mapOtpError,
  normalizeOtpCode,
  normalizePhoneToE164,
  requestSentMessage,
  type OtpChannel,
  type PhoneAuthErrorCode,
} from "@/lib/phone-auth";

export class PhoneAuthError extends Error {
  readonly code: PhoneAuthErrorCode;
  constructor(code: PhoneAuthErrorCode) {
    super(code);
    this.code = code;
    this.name = "PhoneAuthError";
  }
}

export interface RequestOtpResult {
  /** Sempre genérica: não revela se o número possui cadastro. */
  message: string;
  e164: string;
  /** Canal efetivamente solicitado ao provedor. */
  channel: OtpChannel;
}

export interface RequestOtpOptions {
  /**
   * `false` impede que um telefone qualquer digitado na tela crie identidade
   * de auth. Só é seguro quando os participantes já possuem identidade com
   * telefone — hoje o cadastro é anônimo, então o padrão continua `true`
   * (ver docs/passwordless-otp-ativacao.md).
   */
  createUser?: boolean;
}

/**
 * Envia o OTP de LOGIN (transacional, uso único). Não é notificação:
 * nenhuma mensagem de match, campanha ou aviso trafega por aqui.
 */
export async function requestPhoneOtp(
  rawPhone: string,
  channel: OtpChannel = "sms",
  options: RequestOtpOptions = {},
): Promise<RequestOtpResult> {
  const norm = normalizePhoneToE164(rawPhone);
  if (!norm.ok) throw new PhoneAuthError("invalid_phone");

  // Um envio por vez: nunca disparamos WhatsApp e SMS juntos por padrão.
  const { error } = await supabase.auth.signInWithOtp({
    phone: norm.e164,
    options: {
      channel,
      ...(options.createUser === false ? { shouldCreateUser: false } : {}),
    },
  });
  if (error) throw new PhoneAuthError(mapOtpError(error.message, "request"));

  return { message: requestSentMessage(channel, norm.e164), e164: norm.e164, channel };
}

/**
 * Verifica o OTP e estabelece a sessão com telefone verificado.
 * Devolve apenas sucesso — nenhum dado de perfil ou contato.
 */
export async function verifyPhoneOtp(rawPhone: string, rawCode: string): Promise<void> {
  const norm = normalizePhoneToE164(rawPhone);
  if (!norm.ok) throw new PhoneAuthError("invalid_phone");
  const code = normalizeOtpCode(rawCode);
  if (!code.ok) throw new PhoneAuthError("invalid_code");

  // `type: "sms"` é o tipo de verificação de telefone do GoTrue e cobre os
  // dois canais de entrega (SMS e WhatsApp) — não existe tipo "whatsapp".
  const { data, error } = await supabase.auth.verifyOtp({
    phone: norm.e164,
    token: code.code,
    type: "sms",
  });
  if (error) throw new PhoneAuthError(mapOtpError(error.message, "verify"));
  if (!data.session?.user) throw new PhoneAuthError("unknown");
}

export interface ClaimResult {
  profileId: string;
  /** true quando houve transferência de titularidade nesta chamada. */
  claimed: boolean;
}

/**
 * Assume o perfil pelo telefone VERIFICADO da sessão. O telefone NÃO é
 * enviado: o backend lê a identidade autenticada, então spoofing pela tela
 * não tem efeito algum.
 */
export async function claimProfileByVerifiedPhone(eventId: string): Promise<ClaimResult> {
  const { data, error } = await supabase.rpc("claim_profile_by_verified_phone", {
    _event_id: eventId,
  });
  if (error) throw new PhoneAuthError(mapClaimError(error.message));

  const row = Array.isArray(data) ? data[0] : null;
  if (!row?.profile_id) throw new PhoneAuthError("claim_failed");
  return { profileId: row.profile_id, claimed: Boolean(row.claimed) };
}
