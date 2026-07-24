import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { PageShell } from "@/components/brand/BrandShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

import { EVENT_ID } from "@/lib/mock-data";
import { useEnsureParticipantSession } from "@/features/participant/session";
import { useOwnProfile } from "@/features/participant/useOwnProfile";
import {
  useOwnMatchesQuery,
  useRecomputeMatchesMutation,
} from "@/features/matching/queries";
import { useEventTaxonomy } from "@/features/taxonomy/queries";
import { resolveParticipantPageState } from "@/features/participant/pageState";
import {
  filterActiveConnections,
  filterCancelledConnections,
  filterInterests,
  filterPendingConnections,
  translateDecideErrorCode,
} from "@/features/participant/presentation";
import { ApiError } from "@/features/participant/api";
import { ParticipantHeader } from "@/features/participant/components/ParticipantHeader";
import { MatchesList } from "@/features/participant/components/MatchesList";
import { ConnectionsList } from "@/features/participant/components/ConnectionsList";
import { ProfileCard } from "@/features/participant/components/ProfileCard";
import { RecoveryView } from "@/features/participant/components/RecoveryView";

/** Polling interval real usado pela query — reutilizado nos testes. */
export const PARTICIPANT_MATCHES_POLL_MS = 20_000;

export const Route = createFileRoute("/participante")({
  head: () => ({
    meta: [
      { title: "Área do participante — Matchmaker SudoExpo" },
      {
        name: "description",
        content: "Seus matches, interesses e conexões na SudoExpo.",
      },
      {
        property: "og:title",
        content: "Área do participante — Matchmaker SudoExpo",
      },
      {
        property: "og:description",
        content: "Painel privado com seus matches e conexões da SudoExpo.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ParticipantPage,
});

function ParticipantPage() {
  const session = useEnsureParticipantSession();
  const profileQuery = useOwnProfile(EVENT_ID, { enabled: session.isReady });
  const state = resolveParticipantPageState({
    session,
    profile: profileQuery,
  });

  if (state.kind === "session_error") {
    return (
      <PageShell>
        <section className="mx-auto max-w-2xl px-4 py-12">
          <Card className="p-6">
            <h2 className="text-lg font-semibold">Sessão indisponível</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Não foi possível iniciar sua sessão. Verifique sua internet.
            </p>
            <Button
              className="mt-4"
              onClick={() => void session.retry()}
              disabled={session.status !== "error"}
            >
              Tentar novamente
            </Button>
          </Card>
        </section>
      </PageShell>
    );
  }

  if (state.kind === "session_loading" || state.kind === "profile_loading") {
    return (
      <PageShell>
        <div className="mx-auto max-w-3xl px-4 py-12">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="mt-3 h-4 w-96" />
          <Skeleton className="mt-8 h-40 w-full" />
        </div>
      </PageShell>
    );
  }

  if (state.kind === "profile_error") {
    return (
      <PageShell>
        <section className="mx-auto max-w-2xl px-4 py-12">
          <Card className="p-6">
            <h2 className="text-lg font-semibold">
              Não conseguimos carregar seu perfil
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Verifique sua conexão e tente novamente. Não presumimos que você
              é um usuário novo até termos certeza.
            </p>
            <Button
              className="mt-4"
              onClick={() => void profileQuery.refetch()}
              disabled={profileQuery.isFetching}
              aria-busy={profileQuery.isFetching}
            >
              {profileQuery.isFetching ? "Tentando…" : "Tentar novamente"}
            </Button>
          </Card>
        </section>
      </PageShell>
    );
  }

  if (state.kind === "recovery") {
    return <RecoveryView />;
  }

  // panel
  return <Panel profile={profileQuery.data!} />;
}

function Panel({ profile }: { profile: NonNullable<ReturnType<typeof useOwnProfile>["data"]> }) {
  const matchesQuery = useOwnMatchesQuery(EVENT_ID, {
    enabled: true,
    refetchIntervalMs: PARTICIPANT_MATCHES_POLL_MS,
  });
  const recompute = useRecomputeMatchesMutation(EVENT_ID);
  const taxonomy = useEventTaxonomy(EVENT_ID);
  const segments = taxonomy.data?.segments ?? null;

  const matches = useMemo(() => matchesQuery.data ?? [], [matchesQuery.data]);
  const interested = useMemo(() => filterInterests(matches), [matches]);
  const activeConn = useMemo(() => filterActiveConnections(matches), [matches]);
  const pendingConn = useMemo(() => filterPendingConnections(matches), [matches]);
  const cancelledConn = useMemo(
    () => filterCancelledConnections(matches),
    [matches],
  );
  const totalConnections =
    activeConn.length + pendingConn.length + cancelledConn.length;

  const lastUpdatedLabel = useLastUpdatedLabel(matchesQuery.dataUpdatedAt);

  function handleRecompute() {
    if (recompute.isPending) return;
    recompute.mutate(undefined, {
      onSuccess: (n) => {
        toast.success(
          n === 0
            ? "Recalculado — nenhum novo match agora."
            : `Recalculado — ${n} match${n === 1 ? "" : "es"} atualizado${n === 1 ? "" : "s"}.`,
        );
      },
      onError: (err) => {
        const code = err instanceof ApiError ? err.code : "unknown";
        toast.error(translateDecideErrorCode(code));
      },
    });
  }

  const refreshing = matchesQuery.isFetching && !matchesQuery.isPending;

  return (
    <PageShell>
      <section className="mx-auto max-w-4xl px-4 py-8">
        <ParticipantHeader
          firstName={profile.name.split(" ")[0] ?? profile.name}
          eventId={EVENT_ID}
          onRecompute={handleRecompute}
          onRefresh={() => void matchesQuery.refetch()}
          recomputing={recompute.isPending}
          refreshing={refreshing}
          hasProfile
          lastUpdatedLabel={lastUpdatedLabel}
        />

        <Tabs defaultValue="matches">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="matches">
              Matches ({matches.length})
            </TabsTrigger>
            <TabsTrigger value="interested">
              Interesses ({interested.length})
            </TabsTrigger>
            <TabsTrigger value="connections">
              Conexões ({totalConnections})
            </TabsTrigger>
            <TabsTrigger value="profile">Perfil</TabsTrigger>
          </TabsList>

          <TabsContent value="matches" className="mt-6">
            <MatchesList
              matches={matches}
              loading={matchesQuery.isPending}
              hasError={matchesQuery.isError}
              onRetry={() => void matchesQuery.refetch()}
              eventId={EVENT_ID}
              segments={segments}
            />
          </TabsContent>
          <TabsContent value="interested" className="mt-6">
            <MatchesList
              matches={interested}
              loading={matchesQuery.isPending}
              hasError={matchesQuery.isError}
              onRetry={() => void matchesQuery.refetch()}
              eventId={EVENT_ID}
              segments={segments}
              emptyMessage="Você ainda não marcou interesse em ninguém."
            />
          </TabsContent>
          <TabsContent value="connections" className="mt-6">
            <ConnectionsList
              active={activeConn}
              pending={pendingConn}
              cancelled={cancelledConn}
            />
          </TabsContent>
          <TabsContent value="profile" className="mt-6">
            <ProfileCard profile={profile} segments={segments} />
          </TabsContent>
        </Tabs>
      </section>
    </PageShell>
  );
}

/**
 * Rótulo "Atualizado há Xs/min" — sem timer agressivo (30s tick).
 */
function useLastUpdatedLabel(dataUpdatedAt: number): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  if (!dataUpdatedAt) return "Aguardando atualização…";
  const diffMs = Math.max(0, now - dataUpdatedAt);
  const s = Math.floor(diffMs / 1000);
  if (s < 5) return "Atualizado agora";
  if (s < 60) return `Atualizado há ${s}s`;
  const m = Math.floor(s / 60);
  return `Atualizado há ${m}min`;
}
