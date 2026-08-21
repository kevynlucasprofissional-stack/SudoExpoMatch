import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EVENT_ID } from "@/config/event";
import { qk } from "@/features/participant/queryKeys";
import {
  claimProfileByVerifiedPhone,
  PhoneAuthError,
  requestPhoneOtp,
  verifyPhoneOtp,
} from "./api";
import {
  channelLabel,
  createAttemptLimiter,
  fallbackChannel,
  limiterKey,
  maskPhone,
  normalizePhoneToE164,
  OTP_REQUEST_MAX,
  OTP_REQUEST_WINDOW_MS,
  OTP_RESEND_COOLDOWN_SEC,
  OTP_VERIFY_MAX,
  OTP_VERIFY_WINDOW_MS,
  resolveChannel,
  shouldOfferChannelSwitch,
  translatePhoneAuthError,
  type OtpChannel,
  type PhoneAuthCapability,
  type PhoneAuthErrorCode,
} from "@/lib/phone-auth";

/**
 * Acesso passwordless: WhatsApp -> OTP -> número verificado -> perfil.
 *
 * Política de dados: telefone e OTP vivem apenas em `useState` local; nunca
 * URL, storage ou logs. Mensagens de solicitação são genéricas para não
 * revelar se o número possui cadastro.
 */
const requestLimiter = createAttemptLimiter(OTP_REQUEST_MAX, OTP_REQUEST_WINDOW_MS);
const verifyLimiter = createAttemptLimiter(OTP_VERIFY_MAX, OTP_VERIFY_WINDOW_MS);

type Phase = "phone" | "code";

export interface WhatsappAccessCardProps {
  capability: PhoneAuthCapability;
  /** Número já conhecido (fluxo de cadastro) — pré-preenche o campo. */
  initialPhone?: string;
  /** Impede editar o número (verificação do cadastro). */
  lockPhone?: boolean;
  /** Texto do botão de confirmação do código. */
  confirmLabel?: string;
  /** Mensagem do topo do cartão. */
  hint?: string;
  /**
   * Quando informado, assume o pós-sucesso (sem toast nem navegação padrão).
   * Usado pela verificação obrigatória do cadastro.
   */
  onVerified?: (result: { profileId: string; claimed: boolean }) => void;
}

