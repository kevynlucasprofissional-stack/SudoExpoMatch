/**
 * Acesso passwordless por WhatsApp — núcleo puro (sem I/O, testável).
 *
 * Princípio de segurança: o número é a IDENTIDADE visível; o OTP é apenas a
 * PROVA DE POSSE temporária. Conhecer o número de alguém nunca dá acesso —
 * o backend só confia no telefone verificado da identidade autenticada
 * (`auth.users.phone_confirmed_at`), jamais no telefone enviado pela tela.
 */

/** Canal usado para entregar o OTP. `whatsapp` exige provedor habilitado. */
export type OtpChannel = "whatsapp" | "sms";

export interface PhoneAuthCapability {
  /** Provedor de telefone habilitado na camada de autenticação. */
  otpEnabled: boolean;
  /** Canais realmente disponíveis (vazio quando desabilitado). */
  channels: OtpChannel[];
  /** Canal recomendado na UI (sempre presente em `channels`). */
  preferredChannel: OtpChannel | null;
  /** Se o fallback por código de recuperação deve permanecer visível. */
  recoveryCodeFallback: boolean;
  /**
   * Envio simultâneo nos dois canais. Deliberadamente `false`: duplica custo,
   * duplica superfície de abuso e confunde o usuário sobre onde procurar o
   * código. Fica configurável para um cenário futuro, nunca ligado por padrão.
   */
  allowSimultaneous: boolean;
  /**
   * Se o pedido de OTP pode criar uma identidade de auth inexistente.
   * Manter `true` preserva o fluxo atual (participante cadastrado de forma
   * anônima ainda não tem identidade com telefone). Ver docs de ativação.
   */
  createUserOnRequest: boolean;
  /** Motivo legível quando OTP está indisponível (sem detalhes internos). */
  reason?: "provider_disabled" | "no_channel_configured" | "unknown";
}

export const CAPABILITY_DISABLED: PhoneAuthCapability = {
  otpEnabled: false,
  channels: [],
  preferredChannel: null,
  recoveryCodeFallback: true,
  allowSimultaneous: false,
  createUserOnRequest: true,
  reason: "provider_disabled",
};

// ------------------------------------------------------- capability (pura)

/** Provedores de SMS do GoTrue que suportam entrega por WhatsApp. */
export const WHATSAPP_CAPABLE_PROVIDERS = new Set(["twilio", "twilio_verify"]);

export interface AuthSettingsSnapshot {
  external?: { phone?: boolean } | undefined;
  sms_provider?: string | undefined;
}

function envFlag(raw: string | undefined): boolean | null {
  if (raw === undefined) return null;
  const v = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(v)) return true;
  if (["0", "false", "no", "off"].includes(v)) return false;
  return null;
}

function parseChannelList(raw: string | undefined): OtpChannel[] | null {
  if (!raw) return null;
  const out: OtpChannel[] = [];
  for (const part of raw.split(",")) {
    const v = part.trim().toLowerCase();
    if ((v === "whatsapp" || v === "sms") && !out.includes(v)) out.push(v);
  }
  return out.length ? out : null;
}

/**
 * Deriva a capability REAL a partir da configuração do servidor de auth mais
 * os flags de ambiente. Regras:
 *
 * - provedor de telefone desligado → nada é anunciado;
 * - WhatsApp só aparece se o provedor suportar E o remetente estiver
 *   configurado (flag explícita de ambiente);
 * - SMS só aparece se não tiver sido desligado explicitamente;
 * - a lista `PHONE_OTP_CHANNELS` age como filtro final (nunca amplia).
 *
 * Nada aqui depende de variável do cliente: a decisão é sempre server-side.
 */
