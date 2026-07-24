import { Link } from "@tanstack/react-router";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import {
  NEED_KIND_TEXT,
  formatSegmentLabel,
} from "@/features/participant/presentation";
import type {
  OwnProfileDTO,
  CatalogSegment,
} from "@/features/participant/types";

interface Props {
  profile: OwnProfileDTO;
  segments?: readonly CatalogSegment[] | null;
}

export function ProfileCard({ profile, segments }: Props) {
  const segLabel = formatSegmentLabel(profile.segment_id, segments);
  return (
    <Card className="p-6">
      <h3 className="font-display text-lg font-semibold">{profile.company}</h3>
      <p className="text-sm text-muted-foreground">
        {profile.name}
        {segLabel && <> · {segLabel}</>} · {profile.city}
      </p>
      <p className="mt-4 text-sm">{profile.summary}</p>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Ofereço
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            {profile.offers.map((o) => (
              <Badge key={o.id} variant="secondary">
                {o.label}
              </Badge>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Procuro
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {profile.needs.map((n) => (
              <li key={n.id}>
                <Badge variant="outline" className="mr-1">
                  {NEED_KIND_TEXT[n.need_kind] ?? n.need_kind}
                </Badge>
                {n.label}
                {n.is_priority && (
                  <span className="ml-1 text-xs text-warning">
                    ★ prioridade
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="mt-6 flex gap-2">
        <Button asChild variant="outline">
          <Link to="/participar" data-testid="link-edit-profile">
            Editar perfil (abre o wizard preenchido)
          </Link>
        </Button>
      </div>
    </Card>
  );
}
