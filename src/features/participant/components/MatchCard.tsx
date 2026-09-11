import { useState } from "react";
import { toast } from "sonner";
import { Heart, HeartHandshake, MapPin, X, Loader2, Sparkles } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { LABEL_TEXT, participantMatchLabel } from "@/features/matching/presentation";

import { useDecideMatchMutation } from "@/features/matching/queries";
import { ApiError } from "@/features/participant/api";
import {
  NEED_KIND_TEXT,
  formatSegmentLabel,
  isHighSynergyMatch,
  isMatchMutual,
  translateDecideErrorCode,
} from "@/features/participant/presentation";
import { generateMatchAiSummary } from "@/features/participant/matchAiSummary";
import type { OwnMatchDTO } from "@/features/participant/types";

interface Props {
  match: OwnMatchDTO;
  eventId: string;
}

export function MatchCard({ match, eventId }: Props) {
  const decide = useDecideMatchMutation(eventId);
  const [activeAction, setActiveAction] = useState<"interesse" | "agora_nao" | null>(null);
  const myDecision = match.my_decision;
  const theirDecision = match.other_decision;
  const mutual = isMatchMutual(match);
  const isHighSynergy = isHighSynergyMatch(match);
  const other = match.other;
  const segmentLabel = formatSegmentLabel(other.segment_id);
  const myLabel = participantMatchLabel(match);
  const aiSummary = generateMatchAiSummary(match);

  function submit(d: "interesse" | "agora_nao") {
    setActiveAction(d);
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
          } else if (d === "agora_nao") {
            toast("Marcado como 'Agora não'. Match movido para o final da fila.");
          }
        },
        onError: (err) => {
          const code = err instanceof ApiError ? err.code : "unknown";
          toast.error(translateDecideErrorCode(code));
        },
        onSettled: () => {
          setActiveAction(null);
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
              {isHighSynergy && (
                <Badge
                  data-testid="badge-high-synergy"
                  className="bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30"
                >
                  <Sparkles className="mr-1 h-3 w-3 text-amber-400" /> Alta Sinergia Mútua
                </Badge>
              )}

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
              {myDecision === "agora_nao" && (
                <Badge
                  variant="outline"
                  className="border-slate-500/40 text-slate-400 bg-slate-900/40"
                  data-testid="badge-agora-nao"
                >
                  <X className="mr-1 h-3 w-3 text-slate-400" /> Agora não
                </Badge>
              )}
            </div>
            <h3 className="mt-2 font-display text-lg font-semibold">{other.company}</h3>
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
        {/* Resumo Inteligente por IA (Perguntas Solicitadas) */}
        <div className="rounded-lg border border-primary/25 bg-primary/5 p-3.5 space-y-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-primary uppercase tracking-wider">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span>Resumo de Oportunidade (IA)</span>
          </div>

          <div className="space-y-1">
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold text-primary">
                1
              </span>
              <span>Por qual motivo você deveria se conectar com essa pessoa?</span>
            </p>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed pl-5">
              {aiSummary.why_connect}
            </p>
          </div>

          <div className="space-y-1">
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold text-primary">
                2
              </span>
              <span>O que você ganha se conectando com essa pessoa?</span>
            </p>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed pl-5">
              {aiSummary.what_you_gain}
            </p>
          </div>
        </div>

        <details className="text-sm">
          <summary className="cursor-pointer text-primary hover:underline">
            Ver detalhes técnicos e perfil completo
          </summary>
          <div className="mt-3 space-y-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Motivos computados pelo matcher
              </p>
              <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                {match.reasons.map((r) => (
                  <li key={r.code} className="flex items-start gap-2">
                    <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-secondary" />
                    <span>{r.label}</span>
                  </li>
                ))}
                {match.reasons.length === 0 && (
                  <li className="text-muted-foreground">Nenhum motivo específico registrado.</li>
                )}
              </ul>
            </div>

            {other.summary && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Resumo da empresa
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{other.summary}</p>
              </div>
            )}

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Oferece</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {match.other_offers.map((o, i) => (
                  <Badge key={`o-${i}`} variant="secondary">
                    {o.label}
                  </Badge>
                ))}
                {match.other_offers.length === 0 && (
                  <span className="text-xs text-muted-foreground">Nenhuma oferta detalhada</span>
                )}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Procura</p>
              <ul className="mt-1 space-y-0.5 text-xs">
                {match.other_needs.map((n, i) => (
                  <li key={`n-${i}`}>
                    <Badge variant="outline" className="mr-1">
                      {NEED_KIND_TEXT[n.need_kind] ?? n.need_kind}
                    </Badge>
                    {n.label}
                  </li>
                ))}
                {match.other_needs.length === 0 && (
                  <li className="text-muted-foreground">Nenhuma necessidade detalhada</li>
                )}
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

        {mutual && match.connection != null && match.connection.status !== "cancelado" && (
          <div className="rounded-lg border border-success/40 bg-success/10 p-3 text-sm">
            <p className="font-medium">
              🎉 Interesse mútuo! A equipe da ACIRV vai apresentar vocês pessoalmente na feira.
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
              aria-busy={decide.isPending && activeAction === "interesse"}
            >
              {decide.isPending && activeAction === "interesse" ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Heart className="mr-1 h-4 w-4" />
              )}
              {myDecision === "interesse" ? "Interesse enviado" : "Tenho interesse"}
            </Button>
            <Button
              variant={myDecision === "agora_nao" ? "secondary" : "ghost"}
              onClick={() => submit("agora_nao")}
              disabled={myDecision === "agora_nao" || decide.isPending}
              aria-busy={decide.isPending && activeAction === "agora_nao"}
            >
              {decide.isPending && activeAction === "agora_nao" ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <X className="mr-1 h-4 w-4" />
              )}
              {myDecision === "agora_nao" ? "Marcado: Agora não" : "Agora não"}
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
