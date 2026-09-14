import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ClientOnly } from "@tanstack/react-router";
import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { zodValidator } from "@tanstack/zod-adapter";
import { ArrowLeft, Network, RotateCcw, Search, ShieldAlert } from "lucide-react";

import { PageShell } from "@/components/brand/BrandShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";

import { EVENT_ID } from "@/config/event";
import { AdminEventProvider, useAdminEvent } from "@/features/admin/AdminEventContext";
import { EventSelector } from "@/features/admin/EventSelector";
import { useSession } from "@/features/auth/useSession";
import { useEventRole } from "@/features/staff/useEventRole";
import { useEventSegments } from "@/features/staff/useEventSegments";
import { useDebouncedValue } from "@/features/admin/useAdminParticipants";
import { useAdminMatchGraph } from "@/features/admin/useAdminMatchGraph";
import { translateAdminGraphError, INTEREST_STATES } from "@/features/admin/graphSchemas";
import {
  INTEREST_COLOR,
  INTEREST_LABEL,
  filterGraph,
  nodeInterestSummary,
  segmentColor,
} from "@/features/admin/graphPresentation";
import { graphSearchSchema, normalizeGraphSearch } from "@/features/admin/graphUrlState";
import { MatchDetailSheet } from "@/features/admin/MatchDetailSheet";
import { ParticipantDetailSheet } from "@/features/admin/ParticipantDetailSheet";

/** Canvas é browser-only: import dinâmico atrás de <ClientOnly>. */
const MatchGraphCanvas = lazy(() =>
  import("@/features/admin/MatchGraphCanvas").then((m) => ({ default: m.MatchGraphCanvas })),
);

export const Route = createFileRoute("/admin_/graph")({
  validateSearch: zodValidator(graphSearchSchema),
  head: () => ({
    meta: [
      { title: "Mapa de conexões — Administração Matchmaker SudoExpo" },
      {
        name: "description",
        content:
          "Visualização em grafo dos participantes e das duplas ativas do Matchmaker SudoExpo, com estado de interesse por dupla.",
      },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: GraphRoute,
});

function GraphRoute() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useSession();
  const roleQuery = useEventRole(EVENT_ID);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) navigate({ to: "/equipe" });
  }, [isLoading, isAuthenticated, navigate]);

  if (isLoading || !isAuthenticated || roleQuery.isLoading) {
    return (
      <PageShell>
        <div className="mx-auto max-w-6xl px-4 py-12">
          <Skeleton className="h-64 w-full" />
        </div>
      </PageShell>
    );
  }

  if (!roleQuery.data) {
    return (
      <PageShell>
        <section className="mx-auto max-w-md px-4 py-12">
          <Card className="p-6 text-center">
            <ShieldAlert className="mx-auto h-10 w-10 text-destructive" />
            <h1 className="mt-3 font-display text-xl font-semibold">Acesso negado</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Esta área é exclusiva da equipe e da administração do evento.
            </p>
            <Button asChild className="mt-4">
              <Link to="/equipe">Voltar</Link>
            </Button>
          </Card>
        </section>
      </PageShell>
    );
  }

  return (
    <AdminEventProvider>
      <GraphPage />
    </AdminEventProvider>
  );
}

