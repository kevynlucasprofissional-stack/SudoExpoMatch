import { toast } from "sonner";
import { Heart, HeartHandshake, MapPin, X, Loader2 } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import {
  LABEL_TEXT,
  participantMatchLabel,
} from "@/features/matching/presentation";

import { useDecideMatchMutation } from "@/features/matching/queries";
import { ApiError } from "@/features/participant/api";
import {
  NEED_KIND_TEXT,
  formatSegmentLabel,
  isMatchMutual,
  translateDecideErrorCode,
} from "@/features/participant/presentation";
import type { OwnMatchDTO } from "@/features/participant/types";

interface Props {
  match: OwnMatchDTO;
  eventId: string;
}

export function MatchCard({ match, eventId }: Props) {
  const decide = useDecideMatchMutation(eventId);
  const myDecision = match.my_decision;
  const theirDecision = match.other_decision;
  const mutual = isMatchMutual(match);
  const other = match.other;
  const segmentLabel = formatSegmentLabel(other.segment_id);
  const myLabel = participantMatchLabel(match);

  function submit(d: "interesse" | "agora_nao") {
    decide.mutate(
      { matchId: match.match_id, decision: d },
      {
        onSuccess: (res) => {
          if (res.mutual && res.connection_created) {
            toast.success("Deu match! 🎉 A equipe vai apresentar vocês.");
          } else if (res.mutual) {
            toast.success("Interesse mútuo — preparando conexão…");
          } else if (d === "interesse") {
            toast("Interesse registrado. Aguardando a outra parte.");
          }
        },
        onError: (err) => {
          const code = err instanceof ApiError ? err.code : "unknown";
          toast.error(translateDecideErrorCode(code));
        },
      },
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-b bg-muted/30 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                data-testid="match-label"
                className={
                  myLabel === "alta_compatibilidade"
                    ? "bg-success text-success-foreground"
                    : myLabel === "boa_oportunidade"
                      ? "bg-accent text-accent-foreground"
                      : "bg-secondary text-secondary-foreground"
                }
              >
                {LABEL_TEXT[myLabel]}
              </Badge>

              <Badge variant="outline" className="capitalize">
                {match.kind}
              </Badge>
              {mutual && (
                <Badge className="bg-primary text-primary-foreground">
                  <HeartHandshake className="mr-1 h-3 w-3" /> Deu match
                </Badge>
              )}
            </div>
            <h3 className="mt-2 font-display text-lg font-semibold">
              {other.company}
            </h3>
            <p className="text-sm text-muted-foreground">
              {other.name}
              {segmentLabel && <> · {segmentLabel}</>}
            </p>
            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3" /> {other.city}
            </p>
          </div>
        </div>
      </div>
      <div className="space-y-4 p-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Por que este match
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {match.reasons.map((r) => (
              <li key={r.code} className="flex items-start gap-2">
                <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-secondary" />
                <span>{r.label}</span>
              </li>
            ))}
            {match.reasons.length === 0 && (
              <li className="text-muted-foreground">
                Motivos ainda estão sendo calculados…
              </li>
            )}
          </ul>
        </div>

        <details className="text-sm">
          <summary className="cursor-pointer text-primary hover:underline">
            Ver perfil resumido
          </summary>
          <div className="mt-3 space-y-2">
            <p className="text-muted-foreground">{other.summary}</p>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Oferece
              </p>
              <div className="mt-1 flex flex-wrap gap-1">
                {match.other_offers.map((o, i) => (
                  <Badge key={`o-${i}`} variant="secondary">
                    {o.label}
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Procura
              </p>
              <ul className="mt-1 space-y-0.5 text-xs">
                {match.other_needs.map((n, i) => (
                  <li key={`n-${i}`}>
                    <Badge variant="outline" className="mr-1">
                      {NEED_KIND_TEXT[n.need_kind] ?? n.need_kind}
                    </Badge>
                    {n.label}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </details>

        {mutual && match.connection == null && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
            <p className="font-medium">Interesse mútuo — preparando conexão…</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Estamos organizando a apresentação. Aguarde a atualização.
            </p>
          </div>
        )}

        {mutual &&
          match.connection != null &&
          match.connection.status !== "cancelado" && (
            <div className="rounded-lg border border-success/40 bg-success/10 p-3 text-sm">
              <p className="font-medium">
                🎉 Interesse mútuo! A equipe da ACIRV vai apresentar vocês
                pessoalmente na feira.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Contato liberado quando a equipe registrar a apresentação.
              </p>
            </div>
          )}

        {!mutual && (
          <div className="flex flex-wrap gap-2">
            <Button
              className="flex-1"
              variant={myDecision === "interesse" ? "secondary" : "default"}
              onClick={() => submit("interesse")}
              disabled={myDecision === "interesse" || decide.isPending}
              aria-busy={decide.isPending}
            >
              {decide.isPending && myDecision !== "interesse" ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Heart className="mr-1 h-4 w-4" />
              )}
              {myDecision === "interesse"
                ? "Interesse enviado"
                : "Tenho interesse"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => submit("agora_nao")}
              disabled={myDecision === "agora_nao" || decide.isPending}
            >
              <X className="mr-1 h-4 w-4" /> Agora não
            </Button>
            {theirDecision === "interesse" && myDecision !== "interesse" && (
              <span className="self-center text-xs text-muted-foreground">
                A outra parte já demonstrou interesse.
              </span>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
