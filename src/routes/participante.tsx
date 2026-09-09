import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { TestTube2 } from "lucide-react";

import { PageShell } from "@/components/brand/BrandShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { EVENT_ID } from "@/config/event";
import { z } from "zod";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import { useEnsureParticipantSession } from "@/features/participant/session";
import { useOwnProfile } from "@/features/participant/useOwnProfile";
import { useOwnMatchesQuery, useRecomputeMatchesMutation } from "@/features/matching/queries";
import { resolveParticipantPageState } from "@/features/participant/pageState";
import {
  filterActiveConnections,
  filterCancelledConnections,
  filterInterests,
  filterPendingConnections,
  translateRecomputeErrorCode,
} from "@/features/participant/presentation";
import { ApiError } from "@/features/participant/api";
import { ParticipantHeader } from "@/features/participant/components/ParticipantHeader";
import { MatchesList } from "@/features/participant/components/MatchesList";
import { ConnectionsList } from "@/features/participant/components/ConnectionsList";
import { ProfileCard } from "@/features/participant/components/ProfileCard";
import { RecoveryView } from "@/features/participant/components/RecoveryView";
import type { OwnProfileDTO } from "@/features/participant/types";
import { track } from "@/features/analytics/track";

/** Polling interval real usado pela query — reutilizado nos testes. */
export const PARTICIPANT_MATCHES_POLL_MS = 20_000;

export const participanteSearchSchema = z.object({
  event: fallback(z.string(), "").default(""),
});

export const Route = createFileRoute("/participante")({
  validateSearch: zodValidator(participanteSearchSchema),
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
  const search = Route.useSearch();
  const activeEventId = search.event ? search.event : EVENT_ID;
  const isSandbox = activeEventId === "sandbox-sudoexpo";

  const session = useEnsureParticipantSession();
  const profileQuery = useOwnProfile(activeEventId, { enabled: session.isReady });
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
            <h2 className="text-lg font-semibold">Não conseguimos carregar seu perfil</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Verifique sua conexão e tente novamente. Não presumimos que você é um usuário novo até
              termos certeza.
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

  return (
    <Panel
      profile={profileQuery.data!}
      eventId={activeEventId}
      isSandbox={isSandbox}
    />
  );
}

function Panel({
  profile,
  eventId,
  isSandbox,
}: {
  profile: OwnProfileDTO;
  eventId: string;
  isSandbox: boolean;
}) {
  const matchesQuery = useOwnMatchesQuery(eventId, {
    enabled: true,
    refetchIntervalMs: PARTICIPANT_MATCHES_POLL_MS,
  });
  const recompute = useRecomputeMatchesMutation(eventId);

  const matches = useMemo(() => matchesQuery.data ?? [], [matchesQuery.data]);
  const hasCachedResult = matchesQuery.data !== undefined;
  const interested = useMemo(() => filterInterests(matches), [matches]);
  const activeConn = useMemo(() => filterActiveConnections(matches), [matches]);
  const pendingConn = useMemo(() => filterPendingConnections(matches), [matches]);
  const cancelledConn = useMemo(() => filterCancelledConnections(matches), [matches]);
  const totalConnections = activeConn.length + pendingConn.length + cancelledConn.length;

  const lastUpdatedLabel = useLastUpdatedLabel(matchesQuery.dataUpdatedAt);

  // Analytics: um `match_viewed` por match exibido (dedupe interno evita repetir).
  useEffect(() => {
    for (const m of matches) {
      track({
        kind: "match_viewed",
        eventId,
        profileId: profile.id,
        payload: { match_id: m.match_id, label: m.label_me ?? m.label, score: m.score_me },
        dedupeKey: `match_viewed:${m.match_id}`,
      });
    }
  }, [matches, profile.id, eventId]);

  const handleRecompute = useCallback(() => {
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
        toast.error(translateRecomputeErrorCode(code));
      },
    });
  }, [recompute]);

  const handleRefresh = useCallback(() => {
    void matchesQuery.refetch();
  }, [matchesQuery]);

  // "refreshing" só é verdadeiro para atualização em cima de cache existente
  // (distingue de first-load spinner).
  const refreshing = matchesQuery.isFetching && !matchesQuery.isPending;

  return (
    <PageShell>
      <section className="mx-auto max-w-4xl px-4 py-8">
        {isSandbox && (
          <div className="mb-6 flex items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
            <div className="flex items-center gap-2">
              <TestTube2 className="h-5 w-5 shrink-0 text-amber-400" />
              <div>
                <p className="font-semibold text-amber-300">Painel do Participante em Modo Sandbox</p>
                <p className="text-xs text-white/70">
                  Você está visualizando o ambiente de testes isolado. Seus matches não afetam a SudoExpo 2026.
                </p>
              </div>
            </div>
          </div>
        )}

        <ParticipantHeader
          firstName={profile.name.split(" ")[0] ?? profile.name}
          onRecompute={handleRecompute}
          onRefresh={handleRefresh}
          recomputing={recompute.isPending}
          refreshing={refreshing}
          hasProfile
          lastUpdatedLabel={lastUpdatedLabel}
        />

        <Tabs defaultValue="matches">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="matches">Matches ({matches.length})</TabsTrigger>
            <TabsTrigger value="interested">Interesses ({interested.length})</TabsTrigger>
            <TabsTrigger value="connections">Conexões ({totalConnections})</TabsTrigger>
            <TabsTrigger value="profile">Perfil</TabsTrigger>
          </TabsList>

          <TabsContent value="matches" className="mt-6">
            <MatchesList
              matches={matches}
              hasCachedResult={hasCachedResult}
              loading={matchesQuery.isPending}
              hasError={matchesQuery.isError}
              retrying={matchesQuery.isFetching}
              onRetry={handleRefresh}
              eventId={EVENT_ID}
            />
          </TabsContent>
          <TabsContent value="interested" className="mt-6">
            <MatchesList
              matches={interested}
              hasCachedResult={hasCachedResult}
              loading={matchesQuery.isPending}
              hasError={matchesQuery.isError}
              retrying={matchesQuery.isFetching}
              onRetry={handleRefresh}
              eventId={EVENT_ID}
              emptyMessage="Você ainda não marcou interesse em ninguém."
            />
          </TabsContent>
          <TabsContent value="connections" className="mt-6">
            <ConnectionsList active={activeConn} pending={pendingConn} cancelled={cancelledConn} />
          </TabsContent>
          <TabsContent value="profile" className="mt-6">
            <ProfileCard profile={profile} />
          </TabsContent>
        </Tabs>
      </section>
    </PageShell>
  );
}

/** Rótulo "Atualizado há Xs/min" — ticker leve de 30s. */
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
