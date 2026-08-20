import { useEffect, useState } from "react";
import { toast } from "sonner";
import { KeyRound, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RecoveryCodeDialog } from "@/components/RecoveryCodeDialog";
import { rotateOwnRecoveryCode, ApiError } from "@/features/participant/api";

/**
 * Botão para rotacionar o código de recuperação.
 * - Confirmação obrigatória antes de invalidar o código anterior.
 * - Usa API v2 sanitizada (nunca supabase.rpc direto).
 * - Código mantido APENAS em memória; limpa ao confirmar/desmontar.
 * - Não permite iniciar nova rotação enquanto o Dialog do código atual
 *   estiver aberto.
 */
export function RotateRecoveryButton() {
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    return () => {
      // Defesa em profundidade: garante que o valor não sobrevive ao unmount.
      setCode(null);
    };
  }, []);

  async function rotate() {
    setConfirmOpen(false);
    setLoading(true);
    try {
      const c = await rotateOwnRecoveryCode();
      setCode(c);
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? err.code === "rate_limited"
            ? "Muitas tentativas. Aguarde alguns minutos."
            : err.code === "network"
              ? "Sem conexão. Tente novamente."
              : "Falha ao gerar código."
          : "Falha ao gerar código.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  const rotationPending = code !== null;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setConfirmOpen(true)}
        disabled={loading || rotationPending}
      >
        {loading ? (
          <Loader2 className="mr-1 h-4 w-4 animate-spin" />
        ) : (
          <KeyRound className="mr-1 h-4 w-4" />
        )}
        Gerar novo código
      </Button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Gerar um novo código de recuperação?</AlertDialogTitle>
            <AlertDialogDescription>
              O código anterior deixará de funcionar imediatamente. Você precisará salvar o novo
              código em local seguro — ele será exibido apenas uma vez.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={rotate}>Gerar novo código</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <RecoveryCodeDialog
        open={code !== null}
        code={code}
        onConfirm={() => setCode(null)}
        title="Seu novo código de recuperação"
        description="Guarde-o em local seguro. O código anterior deixou de funcionar."
      />
    </>
  );
}
