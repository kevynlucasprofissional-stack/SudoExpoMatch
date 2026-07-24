import { useCallback, useEffect, useRef, useState } from "react";
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
import {
  isRevealRetriable,
  translateRevealErrorCode,
} from "@/features/participant/presentation";
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
 * RevealContactDialog — máquina de estado em memória local.
 *
 * Regras de segurança (auditadas):
 * 1. `mutation.data`/`mutation.error`/`mutation.variables` são descartados
 *    IMEDIATAMENTE após a resposta ser copiada para state local, via
 *    `mutation.reset()`. Combinado com `gcTime: 0` no hook, o mutation
 *    cache global nunca guarda o contato.
 * 2. `requestVersionRef` invalida respostas tardias após unmount/close.
 * 3. `mountedRef` impede setState pós-unmount (React 18+ tolera, mas nunca
 *    devemos escrever em unmounted trees).
 * 4. `clearAndClose()` é o único caminho para sair do Dialog. Sempre limpa
 *    contact/errorCode/copied, incrementa a versão e chama reset() antes
 *    de propagar `onClose()`.
 * 5. Cleanup do unmount NUNCA chama `setState` (não teria efeito). Ele
 *    invalida a versão e chama `mutation.reset()` para purgar cache global.
 * 6. Retry só é oferecido para códigos recuperáveis (network, unknown,
 *    contact_unavailable). Estados de negócio (not_mutual, not_yet_introduced,
 *    contact_sharing_disabled, ...) exibem instrução e nenhum botão.
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
  const [isFetching, setIsFetching] = useState(false);

  const mountedRef = useRef(true);
  const requestVersionRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // Invalida qualquer request pendente e purga o cache do mutation.
      requestVersionRef.current += 1;
      mutation.reset();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mutation ref stable
  }, []);

  const run = useCallback(async () => {
    const version = ++requestVersionRef.current;
    setErrorCode(null);
    setContact(null);
    setIsFetching(true);
    try {
      const result = await mutation.mutateAsync(matchId);
      if (!mountedRef.current || version !== requestVersionRef.current) {
        // Componente desmontou ou fechou → não repovoe estado; ainda assim
        // garante que o mutation cache não retenha o payload.
        mutation.reset();
        return;
      }
      setContact(result);
      // Sucesso consumido para state local: purga mutation cache global.
      mutation.reset();
    } catch (err) {
      if (!mountedRef.current || version !== requestVersionRef.current) {
        mutation.reset();
        return;
      }
      const code: ErrorCode = err instanceof ApiError ? err.code : "unknown";
      setErrorCode(code);
      mutation.reset();
    } finally {
      if (mountedRef.current && version === requestVersionRef.current) {
        setIsFetching(false);
      }
    }
  }, [matchId, mutation]);

  // Dispara a busca ao abrir; controlado por dependência simples.
  useEffect(() => {
    if (!open) return;
    if (contact !== null || errorCode !== null || isFetching) return;
    void run();
  }, [open, contact, errorCode, isFetching, run]);

  const clearAndClose = useCallback(() => {
    requestVersionRef.current += 1;
    setContact(null);
    setErrorCode(null);
    setCopied(false);
    setIsFetching(false);
    mutation.reset();
    onClose();
  }, [mutation, onClose]);

  async function copyPhone() {
    if (!contact?.phone_e164) return;
    try {
      await navigator.clipboard.writeText(contact.phone_e164);
      setCopied(true);
      setTimeout(() => {
        if (mountedRef.current) setCopied(false);
      }, 2000);
    } catch {
      toast.error("Não foi possível copiar o telefone.");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) clearAndClose();
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

        {isFetching && !contact && !errorCode && (
          <div aria-busy="true" aria-live="polite">
            <Skeleton className="h-20 w-full" />
          </div>
        )}

        {errorCode && (
          <div className="space-y-2">
            <p
              role="alert"
              className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm"
            >
              {translateRevealErrorCode(errorCode)}
            </p>
            {isRevealRetriable(errorCode) && (
              <Button size="sm" onClick={() => void run()} disabled={isFetching}>
                Tentar novamente
              </Button>
            )}
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
