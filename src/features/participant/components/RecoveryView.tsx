import { useEffect, useState } from "react";
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

import { EVENT_ID } from "@/lib/mock-data";
import { useRecoverProfile } from "@/features/participant/useRecoverProfile";
import { qk } from "@/features/participant/queryKeys";

/**
 * Tela de recuperação.
 * - WhatsApp/código apenas em `useState`; jamais em URL/localStorage/log.
 * - Sucesso limpa phone/code/error ANTES de exibir o novo código.
 * - Unmount/close limpa `newRecoveryCode` e demais estados.
 */
export function RecoveryView() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [whatsapp, setWhatsapp] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [rotatedCode, setRotatedCode] = useState<string | null>(null);
  const recoverMutation = useRecoverProfile();

  useEffect(() => {
    return () => {
      setWhatsapp("");
      setCode("");
      setError(null);
      setRotatedCode(null);
    };
  }, []);

  async function recover() {
    setError(null);
    try {
      const res = await recoverMutation.mutateAsync({
        eventId: EVENT_ID,
        whatsapp,
        code,
      });
      // Limpa credenciais em memória ANTES de exibir novo código.
      setWhatsapp("");
      setCode("");
      setError(null);
      if (res.newRecoveryCode) {
        setRotatedCode(res.newRecoveryCode);
      } else {
        toast.success("Bem-vindo(a) de volta!");
        qc.invalidateQueries({ queryKey: qk.ownProfile(EVENT_ID) });
        qc.invalidateQueries({ queryKey: qk.ownMatches(EVENT_ID) });
        navigate({ to: "/participante" });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao recuperar.");
    }
  }

  function confirmRotated() {
    setRotatedCode(null);
    qc.invalidateQueries({ queryKey: qk.ownProfile(EVENT_ID) });
    qc.invalidateQueries({ queryKey: qk.ownMatches(EVENT_ID) });
    toast.success("Bem-vindo(a) de volta!");
    navigate({ to: "/participante" });
  }

  return (
    <PageShell>
      <section className="mx-auto max-w-md px-4 py-12">
        <Card className="p-6">
          <h1 className="font-display text-2xl font-bold">
            Recuperar meu perfil
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Informe o WhatsApp e o código pessoal recebidos quando criou o
            perfil.
          </p>
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
              <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm text-destructive">
                {error}
              </p>
            )}
            <Button
              onClick={() => void recover()}
              className="w-full"
              disabled={!whatsapp || !code || recoverMutation.isPending}
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
            <Link
              to="/participar"
              className="font-medium text-primary hover:underline"
            >
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
