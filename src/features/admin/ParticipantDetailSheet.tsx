import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { EVENT_ID } from "@/config/event";
import { useStaffCheckinMutation } from "@/features/admin/useAdminEvents";
import {
  useAdminParticipantDetail,
  useAdminParticipantSocial,
  useAdminDeleteParticipantMutation,
} from "@/features/admin/useAdminParticipants";
import { ParticipantSocialPanel } from "@/features/admin/ParticipantSocialPanel";
import { translateAdminParticipantsError } from "@/features/admin/participantsSchemas";
import { DECISION_TEXT, LABEL_TEXT, matchLabelForScore } from "@/features/matching/presentation";
import type { Decision, MatchLabel } from "@/lib/types";

function fmt(d: string | null | undefined) {
  if (!d) return "—";
  const date = new Date(d);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("pt-BR");
}

/**
 * Classificação exibida sempre por perspectiva (Impl 1). Usa a label vinda do
 * backend quando presente; senão recalcula pelo score daquele lado.
 * Nunca usa `match.label` global.
 */
function labelText(label: string | null | undefined, score: number) {
  const key = (label ?? matchLabelForScore(score)) as MatchLabel;
  return LABEL_TEXT[key] ?? key;
}

const BUSINESS_SIZE_TEXT: Record<string, string> = {
  pequeno: "Pequeno",
  medio: "Médio",
  grande: "Grande",
};
const BUSINESS_TYPE_TEXT: Record<string, string> = {
  comercio: "Comércio",
  industria: "Indústria",
  servico: "Serviço",
};

function decisionText(decision: string) {
  return DECISION_TEXT[decision as Decision] ?? decision;
}

/**
 * IMPL 9 — detalhe read-only do participante. Sem contato privado:
 * o payload da RPC não traz WhatsApp/e-mail/código de recuperação, e a UI
 * não tem nenhuma ação de revelação (isso segue no fluxo de match da equipe).
 */