export function WhatsappAccessCard({
  capability,
  initialPhone,
  lockPhone = false,
  confirmLabel = "Entrar",
  
  onVerified,
}: WhatsappAccessCardProps) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [phase, setPhase] = useState<Phase>("phone");
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [code, setCode] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [channel, setChannel] = useState<OtpChannel>(
    () => resolveChannel(capability, null) ?? "sms",
  );
  const [sentChannel, setSentChannel] = useState<OtpChannel | null>(null);
  const [offerSwitch, setOfferSwitch] = useState(false);
  const mounted = useRef(true);
  const altChannel = fallbackChannel(capability, channel);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const key = useMemo(() => {
    const n = normalizePhoneToE164(phone);
    return n.ok ? limiterKey(n.e164) : "invalid";
  }, [phone]);

  const send = useCallback(async (requested?: OtpChannel) => {
    const target = resolveChannel(capability, requested ?? channel);
    if (!target) {
      setError(translatePhoneAuthError("otp_unavailable"));
      return;
    }
    setError(null);
    setOfferSwitch(false);
    setChannel(target);
    const norm = normalizePhoneToE164(phone);
    if (!norm.ok) {
      setError(translatePhoneAuthError("invalid_phone"));
      return;
    }
    const gate = requestLimiter.check(key);
    if (!gate.allowed) {
      setError(translatePhoneAuthError("rate_limited"));
      return;
    }
    setBusy(true);
    try {
      const res = await requestPhoneOtp(phone, target, {
        createUser: capability.createUserOnRequest,
      });
      requestLimiter.record(key);
      if (!mounted.current) return;
      setNotice(res.message);
      setSentChannel(res.channel);
      setPhase("code");
      setCooldown(OTP_RESEND_COOLDOWN_SEC);
    } catch (err) {
      requestLimiter.record(key);
      if (!mounted.current) return;
      const code: PhoneAuthErrorCode = err instanceof PhoneAuthError ? err.code : "unknown";
      setError(translatePhoneAuthError(code));
      // Falha imediata do provedor: oferecemos o outro canal explicitamente,
      // sem trocar sozinho (o usuário precisa saber onde procurar o código).
      setOfferSwitch(shouldOfferChannelSwitch(code) && fallbackChannel(capability, target) !== null);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, [phone, key, channel, capability]);

  const confirm = useCallback(async () => {
    setError(null);
    const gate = verifyLimiter.check(key);
    if (!gate.allowed) {
      setError(translatePhoneAuthError("rate_limited"));
      return;
    }
    setBusy(true);
    verifyLimiter.record(key);
    try {
      await verifyPhoneOtp(phone, code);
      const res = await claimProfileByVerifiedPhone(EVENT_ID);
      verifyLimiter.reset(key);
      if (!lockPhone) setPhone("");
      setCode("");
      if (!mounted.current) return;
      qc.invalidateQueries({ queryKey: qk.ownProfile(EVENT_ID) });
      qc.invalidateQueries({ queryKey: qk.ownMatches(EVENT_ID) });
      if (onVerified) {
        onVerified(res);
        return;
      }
      toast.success(res.claimed ? "Bem-vindo(a) de volta!" : "Acesso liberado.");
      navigate({ to: "/participante" });
    } catch (err) {
      setCode("");
      if (!mounted.current) return;
      setError(
        translatePhoneAuthError(err instanceof PhoneAuthError ? err.code : "unknown"),
      );
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, [phone, code, key, qc, navigate, onVerified, lockPhone]);

  if (!capability.otpEnabled) return null;

  return (
    <div className="space-y-4" data-testid="whatsapp-access">



      {phase === "phone" ? (
        <div>
          <Label htmlFor="access-phone">WhatsApp</Label>
          <Input
            id="access-phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(64) 99999-9999"
            inputMode="tel"
            autoComplete="tel"
            readOnly={lockPhone}
            disabled={lockPhone}
          />
          {capability.channels.length > 1 && (
            <div className="mt-3">
              <p className="mb-1.5 text-sm font-medium">Como quer receber seu código?</p>
              <div className="flex flex-wrap gap-2">
                {capability.channels.map((c) => (
                  <Button
                    key={c}
                    type="button"
                    size="sm"
                    variant={channel === c ? "default" : "outline"}
                    aria-pressed={channel === c}
                    onClick={() => setChannel(c)}
                    data-testid={`otp-channel-${c}`}
                  >
                    {channelLabel(c)}
                    {c === capability.preferredChannel ? " — recomendado" : ""}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div>
          <Label htmlFor="access-code">Código de 6 dígitos</Label>
          <Input
            id="access-code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
            inputMode="numeric"
            autoComplete="one-time-code"
            className="font-mono tracking-widest"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Código enviado {sentChannel === "whatsapp" ? "pelo WhatsApp" : "por SMS"} para{" "}
            {maskPhone(phone)}.
          </p>
        </div>
      )}

      {notice && !error && (
        <p className="rounded-md border border-border bg-muted/40 p-2 text-sm text-muted-foreground">
          {notice}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      {phase === "phone" ? (
        <div className="space-y-2">
          <Button className="w-full" onClick={() => void send()} disabled={!phone || busy} aria-busy={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Receber código por {channelLabel(channel)}
          </Button>
          {offerSwitch && altChannel && (
            <Button
              variant="outline"
              className="w-full"
              data-testid="otp-try-other-channel"
              onClick={() => void send(altChannel)}
              disabled={busy}
            >
              Tentar por {channelLabel(altChannel)}
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <Button
            className="w-full"
            onClick={() => void confirm()}
            disabled={code.length !== 6 || busy}
            aria-busy={busy}
          >
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {confirmLabel}
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => void send()}
            disabled={busy || cooldown > 0}
          >
            {cooldown > 0
              ? `Reenviar em ${cooldown}s`
              : `Reenviar por ${channelLabel(channel)}`}
          </Button>
          {altChannel && (
            <Button
              variant="ghost"
              className="w-full"
              data-testid="otp-resend-other-channel"
              onClick={() => void send(altChannel)}
              disabled={busy || cooldown > 0}
            >
              {cooldown > 0
                ? `Trocar para ${channelLabel(altChannel)} em ${cooldown}s`
                : `Receber por ${channelLabel(altChannel)}`}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
