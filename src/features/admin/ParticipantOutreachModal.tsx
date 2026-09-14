import { useEffect, useMemo, useState } from "react";
import { Check, Copy, ExternalLink, MessageCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";

import { buildWhatsAppLink, cleanPhone } from "@/features/admin/outreachMessages";
import { generateParticipantReactivationMessage } from "@/features/admin/participantOutreach";
import {
  useLogParticipantOutreach,
  useParticipantOutreachContext,
} from "@/features/admin/useParticipantOutreach";

/**
 * IMPL 31 — abordagem participant-centric.
 * O contato é buscado SOB DEMANDA (ver `useParticipantOutreachContext`) e a
 * mensagem é editável antes de abrir o WhatsApp.
 */
export function ParticipantOutreachModal({
  profileId,
  open,
  onClose,
}: {
  profileId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const query = useParticipantOutreachContext(profileId, open);
  const logOutreach = useLogParticipantOutreach();

  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);

  const generated = useMemo(
    () => (query.data ? generateParticipantReactivationMessage(query.data) : ""),
    [query.data],
  );

  useEffect(() => {
    setMessage(generated);
    setCopied(false);
  }, [generated]);

  const ctx = query.data;
  const cleaned = cleanPhone(ctx?.phone_e164 ?? "");
  const hasPhone = cleaned.length >= 12;

  function logBestEffort(channel: "whatsapp" | "copy") {
    if (!profileId) return;
    logOutreach.mutate(
      { profileId, channel, messagePreview: message },
      { onError: () => undefined },
    );
  }

  function openWhatsApp() {
    if (!hasPhone || !ctx) return;
    window.open(
      buildWhatsAppLink(ctx.phone_e164 ?? "", message),
      "_blank",
      "noopener,noreferrer",
    );
    logBestEffort("whatsapp");
  }

  async function copyMessage() {
    if (!message) return;
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      logBestEffort("copy");
    } catch {
      toast.error("Não foi possível copiar a mensagem.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <MessageCircle className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="font-display text-lg">Chamar no WhatsApp</DialogTitle>
              <DialogDescription className="text-xs">
                Mensagem montada com o que realmente existe no perfil deste participante.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {query.isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : query.isError ? (
          <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
            Não foi possível carregar o contexto deste participante.
          </p>
        ) : ctx ? (
          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            <p className="font-semibold text-foreground">{ctx.name}</p>
            <p className="text-xs text-muted-foreground">{ctx.company || "Empresa não informada"}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t pt-2 text-xs">
              {hasPhone ? (
                <span className="font-mono font-semibold text-foreground">{ctx.phone_e164}</span>
              ) : (
                <span className="text-destructive" data-testid="outreach-no-phone">
                  WhatsApp não cadastrado
                </span>
              )}
              <Badge variant="outline">{ctx.active_matches_count} sugestão(ões) ativa(s)</Badge>
              {ctx.incoming_interests.length > 0 && (
                <Badge variant="secondary">
                  {ctx.incoming_interests.length} interesse(s) recebido(s)
                </Badge>
              )}
              {ctx.released_connections.length > 0 && (
                <Badge variant="secondary">
                  {ctx.released_connections.length} conexão(ões) liberada(s)
                </Badge>
              )}
            </div>
          </div>
        ) : null}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label htmlFor="outreach-msg" className="text-xs font-medium text-muted-foreground">
              Mensagem (edite livremente antes de enviar):
            </label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setMessage(generated)}
            >
              <RefreshCw className="mr-1 h-3 w-3" /> Restaurar
            </Button>
          </div>
          <Textarea
            id="outreach-msg"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={8}
            className="font-sans text-xs leading-relaxed"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <Button type="button" variant="outline" size="sm" onClick={copyMessage} disabled={!message}>
            {copied ? (
              <>
                <Check className="mr-1.5 h-4 w-4 text-emerald-600" /> Copiado!
              </>
            ) : (
              <>
                <Copy className="mr-1.5 h-4 w-4" /> Copiar mensagem
              </>
            )}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={openWhatsApp}
            disabled={!hasPhone || !message}
            title={hasPhone ? undefined : "Este participante não tem WhatsApp cadastrado."}
            className="bg-emerald-600 font-medium text-white shadow-sm hover:bg-emerald-700"
            data-testid="btn-outreach-open-whatsapp"
          >
            <MessageCircle className="mr-1.5 h-4 w-4" /> Abrir no WhatsApp
            <ExternalLink className="ml-1 h-3.5 w-3.5 opacity-80" />
          </Button>
        </div>

        {!hasPhone && !query.isLoading && (
          <p className="text-xs text-muted-foreground">
            Sem WhatsApp cadastrado não é possível abrir a conversa — você ainda pode copiar a
            mensagem e enviar por outro canal.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
