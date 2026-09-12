import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ArrowRight, MessageCircle } from "lucide-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ReleaseWhatsAppDialog } from "@/features/connections/ReleaseWhatsAppDialog";
import { WhatsAppOutreachModal } from "@/features/admin/WhatsAppOutreachModal";
import { shortName } from "@/features/admin/matchExplanation";


import { useAdminMatchDetail } from "@/features/admin/useAdminMatches";
import { MatchBriefingPanel } from "@/features/admin/MatchBriefingPanel";
import { EVENT_ID } from "@/config/event";
import { translateAdminMatchesError, type MatchReason } from "@/features/admin/matchesSchemas";
import {
  connectionStatusText,
  decisionText,
  fmtDateTime as fmt,
  kindText,
  sideLabelText,
} from "@/features/admin/matchesPresentation";

/**
 * Motivo complementar (Matcher v2.3): a auditoria precisa enxergar a cadeia
 * necessidade → relação (peso bruto) → oferta, o rationale HISTÓRICO gravado
 * no match e o estado ATUAL da relação, que pode ter mudado depois.
 */
function ReasonItem({ r }: { r: MatchReason }) {
  const rel = r.relation_current;
  return (
    <li className="rounded-md border p-3 text-sm" data-testid="reason-item">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">{r.label}</p>
        <Badge variant="secondary">+{r.weight} pts</Badge>
      </div>
      <p className="text-xs text-muted-foreground">{r.code}</p>

      {r.is_complement ? (
        <div className="mt-2 space-y-2" data-testid="reason-complement">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="outline">Precisa: {r.need?.label ?? "necessidade removida"}</Badge>
            <ArrowRight className="h-3 w-3 text-muted-foreground" aria-hidden />
            <Badge variant="outline">
              Relação complementar
              {r.relation_weight !== null ? ` (peso bruto ${r.relation_weight})` : ""}
            </Badge>
            <ArrowRight className="h-3 w-3 text-muted-foreground" aria-hidden />
            <Badge variant="outline">Oferece: {r.offer?.label ?? "oferta removida"}</Badge>
          </div>
          {r.need?.detail ? (
            <p className="text-xs text-muted-foreground">Detalhe da necessidade: {r.need.detail}</p>
          ) : null}
          {r.offer?.detail ? (
            <p className="text-xs text-muted-foreground">Detalhe da oferta: {r.offer.detail}</p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Justificativa registrada no match: {r.rationale_historic ?? "—"}
          </p>
          {rel ? (
            <p className="text-xs text-muted-foreground" data-testid="relation-current">
              Relação hoje: {rel.from_item_label ?? "?"} → {rel.to_item_label ?? "?"} ·{" "}
              {rel.relation_type} · peso {rel.weight} · {rel.active ? "ativa" : "inativa"}
              {rel.rationale_current ? ` · ${rel.rationale_current}` : ""}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground" data-testid="relation-missing">
              Relação de taxonomia não existe mais — o histórico acima é preservado.
            </p>
          )}
        </div>
      ) : null}
    </li>
  );
}

function PerspectivePanel({
  title,
  profile,
  score,
  label,
  decision,
  reasons,
  onOutreach,
}: {
  title: string;
  profile: { name: string; company: string; segment_label: string | null; summary: string };
  score: number;
  label: string;
  decision: string;
  reasons: MatchReason[];
  onOutreach?: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{title}</p>
          <p className="font-medium">
            {profile.name}
            {profile.company ? ` · ${profile.company}` : ""}
          </p>
          <p className="text-xs text-muted-foreground">{profile.segment_label ?? "—"}</p>
        </div>
        {onOutreach && (
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs border-emerald-500/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10"
            onClick={onOutreach}
          >
            <MessageCircle className="mr-1.5 h-3.5 w-3.5 text-emerald-600" />
            Abordar {shortName(profile.name)}
          </Button>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        <Badge>Score {score}</Badge>
        <Badge variant="secondary">{sideLabelText(label, score)}</Badge>
        <Badge variant="outline">{decisionText(decision)}</Badge>
      </div>
      {profile.summary ? <p className="text-sm text-muted-foreground">{profile.summary}</p> : null}
      <ul className="space-y-2">
        {reasons.length === 0 ? (
          <li className="text-sm text-muted-foreground">Sem motivos registrados.</li>
        ) : (
          reasons.map((r) => <ReasonItem key={r.id} r={r} />)
        )}
      </ul>
    </div>
  );
}

/**
 * IMPL 10 — detalhe read-only de um match. Sem ações de edição e sem contato.
 */
export function MatchDetailSheet({
  matchId,
  onClose,
}: {
  matchId: string | null;
  onClose: () => void;
}) {
  const query = useAdminMatchDetail(matchId, true);
  const d = query.data;
  const qc = useQueryClient();
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [outreachOpen, setOutreachOpen] = useState(false);
  const [outreachSide, setOutreachSide] = useState<"a" | "b">("b");
  const released =
    d?.connection != null &&
    ["apresentados", "contato_trocado", "concluido"].includes(d.connection.status);

  return (
    <Sheet open={matchId !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto sm:max-w-xl"
        aria-label="Detalhe do match"
      >
        <SheetHeader>
          <SheetTitle className="font-display">
            {d ? `${d.profile_a.name} ↔ ${d.profile_b.name}` : "Match"}
          </SheetTitle>
          <SheetDescription>
            Auditoria somente leitura do Matcher. Nenhum contato privado é exibido.
          </SheetDescription>
        </SheetHeader>

        {query.isLoading ? (
          <div className="mt-4 space-y-2" data-testid="detail-loading">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : query.isError ? (
          <p className="mt-4 text-sm text-destructive" role="alert">
            {translateAdminMatchesError(query.error)}
          </p>
        ) : d ? (
          <Tabs defaultValue="overview" className="mt-4">
            <TabsList className="flex w-full flex-wrap">
              <TabsTrigger value="overview">Visão geral</TabsTrigger>
              <TabsTrigger value="a">Perspectiva A</TabsTrigger>
              <TabsTrigger value="b">Perspectiva B</TabsTrigger>
              <TabsTrigger value="connection">Conexão</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-3 space-y-3 text-sm">
              <MatchBriefingPanel detail={d} eventId={EVENT_ID} />

              {/* Banner de abordagem rápida via WhatsApp */}
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                    <MessageCircle className="h-4 w-4 text-emerald-600" />
                    Abordagem Rápida via WhatsApp
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Aborde qualquer um dos participantes com mensagens pré-formatadas com IA e leitura comercial.
                </p>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-emerald-500/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10 text-xs"
                    onClick={() => {
                      setOutreachSide("a");
                      setOutreachOpen(true);
                    }}
                  >
                    <MessageCircle className="mr-1.5 h-3.5 w-3.5" /> Falar com {shortName(d.profile_a.name)}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-emerald-500/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10 text-xs"
                    onClick={() => {
                      setOutreachSide("b");
                      setOutreachOpen(true);
                    }}
                  >
                    <MessageCircle className="mr-1.5 h-3.5 w-3.5" /> Falar com {shortName(d.profile_b.name)}
                  </Button>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-md border p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Lado A</p>
                  <p className="font-medium">{d.profile_a.name}</p>
                  <p>
                    Score <strong>{d.match.score_for_a}</strong> ·{" "}
                    {sideLabelText(d.match.label_a, d.match.score_for_a)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Decisão: {decisionText(d.match.decision_a)}
                  </p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Lado B</p>
                  <p className="font-medium">{d.profile_b.name}</p>
                  <p>
                    Score <strong>{d.match.score_for_b}</strong> ·{" "}
                    {sideLabelText(d.match.label_b, d.match.score_for_b)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Decisão: {decisionText(d.match.decision_b)}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                <Badge variant="outline">{kindText(d.match.kind)}</Badge>
                <Badge variant="outline">{d.match.algorithm_version}</Badge>
                <Badge variant="outline">Assimetria {d.match.score_gap}</Badge>
                {d.match.mutual ? <Badge>Interesse mútuo</Badge> : null}
              </div>
              <p className="text-xs text-muted-foreground">
                Gerado em {fmt(d.match.generated_at)} · atualizado em {fmt(d.match.updated_at)}
              </p>
            </TabsContent>

            <TabsContent value="a" className="mt-3">
              <PerspectivePanel
                title="Motivos na perspectiva de A"
                profile={d.profile_a}
                score={d.match.score_for_a}
                label={d.match.label_a}
                decision={d.match.decision_a}
                reasons={d.reasons_a}
                onOutreach={() => {
                  setOutreachSide("a");
                  setOutreachOpen(true);
                }}
              />
            </TabsContent>

            <TabsContent value="b" className="mt-3">
              <PerspectivePanel
                title="Motivos na perspectiva de B"
                profile={d.profile_b}
                score={d.match.score_for_b}
                label={d.match.label_b}
                decision={d.match.decision_b}
                reasons={d.reasons_b}
                onOutreach={() => {
                  setOutreachSide("b");
                  setOutreachOpen(true);
                }}
              />
            </TabsContent>

            <TabsContent value="connection" className="mt-3 space-y-2 text-sm">
              {d.connection ? (
                <div className="rounded-md border p-3">
                  <Badge variant="secondary">{connectionStatusText(d.connection.status)}</Badge>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Criada em {fmt(d.connection.created_at)} · atualizada em{" "}
                    {fmt(d.connection.updated_at)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Apresentados: {fmt(d.connection.presented_at)} · contato trocado:{" "}
                    {fmt(d.connection.contact_exchanged_at)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Concluída: {fmt(d.connection.completed_at)} · cancelada:{" "}
                    {fmt(d.connection.cancelled_at)}
                  </p>
                </div>
              ) : (
                <p className="text-muted-foreground">Ainda não existe conexão para este match.</p>
              )}

              <Button
                className="w-full"
                variant={released ? "outline" : "default"}
                onClick={() => setReleaseOpen(true)}
                data-testid="release-whatsapp"
              >
                <MessageCircle className="mr-1 h-4 w-4" />
                {released ? "WhatsApp liberado · ver contatos" : "Liberar WhatsApp"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Libera o contato para as duas partes e entrega os links de WhatsApp para a equipe.
              </p>
            </TabsContent>

          </Tabs>
        ) : null}

        <ReleaseWhatsAppDialog
          matchId={releaseOpen ? matchId : null}
          pairLabel={d ? `${d.profile_a.name} ↔ ${d.profile_b.name}` : undefined}
          alreadyReleased={released}
          onClose={() => setReleaseOpen(false)}
          onReleased={() => {
            if (matchId) qc.invalidateQueries({ queryKey: ["admin", "match-detail", matchId] });
          }}
        />

        <WhatsAppOutreachModal
          match={d ?? null}
          open={outreachOpen}
          onClose={() => setOutreachOpen(false)}
          defaultSide={outreachSide}
          briefing={d?.briefing as any}
        />
      </SheetContent>
    </Sheet>
  );
}
