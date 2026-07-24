import { useState } from "react";
import { HeartHandshake, MessageCircle } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import {
  CONNECTION_STATUS_TEXT,
  CONNECTION_STATUS_TONE,
  canRevealForMatch,
  revealDisabledHint,
} from "@/features/participant/presentation";
import { PARTICIPANT_STATUS_MESSAGE } from "@/features/connections/eligibility";
import { RevealContactDialog } from "./RevealContactDialog";
import type { OwnMatchDTO } from "@/features/participant/types";
import type { ConnectionStatus } from "@/lib/types";

interface Props {
  active: OwnMatchDTO[];
  pending: OwnMatchDTO[];
  cancelled: OwnMatchDTO[];
}

export function ConnectionsList({ active, pending, cancelled }: Props) {
  const empty =
    active.length === 0 && pending.length === 0 && cancelled.length === 0;

  if (empty) {
    return (
      <Card className="p-8 text-center">
        <HeartHandshake className="mx-auto h-8 w-8 text-muted-foreground" />
        <h3 className="mt-3 font-display text-lg font-semibold">
          Ainda sem conexões confirmadas
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Quando o interesse for mútuo, a conexão aparece aqui.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {pending.length > 0 && (
        <Section title="Interesse mútuo — preparando conexão">
          {pending.map((m) => (
            <PendingRow key={m.match_id} match={m} />
          ))}
        </Section>
      )}
      {active.length > 0 && (
        <Section title="Conexões ativas">
          {active.map((m) => (
            <ActiveRow key={m.match_id} match={m} />
          ))}
        </Section>
      )}
      {cancelled.length > 0 && (
        <Section title="Conexões canceladas">
          {cancelled.map((m) => (
            <CancelledRow key={m.match_id} match={m} />
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </div>
  );
}

function PendingRow({ match }: { match: OwnMatchDTO }) {
  const other = match.other;
  return (
    <Card className="p-4">
      <h4 className="font-display font-semibold">{other.company}</h4>
      <p className="text-sm text-muted-foreground">
        {other.name} · {other.city}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        Vocês demonstraram interesse mútuo. A conexão será preparada em breve.
      </p>
    </Card>
  );
}

function CancelledRow({ match }: { match: OwnMatchDTO }) {
  const other = match.other;
  return (
    <Card className="p-4 opacity-80">
      <h4 className="font-display font-semibold">{other.company}</h4>
      <p className="text-sm text-muted-foreground">
        {other.name} · {other.city}
      </p>
      <Badge
        variant="outline"
        className={`mt-2 border ${CONNECTION_STATUS_TONE.cancelado}`}
      >
        {CONNECTION_STATUS_TEXT.cancelado}
      </Badge>
      <p className="mt-3 text-xs text-muted-foreground">
        {match.connection?.notes
          ? `Motivo: ${match.connection.notes}`
          : PARTICIPANT_STATUS_MESSAGE.cancelado}
      </p>
    </Card>
  );
}

function ActiveRow({ match }: { match: OwnMatchDTO }) {
  const [open, setOpen] = useState(false);
  const status: ConnectionStatus = match.connection?.status ?? "aguardando";
  const canReveal = canRevealForMatch(match);
  const other = match.other;
  const disabledHint = canReveal ? null : revealDisabledHint(match);

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h4 className="font-display font-semibold">{other.company}</h4>
          <p className="text-sm text-muted-foreground">
            {other.name} · {other.city}
          </p>
          <Badge
            variant="outline"
            className={`mt-2 border ${CONNECTION_STATUS_TONE[status]}`}
          >
            {CONNECTION_STATUS_TEXT[status]}
          </Badge>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOpen(true)}
            disabled={!canReveal}
            aria-describedby={
              disabledHint ? `reveal-hint-${match.match_id}` : undefined
            }
            data-testid={`btn-reveal-${match.match_id}`}
          >
            <MessageCircle className="mr-1 h-4 w-4" />
            Ver contato
          </Button>
          {disabledHint && (
            <span
              id={`reveal-hint-${match.match_id}`}
              className="max-w-[14rem] text-right text-[11px] leading-tight text-muted-foreground"
            >
              {disabledHint}
            </span>
          )}
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {PARTICIPANT_STATUS_MESSAGE[status]}
      </p>
      {open && (
        <RevealContactDialog
          open={open}
          matchId={match.match_id}
          otherFirstName={other.name.split(" ")[0] ?? other.name}
          onClose={() => setOpen(false)}
        />
      )}
    </Card>
  );
}