export function ParticipantDetailSheet({
  profileId,
  onClose,
}: {
  profileId: string | null;
  onClose: () => void;
}) {
  const query = useAdminParticipantDetail(profileId, true);
  const socialQuery = useAdminParticipantSocial(profileId, true);
  const checkinMutation = useStaffCheckinMutation();
  const deleteMutation = useAdminDeleteParticipantMutation();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const d = query.data;
  const isPreviousEvent = Boolean(d?.profile.event_id && d.profile.event_id !== EVENT_ID);

  return (
    <Sheet open={profileId !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto sm:max-w-xl"
        aria-label="Detalhe do participante"
      >
        <SheetHeader>
          <SheetTitle className="font-display">{d?.profile.name ?? "Participante"}</SheetTitle>
          <SheetDescription>
            {d
              ? `${d.profile.company || "—"} · ${d.profile.city || "—"}`
              : "Carregando dados profissionais…"}
          </SheetDescription>
        </SheetHeader>

        {d && (
          <div className="mt-3 flex items-center justify-between border-b pb-2">
            <span className="text-xs text-muted-foreground font-mono">
              Evento: {d.profile.event_id}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setShowDeleteConfirm(true)}
              data-testid="btn-sheet-delete-participant"
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              Excluir cadastro / Resetar WhatsApp
            </Button>
          </div>
        )}

        {isPreviousEvent && d && (
          <div className="mt-4 flex flex-col gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
            <div className="flex items-center gap-2 font-medium text-primary">
              <Sparkles className="h-4 w-4" />
              <span>Participante de edição anterior ({d.profile.event_id})</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Este participante está cadastrado em um evento anterior e não participa do matchmaking da SudoExpo 2026 até realizar o check-in.
            </p>
            <Button
              size="sm"
              className="mt-1 w-full sm:w-auto"
              disabled={checkinMutation.isPending}
              onClick={() => {
                if (!profileId) return;
                checkinMutation.mutate(profileId, {
                  onSuccess: () => {
                    toast.success(
                      `Check-in concluído! ${d.profile.name} agora está ativo na SudoExpo 2026.`
                    );
                    onClose();
                  },
                  onError: (err) => {
                    toast.error("Erro ao realizar check-in: " + err.message);
                  },
                });
              }}
            >
              {checkinMutation.isPending ? "Realizando check-in…" : "Realizar Check-in na SudoExpo 2026"}
            </Button>
          </div>
        )}

        {query.isLoading ? (
          <div className="mt-6 space-y-3" data-testid="detail-loading">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : query.isError ? (
          <p className="mt-6 text-sm text-destructive">
            {translateAdminParticipantsError(query.error)}
          </p>
        ) : d ? (
          <Tabs defaultValue="perfil" className="mt-6">
            <TabsList className="mb-2 flex h-auto w-full flex-wrap justify-start gap-1">
              <TabsTrigger value="perfil">Perfil</TabsTrigger>
              <TabsTrigger value="instagram">Instagram</TabsTrigger>
              <TabsTrigger value="ofertas">Ofertas ({d.offers.length})</TabsTrigger>
              <TabsTrigger value="necessidades">Necessidades ({d.needs.length})</TabsTrigger>
              <TabsTrigger value="matches">Matches ({d.matches.length})</TabsTrigger>
              <TabsTrigger value="conexoes">Conexões ({d.connections.length})</TabsTrigger>
              <TabsTrigger value="historico">Histórico</TabsTrigger>
            </TabsList>

            <TabsContent value="perfil" className="mt-4 space-y-3 text-sm">
              <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">Empresa</dt>
                  <dd>{d.profile.company || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Segmento</dt>
                  <dd>{d.profile.segment_label ?? d.profile.segment_id ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Cidade</dt>
                  <dd>
                    {d.profile.city || "—"}
                    {d.profile.neighborhood ? ` · ${d.profile.neighborhood}` : ""}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Porte</dt>
                  <dd>{BUSINESS_SIZE_TEXT[d.profile.business_size ?? ""] ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Tipo principal</dt>
                  <dd>{BUSINESS_TYPE_TEXT[d.profile.business_type ?? ""] ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Nicho</dt>
                  <dd>{d.profile.niche || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Cadastro</dt>
                  <dd>{fmt(d.profile.created_at)}</dd>
                </div>
              </dl>
              <div data-testid="target-profile">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Perfil procurado
                </p>
                <dl className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs text-muted-foreground">Porte desejado</dt>
                    <dd data-testid="target-size">
                      {BUSINESS_SIZE_TEXT[d.profile.target_business_size ?? ""] ?? "Qualquer"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Tipo desejado</dt>
                    <dd data-testid="target-type">
                      {BUSINESS_TYPE_TEXT[d.profile.target_business_type ?? ""] ?? "Qualquer"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Segmento desejado</dt>
                    <dd data-testid="target-segment">
                      {d.profile.target_segment_label ?? d.profile.target_segment_id ?? "Qualquer"}
                    </dd>
                  </div>
                </dl>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Resumo</p>
                <p className="mt-1 whitespace-pre-wrap">{d.profile.summary || "—"}</p>
              </div>
              <p className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
                Dados de contato (WhatsApp e e-mail) não são exibidos nesta área. A liberação
                continua acontecendo no fluxo de conexão da equipe.
              </p>
            </TabsContent>

            <TabsContent value="instagram" className="mt-4">
              <ParticipantSocialPanel query={socialQuery} profileId={profileId} />
            </TabsContent>

            <TabsContent value="ofertas" className="mt-4">
              {d.offers.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem ofertas ativas.</p>
              ) : (
                <ul className="space-y-2">
                  {d.offers.map((o) => (
                    <li key={o.id} className="rounded-md border p-3 text-sm">
                      <p className="font-medium">{o.label}</p>
                      {o.detail && <p className="text-muted-foreground">{o.detail}</p>}
                      <div className="mt-2 flex flex-wrap gap-1">
                        {o.segment_id && <Badge variant="secondary">{o.segment_id}</Badge>}
                        <Badge variant="outline">{o.source}</Badge>
                        {o.user_confirmed && <Badge variant="outline">confirmado</Badge>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>

            <TabsContent value="necessidades" className="mt-4">
              {d.needs.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem necessidades ativas.</p>
              ) : (
                <ul className="space-y-2">
                  {d.needs.map((n) => (
                    <li key={n.id} className="rounded-md border p-3 text-sm">
                      <p className="font-medium">
                        {n.label} {n.is_priority && <Badge className="ml-1">prioridade</Badge>}
                      </p>
                      {n.detail && <p className="text-muted-foreground">{n.detail}</p>}
                      <div className="mt-2 flex flex-wrap gap-1">
                        <Badge variant="secondary">{n.need_kind}</Badge>
                        {n.segment_id && <Badge variant="secondary">{n.segment_id}</Badge>}
                        <Badge variant="outline">{n.source}</Badge>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>

            <TabsContent value="matches" className="mt-4">
              {d.matches.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem matches ativos.</p>
              ) : (
                <ul className="space-y-2">
                  {d.matches.map((m) => (
                    <li key={m.id} className="rounded-md border p-3 text-sm">
                      <p className="font-medium">
                        {m.other_name}
                        {m.other_company ? ` · ${m.other_company}` : ""}
                      </p>
                      <p className="text-muted-foreground">
                        Para este participante: <strong>{m.score_for_participant}</strong> · Para o
                        outro: <strong>{m.score_for_other}</strong>
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        <Badge variant="secondary">
                          Participante:{" "}
                          {labelText(m.label_for_participant, m.score_for_participant)}
                        </Badge>
                        <Badge variant="outline">
                          Outro lado: {labelText(m.label_for_other, m.score_for_other)}
                        </Badge>
                        <Badge variant="outline">{m.kind}</Badge>
                        <Badge variant="outline">{m.algorithm_version}</Badge>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Decisões — participante:{" "}
                        <strong>{decisionText(m.decision_participant)}</strong> · outro:{" "}
                        <strong>{decisionText(m.decision_other)}</strong>
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>

            <TabsContent value="conexoes" className="mt-4">
              {d.connections.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem conexões.</p>
              ) : (
                <ul className="space-y-2">
                  {d.connections.map((c) => (
                    <li key={c.id} className="rounded-md border p-3 text-sm">
                      <p className="font-medium">{c.other_name}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">{c.status}</Badge>
                        <span className="text-xs text-muted-foreground">
                          criada em {fmt(c.created_at)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>

            <TabsContent value="historico" className="mt-4">
              {d.history.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem histórico.</p>
              ) : (
                <ol className="space-y-2">
                  {d.history.map((h, i) => (
                    <li key={`${h.created_at}-${i}`} className="rounded-md border p-3 text-sm">
                      <p>
                        <Badge variant="outline" className="mr-2">
                          {h.kind}
                        </Badge>
                        {h.action ?? "—"}
                        {h.new_status ? ` → ${h.new_status}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">{fmt(h.created_at)}</p>
                    </li>
                  ))}
                </ol>
              )}
            </TabsContent>
          </Tabs>
        ) : null}

        <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir participante / Resetar cadastro?</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja excluir o cadastro de <strong>{d?.profile.name}</strong>?
                Esta ação apagará todo o perfil, ofertas, necessidades e liberará o WhatsApp imediatamente para novos cadastros e testes.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleteMutation.isPending}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deleteMutation.isPending}
                onClick={() => {
                  if (!profileId) return;
                  deleteMutation.mutate(profileId, {
                    onSuccess: () => {
                      toast.success(`Cadastro de ${d?.profile.name ?? "participante"} excluído com sucesso!`);
                      setShowDeleteConfirm(false);
                      onClose();
                    },
                    onError: (err) => {
                      toast.error("Erro ao excluir participante: " + (err as Error).message);
                    },
                  });
                }}
              >
                {deleteMutation.isPending ? "Excluindo…" : "Sim, excluir cadastro"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}
