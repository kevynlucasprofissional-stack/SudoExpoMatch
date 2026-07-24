import { Link } from "@tanstack/react-router";
import { AlertTriangle, Sparkles } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import { MatchCard } from "./MatchCard";
import type { OwnMatchDTO, CatalogSegment } from "@/features/participant/types";

interface Props {
  matches: OwnMatchDTO[];
  loading: boolean;
  hasError: boolean;
  onRetry: () => void;
  eventId: string;
  segments?: readonly CatalogSegment[] | null;
  emptyMessage?: string;
}

export function MatchesList({
  matches,
  loading,
  hasError,
  onRetry,
  eventId,
  segments,
  emptyMessage,
}: Props) {
  const hasData = matches.length > 0;

  // Erro SEM cache: card de erro exclusivo.
  if (hasError && !hasData) {
    return (
      <Card className="p-6 text-sm">
        <div className="flex items-start gap-2 text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4" />
          <div>
            <p className="font-medium">Não conseguimos carregar seus matches.</p>
            <p className="mt-1 text-muted-foreground">
              Tente novamente em instantes.
            </p>
          </div>
        </div>
        <Button className="mt-4" size="sm" onClick={onRetry}>
          Tentar novamente
        </Button>
      </Card>
    );
  }

  if (loading && !hasData) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!hasData) {
    return (
      <Card className="p-8 text-center">
        <Sparkles className="mx-auto h-8 w-8 text-muted-foreground" />
        <h3 className="mt-3 font-display text-lg font-semibold">
          {emptyMessage ?? "Nenhum match ainda"}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Seu perfil segue ativo. Buscaremos novas conexões conforme mais
          gente entra.
        </p>
        <Button asChild className="mt-4">
          <Link to="/participar">Ajustar meu perfil</Link>
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {hasError && hasData && (
        <div
          role="status"
          className="rounded-md border border-warning/40 bg-warning/10 p-3 text-xs text-warning-foreground"
        >
          Não conseguimos atualizar agora. Mostrando a última lista carregada.{" "}
          <button
            type="button"
            onClick={onRetry}
            className="underline hover:no-underline"
          >
            Tentar novamente
          </button>
        </div>
      )}
      {matches.map((m) => (
        <MatchCard
          key={m.match_id}
          match={m}
          eventId={eventId}
          segments={segments}
        />
      ))}
    </div>
  );
}
