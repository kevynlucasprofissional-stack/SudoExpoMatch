import { useEffect, useState } from "react";
import { Check, Copy, MessageCircle, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useReleaseWhatsApp } from "@/features/staff/useConnectionsQueue";
import { translateStaffRevealError } from "@/features/staff/schemas";

export function waLink(phone: string): string {
  return `https://wa.me/${phone.replace(/\D/g, "")}`;
}

function ContactRow({ name, company, phone }: { name: string; company: string; phone: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(phone);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não foi possível copiar o número.");
    }
  }

  return (
    <div className="rounded-lg border p-3" data-testid="release-contact">
      <p className="font-medium">{name}</p>
      {company ? <p className="text-xs text-muted-foreground">{company}</p> : null}
      {phone ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-sm tabular-nums">{phone}</span>
          <Button size="sm" asChild>
            <a href={waLink(phone)} target="_blank" rel="noreferrer">
              <MessageCircle className="mr-1 h-4 w-4" /> Abrir WhatsApp
            </a>
          </Button>
          <Button size="sm" variant="outline" onClick={copy}>
            {copied ? (
              <>
                <Check className="mr-1 h-4 w-4" /> Copiado
              </>
            ) : (
              <>
                <Copy className="mr-1 h-4 w-4" /> Copiar número
              </>
            )}
          </Button>
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">Sem WhatsApp cadastrado.</p>
      )}
    </div>
  );
}

/**
 * Liberação rápida de WhatsApp pelo admin: destrava o contato para as duas
 * partes do match e já entrega os links wa.me para acionar cada uma.
 */
export function ReleaseWhatsAppDialog({
  matchId,
  pairLabel,
  alreadyReleased = false,
  onClose,
  onReleased,
}: {
  matchId: string | null;
  pairLabel?: string;
  alreadyReleased?: boolean;
  onClose: () => void;
  onReleased?: () => void;
}) {
  const release = useReleaseWhatsApp();
  const [reason, setReason] = useState("");

  useEffect(() => {
    release.reset();
    setReason("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  async function handleRelease() {
    if (!matchId) return;
    try {
      await release.mutateAsync({
        matchId,
        reason: reason.trim().length >= 3 ? reason.trim() : undefined,
      });
      toast.success("WhatsApp liberado para os dois participantes.");
      onReleased?.();
    } catch (err) {
      toast.error(translateStaffRevealError(err));
    }
  }

  function handleClose() {
    release.reset();
    setReason("");
    onClose();
  }

  return (
    <Dialog open={matchId !== null} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Liberar WhatsApp</DialogTitle>
          <DialogDescription>
            {pairLabel ? `${pairLabel} · ` : ""}Os dois participantes passam a ver o contato um do
            outro no painel. A ação fica registrada no log de auditoria.
          </DialogDescription>
        </DialogHeader>

        {!release.data && (
          <div className="space-y-3">
            {alreadyReleased ? (
              <p className="text-sm text-muted-foreground">
                O contato já está disponível para as duas partes. Confirme para ver os números.
              </p>
            ) : (
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                <p className="flex items-center gap-1 font-medium">
                  <ShieldAlert className="h-4 w-4" /> Liberação administrativa
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Libera o contato mesmo sem interesse mútuo ou apresentação presencial.
                </p>
              </div>
            )}
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Motivo (opcional) — ex.: participante pediu contato direto no estande."
              aria-label="Motivo da liberação"
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={handleClose} disabled={release.isPending}>
                Voltar
              </Button>
              <Button onClick={handleRelease} disabled={release.isPending}>
                <MessageCircle className="mr-1 h-4 w-4" />
                {release.isPending ? "Liberando…" : "Liberar WhatsApp"}
              </Button>
            </div>
          </div>
        )}

        {release.isError && !release.data && (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
          >
            {translateStaffRevealError(release.error)}
          </p>
        )}

        {release.data && (
          <div className="space-y-3">
            {release.data.map((c) => (
              <ContactRow key={c.profileId} name={c.name} company={c.company} phone={c.phone} />
            ))}
            <div className="flex justify-end">
              <Button variant="ghost" onClick={handleClose}>
                Fechar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