export function derivePhoneAuthCapability(
  settings: AuthSettingsSnapshot | null,
  env: Record<string, string | undefined> = {},
): PhoneAuthCapability {
  if (!settings) return { ...CAPABILITY_DISABLED, reason: "unknown" };
  if (!settings.external?.phone) return CAPABILITY_DISABLED;

  const provider = (settings.sms_provider ?? "").trim().toLowerCase();
  const providerSupportsWhatsapp = WHATSAPP_CAPABLE_PROVIDERS.has(provider);
  const whatsappFlag = envFlag(env["PHONE_OTP_WHATSAPP_ENABLED"]);
  const hasWhatsappSender = Boolean(
    (env["TWILIO_WHATSAPP_FROM"] ?? env["PHONE_OTP_WHATSAPP_SENDER"] ?? "").trim(),
  );
  const smsFlag = envFlag(env["PHONE_OTP_SMS_ENABLED"]);

  const channels: OtpChannel[] = [];
  // WhatsApp exige provedor capaz + confirmação explícita de remetente.
  if (providerSupportsWhatsapp && (whatsappFlag === true || (whatsappFlag === null && hasWhatsappSender))) {
    channels.push("whatsapp");
  }
  if (smsFlag !== false) channels.push("sms");

  const allowList = parseChannelList(env["PHONE_OTP_CHANNELS"]);
  const finalChannels = allowList ? channels.filter((c) => allowList.includes(c)) : channels;

  if (finalChannels.length === 0) {
    return { ...CAPABILITY_DISABLED, reason: "no_channel_configured" };
  }

  const preferredRaw = (env["PHONE_OTP_PREFERRED_CHANNEL"] ?? "").trim().toLowerCase();
  const preferred: OtpChannel =
    (preferredRaw === "whatsapp" || preferredRaw === "sms") &&
    finalChannels.includes(preferredRaw as OtpChannel)
      ? (preferredRaw as OtpChannel)
      : finalChannels.includes("whatsapp")
        ? "whatsapp"
        : "sms";

  // Ordena com o recomendado à frente — a UI usa `channels[0]` como default.
  const ordered = [preferred, ...finalChannels.filter((c) => c !== preferred)];

  return {
    otpEnabled: true,
    channels: ordered,
    preferredChannel: preferred,
    recoveryCodeFallback: true,
    allowSimultaneous: envFlag(env["PHONE_OTP_ALLOW_SIMULTANEOUS"]) === true,
    createUserOnRequest: envFlag(env["PHONE_OTP_SHOULD_CREATE_USER"]) !== false,
  };
}

/** Canal alternativo ao informado (para o botão de fallback). */
export function otherChannel(channel: OtpChannel): OtpChannel {
  return channel === "whatsapp" ? "sms" : "whatsapp";
}

/** Alternativa disponível na capability, ou `null` quando não há. */
export function fallbackChannel(
  capability: PhoneAuthCapability,
  current: OtpChannel,
): OtpChannel | null {
  const alt = otherChannel(current);
  return capability.channels.includes(alt) ? alt : null;
}

/** Resolve o canal efetivo: respeita a escolha, cai no disponível. */
export function resolveChannel(
  capability: PhoneAuthCapability,
  requested: OtpChannel | null | undefined,
): OtpChannel | null {
  if (!capability.otpEnabled || capability.channels.length === 0) return null;
  if (requested && capability.channels.includes(requested)) return requested;
  return capability.preferredChannel ?? capability.channels[0] ?? null;
}

export function channelLabel(channel: OtpChannel): string {
  return channel === "whatsapp" ? "WhatsApp" : "SMS";
}

// --------------------------------------------------------------- normalização
const BR_DDI = "55";

export type PhoneNormalizeResult =
  | { ok: true; e164: string; digits: string }
  | { ok: false; reason: "empty" | "too_short" | "too_long" | "invalid" };

/**
 * Normaliza entrada brasileira para E.164. Aceita "(64) 99999-9999",
 * "+55 64 99999-9999", "5564999999999". Não inventa DDI para números longos
 * já internacionais.
 */
