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
import { useAdminParticipantDetail } from "@/features/admin/useAdminParticipants";
import { translateAdminParticipantsError } from "@/features/admin/participantsSchemas";

function fmt(d: string | null | undefined) {
  if (!d) return "—";
  const date = new Date(d);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("pt-BR");
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
  const d = query.data;

  return (
    <Sheet open={profileId !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto sm:max-w-xl"
        aria-label="Detalhe do participante"
      >
        <SheetHeader>
          <SheetTitle className="font-display">
            {d?.profile.name ?? "Participante"}
          </SheetTitle>
          <SheetDescription>
            {d
              ? `${d.profile.company || "—"} · ${d.profile.city || "—"}`
              : "Carregando dados profissionais…"}
          </SheetDescription>
        </SheetHeader>

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
              <TabsTrigger value="ofertas">Ofertas ({d.offers.length})</TabsTrigger>
              <TabsTrigger value="necessidades">
                Necessidades ({d.needs.length})
              </TabsTrigger>
              <TabsTrigger value="matches">Matches ({d.matches.length})</TabsTrigger>
              <TabsTrigger value="conexoes">
                Conexões ({d.connections.length})
              </TabsTrigger>
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
                  <dt className="text-xs text-muted-foreground">Cadastro</dt>
                  <dd>{fmt(d.profile.created_at)}</dd>
                </div>
              </dl>
              <div>
                <p className="text-xs text-muted-foreground">Resumo</p>
                <p className="mt-1 whitespace-pre-wrap">{d.profile.summary || "—"}</p>
              </div>
              <p className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
                Dados de contato (WhatsApp e e-mail) não são exibidos nesta área.
                A liberação continua acontecendo no fluxo de conexão da equipe.
              </p>
            </TabsContent>

            <TabsContent value="ofertas" className="mt-4">
              {d.offers.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem ofertas ativas.</p>
              ) : (
                <ul className="space-y-2">
                  {d.offers.map((o) => (
                    <li key={o.id} className="rounded-md border p-3 text-sm">
                      <p className="font-medium">{o.label}</p>
                      {o.detail && (
                        <p className="text-muted-foreground">{o.detail}</p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-1">
                        {o.segment_id && (
                          <Badge variant="secondary">{o.segment_id}</Badge>
                        )}
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
                <p className="text-sm text-muted-foreground">
                  Sem necessidades ativas.
                </p>
              ) : (
                <ul className="space-y-2">
                  {d.needs.map((n) => (
                    <li key={n.id} className="rounded-md border p-3 text-sm">
                      <p className="font-medium">
                        {n.label}{" "}
                        {n.is_priority && <Badge className="ml-1">prioridade</Badge>}
                      </p>
                      {n.detail && (
                        <p className="text-muted-foreground">{n.detail}</p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-1">
                        <Badge variant="secondary">{n.need_kind}</Badge>
                        {n.segment_id && (
                          <Badge variant="secondary">{n.segment_id}</Badge>
                        )}
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
                        Para este participante: <strong>{m.score_for_participant}</strong>{" "}
                        · Para o outro: <strong>{m.score_for_other}</strong>
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        <Badge variant="secondary">
                          Participante: {labelText(m.label_for_participant, m.score_for_participant)}
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
                    <li
                      key={`${h.created_at}-${i}`}
                      className="rounded-md border p-3 text-sm"
                    >
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
      </SheetContent>
    </Sheet>
  );
}