function GraphPage() {
  const navigate = useNavigate({ from: "/admin/graph" });
  const search = Route.useSearch();
  const filters = useMemo(() => normalizeGraphSearch(search), [search]);
  const { selectedEventId } = useAdminEvent();

  const [qDraft, setQDraft] = useState(filters.q);
  const debouncedQ = useDebouncedValue(qDraft, 350);
  useEffect(() => {
    if (debouncedQ !== filters.q) {
      void navigate({ search: (prev) => ({ ...prev, q: debouncedQ }) });
    }
  }, [debouncedQ, filters.q, navigate]);

  const segmentsQuery = useEventSegments(selectedEventId);
  const graphQuery = useAdminMatchGraph(selectedEventId, true);

  const view = useMemo(() => {
    if (!graphQuery.data) return null;
    return filterGraph(graphQuery.data, filters);
  }, [graphQuery.data, filters]);

  const setState = (state: (typeof INTEREST_STATES)[number], on: boolean) => {
    const next = on
      ? [...new Set([...filters.states, state])]
      : filters.states.filter((s) => s !== state);
    void navigate({ search: (prev) => ({ ...prev, st: next.join(",") }) });
  };

  const toggleSegment = (id: string, on: boolean) => {
    const next = on
      ? [...new Set([...filters.segments, id])]
      : filters.segments.filter((s) => s !== id);
    void navigate({ search: (prev) => ({ ...prev, seg: next.join(",") }) });
  };

  const resetFilters = () => {
    setQDraft("");
    void navigate({
      search: () => ({
        st: "",
        min: "",
        max: "",
        seg: "",
        q: "",
        conn: "",
        rev: "",
        iso: "",
        p: "",
        pd: "",
        m: "",
      }),
    });
  };

  const selectedNode = view?.nodes.find((n) => n.profile_id === filters.selectedProfileId) ?? null;
  /** grau original do evento (não recalculado pelo subgrafo filtrado) */
  const selectedTotalDegree =
    graphQuery.data && filters.selectedProfileId
      ? (graphQuery.data.nodes.find((n) => n.profile_id === filters.selectedProfileId)?.degree ?? 0)
      : 0;
  const selectedSummary =
    view && filters.selectedProfileId
      ? nodeInterestSummary(view.edges, filters.selectedProfileId)
      : null;
  /** totais do evento inteiro, para não induzir erro com os números filtrados */
  const selectedTotals =
    graphQuery.data && filters.selectedProfileId
      ? nodeInterestSummary(graphQuery.data.edges, filters.selectedProfileId)
      : null;

  return (
    <PageShell>
      <section className="mx-auto max-w-6xl px-4 py-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Network className="h-5 w-5 text-primary" />
              <h1 className="font-display text-2xl font-semibold">Mapa de conexões</h1>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Cada bolinha é um participante; cada linha é uma dupla ativa encontrada pelo
              matcher. A cor mostra o estado do interesse.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <EventSelector />
            <Button asChild variant="ghost" size="sm">
              <Link to="/admin">
                <ArrowLeft className="mr-1 h-4 w-4" /> Administração
              </Link>
            </Button>
          </div>
        </header>

        <Card className="mt-6 space-y-4 p-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="graph-q">Buscar pessoa ou empresa</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="graph-q"
                  className="pl-8"
                  placeholder="Nome ou empresa"
                  value={qDraft}
                  onChange={(e) => setQDraft(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="graph-min">Score mínimo</Label>
                <Input
                  id="graph-min"
                  inputMode="numeric"
                  placeholder="ex.: 55"
                  value={filters.minScore ?? ""}
                  onChange={(e) =>
                    void navigate({
                      search: (prev) => ({ ...prev, min: e.target.value.replace(/\D/g, "") }),
                    })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="graph-max">Score máximo</Label>
                <Input
                  id="graph-max"
                  inputMode="numeric"
                  placeholder="ex.: 40"
                  value={filters.maxScore ?? ""}
                  onChange={(e) =>
                    void navigate({
                      search: (prev) => ({ ...prev, max: e.target.value.replace(/\D/g, "") }),
                    })
                  }
                />
              </div>
            </div>
            <div className="space-y-3 pt-1">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="graph-conn" className="text-sm font-normal">
                  Só duplas com conexão
                </Label>
                <Switch
                  id="graph-conn"
                  checked={filters.onlyConnected}
                  onCheckedChange={(v) =>
                    void navigate({ search: (prev) => ({ ...prev, conn: v ? "1" : "" }) })
                  }
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="graph-rev" className="text-sm font-normal">
                  Só duplas revisadas
                </Label>
                <Switch
                  id="graph-rev"
                  checked={filters.onlyReviewed}
                  onCheckedChange={(v) =>
                    void navigate({ search: (prev) => ({ ...prev, rev: v ? "1" : "" }) })
                  }
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="graph-iso" className="text-sm font-normal">
                  Mostrar participantes isolados
                </Label>
                <Switch
                  id="graph-iso"
                  checked={filters.showIsolated}
                  onCheckedChange={(v) =>
                    void navigate({ search: (prev) => ({ ...prev, iso: v ? "1" : "" }) })
                  }
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {INTEREST_STATES.map((state) => (
              <label key={state} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={filters.states.includes(state)}
                  onCheckedChange={(v) => setState(state, v === true)}
                  aria-label={INTEREST_LABEL[state]}
                />
                <span
                  aria-hidden
                  className="inline-block h-3 w-3 rounded-full"
                  style={{ backgroundColor: INTEREST_COLOR[state] }}
                />
                {INTEREST_LABEL[state]}
                {view ? (
                  <span className="text-muted-foreground">({view.counts[state]})</span>
                ) : null}
              </label>
            ))}
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              <RotateCcw className="mr-1 h-4 w-4" /> Limpar filtros
            </Button>
          </div>

          {segmentsQuery.data && segmentsQuery.data.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {segmentsQuery.data.map((s) => {
                const on = filters.segments.includes(s.id);
                return (
                  <Button
                    key={s.id}
                    type="button"
                    size="sm"
                    variant={on ? "default" : "outline"}
                    onClick={() => toggleSegment(s.id, !on)}
                  >
                    <span className="mr-1">{s.emoji}</span>
                    {s.label}
                  </Button>
                );
              })}
            </div>
          ) : null}
        </Card>

        <Card className="mt-4 overflow-hidden p-3">
          {graphQuery.isError ? (
            <p className="p-8 text-center text-sm text-destructive">
              {translateAdminGraphError((graphQuery.error as Error | undefined)?.message)}
            </p>
          ) : graphQuery.isLoading || !view ? (
            <Skeleton className="h-[62vh] min-h-[380px] w-full" />
          ) : view.edges.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">
              Nenhuma dupla corresponde aos filtros escolhidos.
            </p>
          ) : (
            <ClientOnly fallback={<Skeleton className="h-[62vh] min-h-[380px] w-full" />}>
              <Suspense fallback={<Skeleton className="h-[62vh] min-h-[380px] w-full" />}>
                <MatchGraphCanvas
                  nodes={view.nodes}
                  edges={view.edges}
                  onNodeClick={(profileId) =>
                    void navigate({
                      search: (prev) => ({ ...prev, p: profileId, pd: "1", m: "" }),
                    })
                  }
                  onEdgeClick={(matchId) =>
                    void navigate({ search: (prev) => ({ ...prev, m: matchId }) })
                  }
                />
              </Suspense>
            </ClientOnly>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary">{view?.nodes.length ?? 0} pessoas visíveis</Badge>
            <Badge variant="secondary">{view?.edges.length ?? 0} duplas visíveis</Badge>
            <Badge variant="outline">{view?.counts.none ?? 0} sem decisão</Badge>
            <Badge variant="outline">{view?.counts.single ?? 0} interesse de um lado</Badge>
            <Badge variant="outline">{view?.counts.mutual ?? 0} interesse mútuo</Badge>
            <Badge variant="outline">{view?.counts.declined ?? 0} recusado/misto</Badge>
            {graphQuery.data ? (
              <Badge variant="outline">{graphQuery.data.meta.edges_total} duplas ativas no evento</Badge>
            ) : null}
            <span>Clique em uma bolinha para ver o participante, ou em uma linha para o match.</span>
          </div>
        </Card>

        {selectedNode && selectedSummary ? (
          <Card className="mt-4 space-y-3 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="inline-block h-3 w-3 rounded-full"
                    style={{ backgroundColor: segmentColor(selectedNode.segment_id) }}
                  />
                  <h2 className="font-display text-lg font-semibold">{selectedNode.name}</h2>
                </div>
                <p className="text-sm text-muted-foreground">
                  {selectedNode.company || "Empresa não informada"}
                  {selectedNode.segment_label ? ` · ${selectedNode.segment_label}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => void navigate({ search: (prev) => ({ ...prev, pd: "1" }) })}
                >
                  Ficha completa
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link to="/admin/matches" search={{ q: selectedNode.name }}>
                    Ver duplas em Matches
                  </Link>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void navigate({ search: (prev) => ({ ...prev, p: "", pd: "" }) })}
                >
                  Fechar
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="secondary">{selectedSummary.visible} duplas visíveis</Badge>
              <Badge variant="outline">grau total {selectedNode.degree}</Badge>
              <Badge variant="outline">{selectedSummary.sent} interesses enviados</Badge>
              <Badge variant="outline">{selectedSummary.received} interesses recebidos</Badge>
              <Badge variant="outline">{selectedSummary.mutual} interesses mútuos</Badge>
            </div>
          </Card>
        ) : null}
      </section>

      <ParticipantDetailSheet
        profileId={filters.profileSheetOpen ? filters.selectedProfileId : null}
        onClose={() => void navigate({ search: (prev) => ({ ...prev, pd: "" }) })}
      />
      <MatchDetailSheet
        matchId={filters.selectedMatchId}
        onClose={() => void navigate({ search: (prev) => ({ ...prev, m: "" }) })}
      />
    </PageShell>
  );
}