export function normalizePhoneToE164(raw: unknown): PhoneNormalizeResult {
  if (typeof raw !== "string") return { ok: false, reason: "invalid" };
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: "empty" };
  if (/[^\d\s()+\-.]/.test(trimmed)) return { ok: false, reason: "invalid" };

  let digits = trimmed.replace(/\D/g, "");
  if (!digits) return { ok: false, reason: "empty" };
  if (digits.length > 15) return { ok: false, reason: "too_long" };

  // 10 (fixo) ou 11 (celular) dígitos => número nacional, prefixa DDI 55.
  if (digits.length === 10 || digits.length === 11) digits = BR_DDI + digits;

  if (digits.length < 12) return { ok: false, reason: "too_short" };
  if (digits.length > 15) return { ok: false, reason: "too_long" };

  return { ok: true, e164: `+${digits}`, digits };
}

/** Máscara para exibição/log: preserva só os 4 últimos dígitos. */
export function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 4) return "••••";
  return `••••${digits.slice(-4)}`;
}

// ------------------------------------------------------------------ OTP input
export type OtpCodeResult = { ok: true; code: string } | { ok: false };

/** OTP do Supabase é numérico de 6 dígitos. */
export function normalizeOtpCode(raw: unknown): OtpCodeResult {
  if (typeof raw !== "string") return { ok: false };
  const code = raw.replace(/\D/g, "");
  if (code.length !== 6) return { ok: false };
  return { ok: true, code };
}

// ------------------------------------------------- respostas anti-enumeração
export type PhoneAuthStage = "request" | "verify" | "claim";

export type PhoneAuthErrorCode =
  | "invalid_phone"
  | "invalid_code"
  | "expired_code"
  | "rate_limited"
  | "otp_unavailable"
  | "channel_unavailable"
  | "not_authenticated"
  | "phone_not_verified"
  | "claim_failed"
  | "current_user_already_has_profile"
  | "event_not_active"
  | "network"
  | "unknown";

/**
 * Mensagem genérica de "enviamos se existir". Nunca diferencia número
 * cadastrado de número não cadastrado.
 */
export const GENERIC_REQUEST_MESSAGE =
  "Se este número puder receber mensagens, enviamos um código de 6 dígitos. Confira seu aparelho.";

/**
 * Mensagem pós-envio: diz ONDE procurar o código (canal + últimos 4 dígitos)
 * sem revelar se o número possui cadastro — o texto é idêntico para número
 * conhecido e desconhecido.
 */
export function requestSentMessage(channel: OtpChannel, e164: string): string {
  const via = channel === "whatsapp" ? "pelo WhatsApp" : "por SMS";
  return `Se este número puder receber mensagens, o código de 6 dígitos foi enviado ${via} para ${maskPhone(e164)}.`;
}

export function translatePhoneAuthError(code: PhoneAuthErrorCode): string {
  switch (code) {
    case "invalid_phone":
      return "Informe um WhatsApp válido com DDD.";
    case "invalid_code":
      return "Código inválido. Confira os 6 dígitos e tente novamente.";
    case "expired_code":
      return "Este código expirou. Solicite um novo.";
    case "rate_limited":
      return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
    case "otp_unavailable":
      return "O acesso por código no celular ainda não está disponível. Use seu código pessoal.";
    case "channel_unavailable":
      return "Este canal não está disponível agora. Tente o outro canal ou use seu código pessoal.";
    case "not_authenticated":
    case "phone_not_verified":
      return "Precisamos confirmar seu WhatsApp antes de liberar o acesso.";
    case "claim_failed":
      // Genérica de propósito: não revela existência de cadastro.
      return "Não foi possível liberar um perfil para este WhatsApp neste evento.";
    case "current_user_already_has_profile":
      return "Esta sessão já está vinculada a outro perfil deste evento.";
    case "event_not_active":
      return "O evento não está ativo.";
    case "network":
      return "Sem conexão com o servidor. Verifique sua internet e tente novamente.";
    default:
      return "Não foi possível concluir o acesso. Tente novamente.";
  }
}

