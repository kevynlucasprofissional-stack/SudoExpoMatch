import { Link } from "@tanstack/react-router";
import { AlertTriangle, Sparkles } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import { MatchCard } from "./MatchCard";
import {
  resolveMatchesDisplayState,
  type MatchesDisplayState,
} from "@/features/participant/matchesDisplayState";
import type { OwnMatchDTO } from "@/features/participant/types";

interface Props {
  matches: OwnMatchDTO[];
  /** `true` sempre que a query já retornou (mesmo `[]`). Nunca inferir de `matches.length`. */
  hasCachedResult: boolean;
  loading: boolean;
  hasError: boolean;
  retrying: boolean;
  onRetry: () => void;
  eventId: string;
  emptyMessage?: string;
}

export function MatchesList({
  matches,
  hasCachedResult,
  loading,
  hasError,
  retrying,
  onRetry,
  eventId,
  emptyMessage,
}: Props) {
  const state: MatchesDisplayState = resolveMatchesDisplayState({
    matches,
    hasCachedResult,
    loading,
    hasError,
  });

  if (state.kind === "blocking_error") {
    return (
      <Card className="p-6 text-sm">
        <div className="flex items-start gap-2 text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4" />
          <div>
            <p className="font-medium">Não conseguimos carregar seus matches.</p>
            <p className="mt-1 text-muted-foreground">Tente novamente em instantes.</p>
          </div>
        </div>
        <Button
          className="mt-4"
          size="sm"
          onClick={onRetry}
          disabled={retrying}
          aria-busy={retrying}
        >
          {retrying ? "Tentando…" : "Tentar novamente"}
        </Button>
      </Card>
    );
  }

  if (state.kind === "initial_loading") {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (state.kind === "empty") {
    return (
      <div className="space-y-3">
        {state.showRefreshError && <RefreshErrorNotice onRetry={onRetry} retrying={retrying} />}
        <Card className="p-8 text-center">
          <Sparkles className="mx-auto h-8 w-8 text-muted-foreground" />
          <h3 className="mt-3 font-display text-lg font-semibold">
            {emptyMessage ?? "Nenhum match ainda"}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Seu perfil segue ativo. Buscaremos novas conexões conforme mais gente entra.
          </p>
          <Button asChild className="mt-4">
            <Link to="/participar">Ajustar meu perfil</Link>
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {state.showRefreshError && <RefreshErrorNotice onRetry={onRetry} retrying={retrying} />}
      {state.matches.map((m) => (
        <MatchCard key={m.match_id} match={m} eventId={eventId} />
      ))}
    </div>
  );
}

function RefreshErrorNotice({ onRetry, retrying }: { onRetry: () => void; retrying: boolean }) {
  return (
    <div
      role="status"
      className="rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-warning-foreground"
    >
      Não conseguimos atualizar agora. Mostrando a última lista carregada.{" "}
      <button
        type="button"
        onClick={onRetry}
        disabled={retrying}
        aria-busy={retrying}
        className="underline hover:no-underline disabled:opacity-50"
      >
        {retrying ? "Tentando…" : "Tentar novamente"}
      </button>
    </div>
  );
}
