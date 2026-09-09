import { Link } from "@tanstack/react-router";
import { MessageCircle } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { ADMIN_SUPPORT_WHATSAPP_URL } from "@/features/participant/components/ParticipantHeader";
import { NEED_KIND_TEXT, formatSegmentLabel } from "@/features/participant/presentation";
import type { OwnProfileDTO } from "@/features/participant/types";

interface Props {
  profile: OwnProfileDTO;
}

export function ProfileCard({ profile }: Props) {
  const segLabel = formatSegmentLabel(profile.segment_id);
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
                {n.is_priority && <span className="ml-1 text-xs text-warning">★ prioridade</span>}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <Link to="/participar" data-testid="link-edit-profile">
            Editar perfil
          </Link>
        </Button>
        <Button asChild variant="secondary">
          <a
            href={ADMIN_SUPPORT_WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="link-profile-support"
            className="inline-flex items-center gap-1.5"
          >
            <MessageCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            Suporte do Administrador
          </a>
        </Button>
      </div>
    </Card>
  );
}