/** Erros em que faz sentido oferecer o outro canal ao usuário. */
export function shouldOfferChannelSwitch(code: PhoneAuthErrorCode): boolean {
  return code === "channel_unavailable" || code === "unknown" || code === "network";
}

const CLAIM_CODES: PhoneAuthErrorCode[] = [
  "not_authenticated",
  "phone_not_verified",
  "rate_limited",
  "current_user_already_has_profile",
  "event_not_active",
  "claim_failed",
];

/** Mapeia mensagem crua da RPC de claim para código sanitizado. */
export function mapClaimError(message: string | null | undefined): PhoneAuthErrorCode {
  const raw = (message ?? "").toLowerCase();
  for (const code of CLAIM_CODES) {
    if (raw.includes(code)) return code;
  }
  if (raw.includes("not_found") || raw.includes("demo")) return "claim_failed";
  if (raw.includes("fetch") || raw.includes("network")) return "network";
  return "unknown";
}

/** Mapeia erro do provedor de OTP, sem vazar detalhes do provedor. */
export function mapOtpError(message: string | null | undefined, stage: PhoneAuthStage): PhoneAuthErrorCode {
  const raw = (message ?? "").toLowerCase();
  if (raw.includes("phone_provider_disabled") || raw.includes("unsupported phone provider")) {
    return "otp_unavailable";
  }
  // Falha específica de canal (ex.: remetente WhatsApp não habilitado no
  // provedor). Vira convite ao canal alternativo, nunca fallback silencioso.
  if (
    raw.includes("whatsapp") ||
    raw.includes("channel") ||
    raw.includes("63007") ||
    raw.includes("21910")
  ) {
    return "channel_unavailable";
  }
  if (raw.includes("rate") || raw.includes("429") || raw.includes("too many")) return "rate_limited";
  if (raw.includes("expired")) return "expired_code";
  if (raw.includes("invalid") || raw.includes("token")) {
    return stage === "verify" ? "invalid_code" : "invalid_phone";
  }
  if (raw.includes("fetch") || raw.includes("network")) return "network";
  return "unknown";
}

// -------------------------------------------------------- rate limit no cliente
export interface AttemptLimiter {
  check: (key: string) => { allowed: boolean; retryInMs: number };
  record: (key: string) => void;
  reset: (key: string) => void;
}

/**
 * Limitador local de UX (o limite autoritativo é do servidor/RPC).
 * Impede rajadas de reenvio de OTP e força de bruta de código na tela.
 */
export function createAttemptLimiter(
  max: number,
  windowMs: number,
  now: () => number = Date.now,
): AttemptLimiter {
  const hits = new Map<string, number[]>();
  const prune = (key: string) => {
    const t = now();
    const list = (hits.get(key) ?? []).filter((ts) => t - ts < windowMs);
    hits.set(key, list);
    return list;
  };
  return {
    check(key) {
      const list = prune(key);
      if (list.length < max) return { allowed: true, retryInMs: 0 };
      const oldest = list[0] ?? now();
      return { allowed: false, retryInMs: Math.max(0, windowMs - (now() - oldest)) };
    },
    record(key) {
      const list = prune(key);
      list.push(now());
      hits.set(key, list);
    },
    reset(key) {
      hits.delete(key);
    },
  };
}

export const OTP_REQUEST_MAX = 3;
export const OTP_REQUEST_WINDOW_MS = 10 * 60 * 1000;
export const OTP_VERIFY_MAX = 5;
export const OTP_VERIFY_WINDOW_MS = 10 * 60 * 1000;
export const OTP_RESEND_COOLDOWN_SEC = 60;

/** Chave de limitação derivada do telefone — nunca o telefone em claro. */
export function limiterKey(e164: string): string {
  const digits = e164.replace(/\D/g, "");
  let h = 2166136261;
  for (let i = 0; i < digits.length; i += 1) {
    h ^= digits.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `ph_${(h >>> 0).toString(36)}`;
}
