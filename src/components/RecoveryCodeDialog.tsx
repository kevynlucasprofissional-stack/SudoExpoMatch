import { useEffect, useState } from "react";
import { Copy, Check, ShieldAlert } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

interface Props {
  open: boolean;
  code: string | null;
  onConfirm: () => void;
  title?: string;
  description?: string;
}

/**
 * Modal obrigatório que mostra o código de recuperação UMA vez.
 * Não fecha sozinho: o usuário precisa marcar "Já salvei" e confirmar.
 */
export function RecoveryCodeDialog({
  open, code, onConfirm,
  title = "Guarde seu código de recuperação",
  description = "Esse código é a única forma de recuperar seu perfil em outro aparelho. Ele não será exibido novamente."
}: Props) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  // Reseta o estado sempre que o diálogo abre ou o código muda — evita que a
  // confirmação da primeira exibição permaneça marcada em uma segunda rotação.
  useEffect(() => {
    if (open) {
      setSaved(false);
      setCopied(false);
    }
  }, [open, code]);

  async function copy() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <Dialog open={open}>
      <DialogContent
        className="sm:max-w-md"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-full bg-warning/20 text-warning">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="my-4 rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 p-6 text-center">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            Seu código
          </p>
          <p className="mt-2 font-mono text-3xl font-bold tracking-widest">
            {code ?? "…"}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-4"
            onClick={copy}
            disabled={!code}
          >
            {copied ? (
              <><Check className="mr-1 h-4 w-4" /> Copiado</>
            ) : (
              <><Copy className="mr-1 h-4 w-4" /> Copiar código</>
            )}
          </Button>
        </div>

        <label className="flex cursor-pointer items-start gap-2 rounded-md border p-3">
          <Checkbox
            checked={saved}
            onCheckedChange={(v) => setSaved(Boolean(v))}
            id="ack-saved-code"
          />
          <span className="text-sm">
            Já salvei este código em local seguro. Entendo que ele não aparecerá de novo.
          </span>
        </label>

        <DialogFooter>
          <Button
            className="w-full"
            disabled={!saved || !code}
            onClick={onConfirm}
          >
            Já salvei — continuar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
