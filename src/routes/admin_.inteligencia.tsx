import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { ArrowLeft, Brain, Network, RefreshCw, ShieldAlert } from "lucide-react";

import { PageShell } from "@/components/brand/BrandShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { EVENT_ID } from "@/config/event";
import { AdminEventProvider, useAdminEvent } from "@/features/admin/AdminEventContext";
import { EventSelector } from "@/features/admin/EventSelector";
import { useSession } from "@/features/auth/useSession";
import { useEventRole } from "@/features/staff/useEventRole";
import { useAdminMatchGraph } from "@/features/admin/useAdminMatchGraph";
import { translateIntelligenceError } from "@/features/admin/intelligenceSchemas";
import {
  useIntelligenceBehavior,
  useIntelligenceMatcher,
  useIntelligenceOverview,
  useIntelligenceTaxonomy,
} from "@/features/admin/useAdminIntelligence";
import { OverviewTab } from "@/features/admin/intelligence/OverviewTab";
import { MatcherTab } from "@/features/admin/intelligence/MatcherTab";
import { BehaviorTab } from "@/features/admin/intelligence/BehaviorTab";
import { NetworkTab } from "@/features/admin/intelligence/NetworkTab";
import { TaxonomyTab } from "@/features/admin/intelligence/TaxonomyTab";
import { OutcomesTab } from "@/features/admin/intelligence/OutcomesTab";

/**
 * IMPL 29 — SudoExpo Intelligence.
 *
 * Ferramenta de investigação do matcher, do comportamento de decisão, da rede,
 * da taxonomia e da confiança dos dados. Somente leitura: nada aqui altera
 * matcher, pesos, razões, `algorithm_version` ou decisões históricas.
 *
 * Todas as consultas usam o evento do `AdminEventContext` — nunca `EVENT_ID`
 * fixo (que segue sendo usado apenas para o gate de papel, como nas outras
 * telas admin).
 */
export const Route = createFileRoute("/admin_/inteligencia")({
  head: () => ({
    meta: [
      { title: "SudoExpo Intelligence — Administração Matchmaker SudoExpo" },
      {
        name: "description",
        content:
          "Painel analítico administrativo do Matchmaker SudoExpo: qualidade do matcher, comportamento de decisão, rede, taxonomia e confiança dos dados.",
      },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: IntelligenceRoute,
});

function IntelligenceRoute() {
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

  if (roleQuery.data !== "admin") {
    return (
      <PageShell>
        <section className="mx-auto max-w-md px-4 py-12">
          <Card className="p-6 text-center">
            <ShieldAlert className="mx-auto h-10 w-10 text-destructive" />
            <h1 className="mt-3 font-display text-xl font-semibold">Acesso negado</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Apenas administradores do evento acessam a análise.
            </p>
            <Button asChild className="mt-4">
              <Link to="/admin">Voltar</Link>
            </Button>
          </Card>
        </section>
      </PageShell>
    );
  }

  return (
    <AdminEventProvider>
      <IntelligencePage />
    </AdminEventProvider>
  );
}

function IntelligencePage() {
  const { selectedEventId, currentEvent } = useAdminEvent();
  const enabled = Boolean(selectedEventId);

  const overview = useIntelligenceOverview(selectedEventId, enabled);
  const matcher = useIntelligenceMatcher(selectedEventId, enabled);
  const behavior = useIntelligenceBehavior(selectedEventId, enabled);
  const taxonomy = useIntelligenceTaxonomy(selectedEventId, enabled);
  const graph = useAdminMatchGraph(selectedEventId, enabled);

  const anyError = overview.error ?? matcher.error ?? behavior.error ?? taxonomy.error;
  const isFetching =
    overview.isFetching ||
    matcher.isFetching ||
    behavior.isFetching ||
    taxonomy.isFetching ||
    graph.isFetching;

  function refetchAll() {
    void overview.refetch();
    void matcher.refetch();
    void behavior.refetch();
    void taxonomy.refetch();
    void graph.refetch();
  }

  return (
    <PageShell>
      <section className="mx-auto max-w-7xl px-4 py-8">
        <header className="rounded-2xl border border-border/60 bg-gradient-to-br from-primary/10 via-background to-accent/10 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-primary">
                <Brain className="h-4 w-4" /> Análise administrativa
              </p>
              <h1 className="mt-2 font-display text-2xl font-semibold sm:text-3xl">
                SudoExpo Intelligence
              </h1>
              <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
                Entenda como o matcher pensa, como as pessoas decidem e onde estão as melhores
                oportunidades de evolução.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <EventSelector />
              <Button asChild variant="outline" size="sm">
                <Link to="/admin/graph">
                  <Network className="mr-1 h-4 w-4" /> Mapa de conexões
                </Link>
              </Button>
              <Button variant="ghost" size="sm" onClick={refetchAll} disabled={isFetching}>
                <RefreshCw className={isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link to="/admin">
                  <ArrowLeft className="mr-1 h-4 w-4" /> Administração
                </Link>
              </Button>
            </div>
          </div>
          {currentEvent && (
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="outline">{currentEvent.name}</Badge>
              {currentEvent.city && <Badge variant="outline">{currentEvent.city}</Badge>}
              {isFetching && <Badge variant="outline">atualizando…</Badge>}
            </div>
          )}
        </header>

        {anyError && (
          <Card className="mt-5 border-destructive/40 bg-destructive/5 p-4">
            <p className="text-sm text-destructive">{translateIntelligenceError(anyError)}</p>
          </Card>
        )}

        <Tabs defaultValue="overview" className="mt-6">
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
            <TabsTrigger value="overview">Visão Geral</TabsTrigger>
            <TabsTrigger value="matcher">Matcher Lab</TabsTrigger>
            <TabsTrigger value="behavior">Behavior Lab</TabsTrigger>
            <TabsTrigger value="network">Rede</TabsTrigger>
            <TabsTrigger value="taxonomy">Taxonomia</TabsTrigger>
            <TabsTrigger value="outcomes">Outcomes &amp; Data Trust</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-5">
            <OverviewTab data={overview.data} isPending={overview.isPending} />
          </TabsContent>
          <TabsContent value="matcher" className="mt-5">
            <MatcherTab data={matcher.data} isPending={matcher.isPending} />
          </TabsContent>
          <TabsContent value="behavior" className="mt-5">
            <BehaviorTab data={behavior.data} isPending={behavior.isPending} />
          </TabsContent>
          <TabsContent value="network" className="mt-5">
            <NetworkTab data={graph.data} isPending={graph.isPending} />
          </TabsContent>
          <TabsContent value="taxonomy" className="mt-5">
            <TaxonomyTab data={taxonomy.data} isPending={taxonomy.isPending} />
          </TabsContent>
          <TabsContent value="outcomes" className="mt-5">
            <OutcomesTab data={overview.data} isPending={overview.isPending} />
          </TabsContent>
        </Tabs>
      </section>
    </PageShell>
  );
}
