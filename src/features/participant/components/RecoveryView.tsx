import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { PageShell } from "@/components/brand/BrandShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RecoveryCodeDialog } from "@/components/RecoveryCodeDialog";

import { EVENT_ID } from "@/config/event";
import { useRecoverProfile } from "@/features/participant/useRecoverProfile";
import { qk } from "@/features/participant/queryKeys";
import { WhatsappAccessCard } from "@/features/access/WhatsappAccessCard";
import { usePhoneAuthCapability } from "@/features/access/usePhoneAuthCapability";

/**
 * Tela de recuperação — política de dados sensíveis.
 *
 * - WhatsApp/código/`newRecoveryCode` vivem APENAS em `useState` deste
 *   componente. Nunca URL, localStorage, sessionStorage, cookies ou logs.
 * - `useRecoverProfile` é uma mutation; após consumir seu resultado
 *   copiamos apenas `newRecoveryCode` (quando houver) para state local e
 *   chamamos `recoverMutation.reset()` IMEDIATAMENTE, para que
 *   `mutation.data` e `mutation.variables` (WhatsApp/código) não fiquem
 *   no mutation cache global.
 * - `requestVersionRef` invalida respostas tardias após unmount/navegação.
 * - Cleanup do unmount NUNCA chama setState (não faz efeito). Ele
 *   incrementa a versão e chama `mutation.reset()`.
 */
export function RecoveryView() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [whatsapp, setWhatsapp] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [rotatedCode, setRotatedCode] = useState<string | null>(null);
  const recoverMutation = useRecoverProfile();
  const capability = usePhoneAuthCapability();

  const mountedRef = useRef(true);
  const requestVersionRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestVersionRef.current += 1;
      recoverMutation.reset();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mutation ref stable
  }, []);

  const recover = useCallback(async () => {
    const version = ++requestVersionRef.current;
    setError(null);
    try {
      const res = await recoverMutation.mutateAsync({
        eventId: EVENT_ID,
        whatsapp,
        code,
      });
      // Purga IMEDIATAMENTE variables/data do mutation cache.
      const rotated = res.newRecoveryCode ?? null;
      recoverMutation.reset();

      if (!mountedRef.current || version !== requestVersionRef.current) return;

      // Só depois lidamos com estado local.
      setWhatsapp("");
      setCode("");
      setError(null);
      if (rotated) {
        setRotatedCode(rotated);
      } else {
        qc.invalidateQueries({ queryKey: qk.ownProfile(EVENT_ID) });
        qc.invalidateQueries({ queryKey: qk.ownMatches(EVENT_ID) });
        toast.success("Bem-vindo(a) de volta!");
        navigate({ to: "/participante" });
      }
    } catch (err) {
      recoverMutation.reset();
      if (!mountedRef.current || version !== requestVersionRef.current) return;
      setError(err instanceof Error ? err.message : "Falha ao recuperar.");
    }
  }, [whatsapp, code, recoverMutation, qc, navigate]);

  const confirmRotated = useCallback(() => {
    requestVersionRef.current += 1;
    setRotatedCode(null);
    setWhatsapp("");
    setCode("");
    setError(null);
    recoverMutation.reset();
    qc.invalidateQueries({ queryKey: qk.ownProfile(EVENT_ID) });
    qc.invalidateQueries({ queryKey: qk.ownMatches(EVENT_ID) });
    toast.success("Bem-vindo(a) de volta!");
    navigate({ to: "/participante" });
  }, [recoverMutation, qc, navigate]);

  return (
    <PageShell>
      <section className="mx-auto max-w-md px-4 py-12">
        <Card className="p-6">
          <h1 className="font-display text-2xl font-bold">Acessar meu perfil</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {capability.otpEnabled
              ? "Use seu WhatsApp para entrar sem senha."
              : "Informe o WhatsApp e o código pessoal recebidos quando criou o perfil."}
          </p>

          {capability.otpEnabled && (
            <div className="mt-6">
              <WhatsappAccessCard capability={capability} />
              <div className="mt-6 flex items-center gap-3">
                <span className="h-px flex-1 bg-border" />
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  ou use seu código pessoal
                </span>
                <span className="h-px flex-1 bg-border" />
              </div>
            </div>
          )}

          <div className="mt-6 space-y-4">
            <div>
              <Label htmlFor="wa">WhatsApp</Label>
              <Input
                id="wa"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="(64) 99999-9999"
                inputMode="tel"
                autoComplete="tel"
              />
            </div>
            <div>
              <Label htmlFor="code">Código pessoal</Label>
              <Input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="Ex.: A1B2C3"
                className="font-mono uppercase"
                autoComplete="one-time-code"
              />
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
              onClick={() => void recover()}
              className="w-full"
              disabled={!whatsapp || !code || recoverMutation.isPending}
              aria-busy={recoverMutation.isPending}
            >
              {recoverMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Recuperando…
                </>
              ) : (
                "Entrar"
              )}
            </Button>
          </div>
          <div className="mt-6 text-center text-sm text-muted-foreground">
            Primeiro acesso?{" "}
            <Link to="/participar" className="font-medium text-primary hover:underline">
              Criar meu perfil
            </Link>
          </div>
        </Card>
      </section>

      <RecoveryCodeDialog
        open={rotatedCode !== null}
        code={rotatedCode}
        onConfirm={confirmRotated}
        title="Seu novo código de recuperação"
        description="Rotacionamos seu código por segurança. Guarde-o em local seguro — o antigo deixou de funcionar."
      />
    </PageShell>
  );
}
