import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  History,
  MessageCircle,
  RefreshCw,
  Sparkles,
  UserCheck,
} from "lucide-react";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { EVENT_ID } from "@/config/event";
import {
  buildWhatsAppLink,
  cleanPhone,
  generateOutreachMessage,
  type OutreachParticipant,
} from "@/features/admin/outreachMessages";
import {
  useMatchContacts,
  useQuickConfirmConnection,
  useRecordOutreachAttempt,
} from "@/features/admin/useMatchOutreach";
import type { MatchBriefing, MatchDetail, MatchRow } from "@/features/admin/matchesSchemas";

export interface WhatsAppOutreachModalProps {
  match: MatchRow | MatchDetail | null;
  open: boolean;
  onClose: () => void;
  defaultSide?: "a" | "b";
  briefing?: MatchBriefing | null;
}

export function WhatsAppOutreachModal({
  match,
  open,
  onClose,
  defaultSide = "b",
  briefing,
}: WhatsAppOutreachModalProps) {
  const matchId = match ? ("match" in match ? match.match.id : match.id) : null;
  const contactsQuery = useMatchContacts(matchId, open);
  const recordOutreach = useRecordOutreachAttempt(EVENT_ID, matchId);
  const quickConfirm = useQuickConfirmConnection(EVENT_ID, matchId);

  // Determina dados dos perfis A e B dependendo de ser MatchRow ou MatchDetail
  const profileA = useMemo<OutreachParticipant | null>(() => {
    if (!match) return null;
    if ("profile_a" in match) {
      return {
        id: match.profile_a.id,
        name: match.profile_a.name,
        company: match.profile_a.company,
        segment: match.profile_a.segment_label,
        decision: match.match.decision_a,
      };
    }
    return {
      id: match.a_profile_id,
      name: match.a_name,
      company: match.a_company,
      segment: match.a_segment_label,
      decision: match.decision_a,
    };
  }, [match]);

  const profileB = useMemo<OutreachParticipant | null>(() => {
    if (!match) return null;
    if ("profile_b" in match) {
      return {
        id: match.profile_b.id,
        name: match.profile_b.name,
        company: match.profile_b.company,
        segment: match.profile_b.segment_label,
        decision: match.match.decision_b,
      };
    }
    return {
      id: match.b_profile_id,
      name: match.b_name,
      company: match.b_company,
      segment: match.b_segment_label,
      decision: match.decision_b,
    };
  }, [match]);

  const [activeSide, setActiveSide] = useState<"a" | "b">(defaultSide);
  const [editedMessage, setEditedMessage] = useState<string>("");
  const [copied, setCopied] = useState(false);

  // Alinha o lado ativo ao abrir
  useEffect(() => {
    if (open) {
      setActiveSide(defaultSide);
      setCopied(false);
    }
  }, [open, defaultSide]);

  // Contato correspondente ao lado ativo
  const activeProfile = activeSide === "a" ? profileA : profileB;
  const otherProfile = activeSide === "a" ? profileB : profileA;

  const activeContact = useMemo(() => {
    if (!contactsQuery.data || !activeProfile) return null;
    return contactsQuery.data.find((c) => c.profile_id === activeProfile.id) ?? null;
  }, [contactsQuery.data, activeProfile]);

  const isRecurrent = (activeContact?.outreach_count ?? 0) > 0;

  // Gera a mensagem inicial do lado ativo
  const generatedMessage = useMemo(() => {
    if (!activeProfile || !otherProfile) return "";

    const briefingSides = briefing?.sides;
    const briefingSide = activeSide === "a" ? briefingSides?.a : briefingSides?.b;

    return generateOutreachMessage({
      target: activeProfile,
      other: otherProfile,
      isRecurrent,
      briefingSummary: briefing?.summary ?? null,
      briefingSide: briefingSide ?? null,
    });
  }, [activeProfile, otherProfile, isRecurrent, briefing, activeSide]);

  // Atualiza mensagem editada quando a mensagem gerada ou lado mudar
  useEffect(() => {
    setEditedMessage(generatedMessage);
    setCopied(false);
  }, [generatedMessage, activeSide]);

  if (!match) return null;

  const phone = activeContact?.phone_e164 || "";
  const cleanedPhone = cleanPhone(phone);
  const hasPhone = cleanedPhone.length >= 10;

  const connectionStatus =
    "connection" in match ? match.connection?.status : match.connection_status;
  const isConnectionReleased =
    connectionStatus &&
    ["apresentados", "contato_trocado", "concluido"].includes(connectionStatus);

  async function handleOpenWhatsApp() {
    if (!hasPhone || !activeProfile || !matchId) {
      toast.error("Telefone de WhatsApp não disponível para este participante.");
      return;
    }

    const link = buildWhatsAppLink(phone, editedMessage);
    window.open(link, "_blank", "noopener,noreferrer");

    try {
      await recordOutreach.mutateAsync({
        eventId: EVENT_ID,
        matchId,
        profileId: activeProfile.id,
        templateType: isRecurrent ? "recurrent_contact" : "first_contact",
        messagePreview: editedMessage.slice(0, 300),
      });
      toast.success("WhatsApp aberto e abordagem registrada no histórico!");
    } catch {
      // Ignora erro silencioso de log para não bloquear o operador
    }
  }

  async function handleCopyMessage() {
    if (!editedMessage || !activeProfile || !matchId) return;
    try {
      await navigator.clipboard.writeText(editedMessage);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      toast.success("Mensagem copiada para a área de transferência!");

      await recordOutreach.mutateAsync({
        eventId: EVENT_ID,
        matchId,
        profileId: activeProfile.id,
        templateType: isRecurrent ? "recurrent_contact" : "first_contact",
        messagePreview: editedMessage.slice(0, 300),
      });
    } catch {
      toast.error("Não foi possível copiar a mensagem.");
    }
  }

  async function handleQuickConfirm() {
    if (!matchId) return;
    try {
      await quickConfirm.mutateAsync({
        matchId,
        reason: `Confirmado após abordagem WhatsApp com ${activeProfile?.name}`,
      });
      toast.success("Conexão efetivada e contatos liberados com sucesso!");
      contactsQuery.refetch();
    } catch (err: any) {
      toast.error(err?.message || "Falha ao liberar conexão.");
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
              <DialogTitle className="font-display text-lg">
                Abordagem via WhatsApp (ACIRV)
              </DialogTitle>
              <DialogDescription className="text-xs">
                Mensagem inteligente com leitura comercial do Matcher e IA.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Seleção do participante a abordar */}
        <div className="mt-2">
          <Tabs value={activeSide} onValueChange={(v) => setActiveSide(v as "a" | "b")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="a" className="truncate text-xs">
                Lado A: {profileA?.name ?? "Lado A"}
              </TabsTrigger>
              <TabsTrigger value="b" className="truncate text-xs">
                Lado B: {profileB?.name ?? "Lado B"}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Card do Destinatário & Histórico */}
        {contactsQuery.isLoading ? (
          <div className="space-y-2 py-2">
            <Skeleton className="h-14 w-full" />
          </div>
        ) : (
          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold text-foreground">{activeProfile?.name}</p>
                <p className="text-xs text-muted-foreground">
                  {activeProfile?.company || "Empresa não informada"} ·{" "}
                  {activeProfile?.segment || "Segmento geral"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {isRecurrent ? (
                  <Badge
                    variant="secondary"
                    className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                  >
                    <History className="mr-1 h-3 w-3" />
                    Contato Recorrente ({activeContact?.outreach_count}x)
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-sky-500/40 text-sky-600 dark:text-sky-400">
                    <Sparkles className="mr-1 h-3 w-3" />
                    1º Contato (Novo)
                  </Badge>
                )}

                {activeProfile?.decision === "interesse" ? (
                  <Badge variant="default" className="bg-primary/90 text-xs">
                    Demonstrou interesse
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs">
                    Pendente / Sem decisão
                  </Badge>
                )}
              </div>
            </div>

            <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t pt-2 text-xs">
              <span className="font-medium text-muted-foreground">WhatsApp:</span>
              {hasPhone ? (
                <span className="font-mono text-foreground font-semibold">{phone}</span>
              ) : (
                <span className="text-destructive">Telefone não cadastrado</span>
              )}
              {activeContact?.last_outreach_at ? (
                <span className="text-muted-foreground">
                  · Último contato em{" "}
                  {new Date(activeContact.last_outreach_at).toLocaleDateString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              ) : null}
            </div>
          </div>
        )}

        {/* Prévia da Mensagem (Editável) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-muted-foreground">
              Mensagem pré-formatada para WhatsApp:
            </label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setEditedMessage(generatedMessage)}
              title="Restaurar mensagem original gerada pela IA"
            >
              <RefreshCw className="mr-1 h-3 w-3" /> Restaurar
            </Button>
          </div>

          <Textarea
            value={editedMessage}
            onChange={(e) => setEditedMessage(e.target.value)}
            rows={7}
            className="font-sans text-xs leading-relaxed"
            placeholder="Redija ou ajuste a mensagem de abordagem..."
          />
        </div>

        {/* Ações de Envio e Cópia */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCopyMessage}
            disabled={!editedMessage}
          >
            {copied ? (
              <>
                <Check className="mr-1.5 h-4 w-4 text-emerald-600" />
                Copiado!
              </>
            ) : (
              <>
                <Copy className="mr-1.5 h-4 w-4" />
                Copiar Mensagem
              </>
            )}
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={handleOpenWhatsApp}
            disabled={!hasPhone || !editedMessage || recordOutreach.isPending}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-sm"
          >
            <MessageCircle className="mr-1.5 h-4 w-4" />
            {recordOutreach.isPending ? "Abrindo…" : "Abrir no WhatsApp"}
            <ExternalLink className="ml-1 h-3.5 w-3.5 opacity-80" />
          </Button>
        </div>

        {/* Seção de Efetivação / Liberação em 1 Clique */}
        <div className="mt-1 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-semibold text-foreground">
                Participante respondeu positivamente?
              </p>
              <p className="text-muted-foreground">
                {isConnectionReleased
                  ? "Conexão já está ativa e contatos já estão liberados."
                  : "Efetive a conexão e libere os contatos para ambos em 1 clique."}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant={isConnectionReleased ? "outline" : "default"}
              disabled={isConnectionReleased || quickConfirm.isPending}
              onClick={handleQuickConfirm}
              className="font-medium"
            >
              <UserCheck className="mr-1.5 h-4 w-4" />
              {quickConfirm.isPending
                ? "Liberando…"
                : isConnectionReleased
                  ? "Conexão Ativa"
                  : "Confirmar Interesse & Liberar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
