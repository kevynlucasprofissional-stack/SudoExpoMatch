import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EVENT_ID } from "@/config/event";
import { qk } from "@/features/participant/queryKeys";
import {
  checkinParticipantByPhone,
  claimProfileByPhone,
  lookupProfileByPhone,
  PhoneLoginError,
  translatePhoneLoginError,
  type PhoneLookupResult,
} from "./phoneLogin";
import { createAttemptLimiter, limiterKey, maskPhone, normalizePhoneToE164 } from "@/lib/phone-auth";

/**
 * Entrada sem senha e sem código: número -> confirmação -> painel.
 *
 * O número vive apenas em `useState`; nada é gravado em storage, URL ou log.
 * O limitador local espelha o limite autoritativo do banco (5 / 15 min).
 */
export const PHONE_LOGIN_MAX = 5;
export const PHONE_LOGIN_WINDOW_MS = 15 * 60 * 1000;
const limiter = createAttemptLimiter(PHONE_LOGIN_MAX, PHONE_LOGIN_WINDOW_MS);

type Phase = "phone" | "confirm" | "checkin";

export function PhoneLoginCard() {
  const qc = useQueryClient();
  const [phase, setPhase] = useState<Phase>("phone");
  const [phone, setPhone] = useState("");
  const [found, setFound] = useState<PhoneLookupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const key = useMemo(() => {
    const n = normalizePhoneToE164(phone);
    return n.ok ? limiterKey(n.e164) : "invalid";
  }, [phone]);

  const search = useCallback(async () => {
    setError(null);
    const norm = normalizePhoneToE164(phone);
    if (!norm.ok) {
      setError(translatePhoneLoginError("invalid_phone"));
      return;
    }
    if (!limiter.check(key).allowed) {
      setError(translatePhoneLoginError("rate_limited"));
      return;
    }
    setBusy(true);
    limiter.record(key);
    try {
      const res = await lookupProfileByPhone(EVENT_ID, phone);
      if (!mounted.current) return;
      if (res.found) {
        setFound(res);
        setPhase("confirm");
        return;
      }
      if (res.hasPreviousEvent) {
        setFound(res);
        setPhase("checkin");
        return;
      }
      setError(translatePhoneLoginError("not_found"));
    } catch (err) {
      if (!mounted.current) return;
      setError(
        translatePhoneLoginError(err instanceof PhoneLoginError ? err.code : "unknown"),
      );
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, [phone, key]);

  const enter = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      await claimProfileByPhone(EVENT_ID, phone);
      limiter.reset(key);
      if (!mounted.current) return;
      setPhone("");
      await qc.invalidateQueries({ queryKey: qk.ownProfile(EVENT_ID) });
      await qc.invalidateQueries({ queryKey: qk.ownMatches(EVENT_ID) });
      toast.success("Bem-vindo(a) de volta!");
    } catch (err) {
      if (!mounted.current) return;
      setError(
        translatePhoneLoginError(err instanceof PhoneLoginError ? err.code : "unknown"),
      );
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, [phone, key, qc]);

  const handleCheckin = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      await checkinParticipantByPhone(EVENT_ID, phone);
      limiter.reset(key);
      if (!mounted.current) return;
      setPhone("");
      await qc.invalidateQueries({ queryKey: qk.ownProfile(EVENT_ID) });
      await qc.invalidateQueries({ queryKey: qk.ownMatches(EVENT_ID) });
      toast.success("Check-in realizado com sucesso na SudoExpo 2026! Suas conexões foram ativadas.");
    } catch (err) {
      if (!mounted.current) return;
      setError(
        translatePhoneLoginError(err instanceof PhoneLoginError ? err.code : "unknown"),
      );
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, [phone, key, qc]);

  return (
    <div className="space-y-4" data-testid="phone-login">
      {phase === "phone" ? (
        <>
          <div>
            <Label htmlFor="login-phone">WhatsApp</Label>
            <Input
              id="login-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && phone && !busy) void search();
              }}
              placeholder="(64) 99999-9999"
              inputMode="tel"
              autoComplete="tel"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Use o mesmo número que você informou no cadastro.
            </p>
          </div>
          {error && (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}
          <Button
            className="w-full"
            onClick={() => void search()}
            disabled={!phone || busy}
            aria-busy={busy}
          >
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Continuar
          </Button>
        </>
      ) : phase === "checkin" ? (
        <>
          <div className="rounded-md border border-primary/25 bg-primary/5 p-4">
            <div className="flex items-center gap-2 text-primary">
              <Sparkles className="h-4 w-4" />
              <p className="text-sm font-semibold">Participante de evento anterior</p>
            </div>
            <p className="mt-2 font-semibold text-foreground">{found?.displayName}</p>
            {found?.company ? (
              <p className="text-sm text-muted-foreground">{found.company}</p>
            ) : null}
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Identificamos seu cadastro realizado no <strong>{found?.previousEventName || "evento anterior"}</strong>.
              Deseja confirmar presença e ativar seus matches na <strong>SudoExpo 2026</strong> com seus dados atuais?
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              WhatsApp: {maskPhone(phone)}
            </p>
          </div>
          {error && (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}
          <div className="space-y-2">
            <Button
              className="w-full"
              onClick={() => void handleCheckin()}
              disabled={busy}
              aria-busy={busy}
              data-testid="phone-login-checkin"
            >
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirmar Check-in na SudoExpo 2026
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              disabled={busy}
              onClick={() => {
                setFound(null);
                setError(null);
                setPhase("phone");
              }}
            >
              Não sou eu / Trocar número
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="rounded-md border border-border bg-muted/40 p-4">
            <p className="text-sm text-muted-foreground">É você?</p>
            <p className="mt-1 font-semibold text-foreground">{found?.displayName}</p>
            {found?.company ? (
              <p className="text-sm text-muted-foreground">{found.company}</p>
            ) : null}
            <p className="mt-2 text-xs text-muted-foreground">
              Número informado: {maskPhone(phone)}
            </p>
          </div>
          {error && (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}
          <div className="space-y-2">
            <Button
              className="w-full"
              onClick={() => void enter()}
              disabled={busy}
              aria-busy={busy}
              data-testid="phone-login-confirm"
            >
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Sim, sou eu — entrar
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              disabled={busy}
              onClick={() => {
                setFound(null);
                setError(null);
                setPhase("phone");
              }}
            >
              Não é meu número
            </Button>
          </div>
        </>
      )}

      <div className="pt-2 text-center text-sm text-muted-foreground">
        Primeiro acesso?{" "}
        <Link to="/participar" className="font-medium text-primary hover:underline">
          Criar meu perfil
        </Link>
      </div>
    </div>
  );
}
