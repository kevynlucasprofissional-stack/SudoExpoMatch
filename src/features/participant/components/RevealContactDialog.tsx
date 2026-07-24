import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Copy, MessageCircle } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useRevealContactMutation } from "@/features/matching/queries";
import { ApiError } from "@/features/participant/api";
import { translateRevealErrorCode } from "@/features/participant/presentation";
import type {
  ErrorCode,
  RevealedContactDTO,
} from "@/features/participant/types";

interface Props {
  open: boolean;
  matchId: string;
  otherFirstName: string;
  onClose: () => void;
}

/**
 * Estado do contato revelado vive APENAS na memória deste componente.
 * Nunca é gravado em cache do React Query, localStorage, URL ou logs.
 * `useEffect` no `open === false` limpa contato + erro imediatamente.
 */
export function RevealContactDialog({
  open,
  matchId,
  otherFirstName,
  onClose,
}: Props) {
  const mutation = useRevealContactMutation();
  const [contact, setContact] = useState<RevealedContactDTO | null>(null);
  const [errorCode, setErrorCode] = useState<ErrorCode | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) {
      setContact(null);
      setErrorCode(null);
      setCopied(false);
    }
  }, [open]);

  useEffect(() => {
    // Defesa final ao desmontar — nunca deixar dados em memória.
    return () => {
      setContact(null);
      setErrorCode(null);
    };
  }, []);

  async function run() {
    setErrorCode(null);
    setContact(null);
    try {
      const c = await mutation.mutateAsync(matchId);
      setContact(c);
    } catch (err) {
      setErrorCode(err instanceof ApiError ? err.code : "unknown");
    }
  }

  useEffect(() => {
    if (open && !contact && !errorCode && !mutation.isPending) {
      void run();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function copyPhone() {
    if (!contact?.phone_e164) return;
    try {
      await navigator.clipboard.writeText(contact.phone_e164);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não foi possível copiar o telefone.");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Contato de {otherFirstName}</DialogTitle>
          <DialogDescription>
            Só liberamos após a apresentação feita pela equipe da ACIRV no
            evento.
          </DialogDescription>
        </DialogHeader>

        {mutation.isPending && !contact && !errorCode && (
          <Skeleton className="h-20 w-full" />
        )}

        {errorCode && (
          <div className="space-y-2">
            <p className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
              {translateRevealErrorCode(errorCode)}
            </p>
            {errorCode === "network" || errorCode === "unknown" ? (
              <Button size="sm" onClick={() => void run()}>
                Tentar novamente
              </Button>
            ) : null}
          </div>
        )}

        {contact && (
          <div className="space-y-2 rounded-lg border bg-muted/30 p-3 text-sm">
            <p className="font-semibold">{contact.name}</p>
            <p className="text-xs text-muted-foreground">{contact.company}</p>
            {contact.phone_e164 ? (
              <div className="flex items-center gap-2">
                <a
                  href={`https://wa.me/${contact.phone_e164.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-primary hover:underline"
                >
                  <MessageCircle className="h-4 w-4" /> {contact.phone_e164}
                </a>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto h-7 px-2 text-xs"
                  onClick={copyPhone}
                  aria-label="Copiar telefone"
                >
                  {copied ? (
                    <>
                      <Check className="mr-1 h-3.5 w-3.5" /> Copiado
                    </>
                  ) : (
                    <>
                      <Copy className="mr-1 h-3.5 w-3.5" /> Copiar telefone
                    </>
                  )}
                </Button>
              </div>
            ) : (
              <p className="text-muted-foreground">Sem WhatsApp cadastrado.</p>
            )}
            {contact.email && (
              <p>
                ✉️{" "}
                <a
                  href={`mailto:${contact.email}`}
                  className="text-primary hover:underline"
                >
                  {contact.email}
                </a>
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
