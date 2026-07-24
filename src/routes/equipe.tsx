import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { LogOut, Mail, ShieldCheck } from "lucide-react";

import { PageShell } from "@/components/brand/BrandShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

import { EVENT_ID } from "@/lib/mock-data";
import type { ConnectionStatus } from "@/lib/types";
import { useSession } from "@/features/auth/useSession";
import { useEventRole } from "@/features/staff/useEventRole";
import { useEventStats } from "@/features/staff/useEventStats";
import {
  useAdvanceConnection,
  useConnectionsQueue,
  useStaffRevealContacts,
  type QueueItem,
} from "@/features/staff/useConnectionsQueue";
import { signInWithPassword, signOut, loginSchema } from "@/features/auth/actions";

export const Route = createFileRoute("/equipe")({
  head: () => ({
    meta: [
      { title: "Área da equipe — Matchmaker SudoExpo" },
      {
        name: "description",
        content:
          "Login e fila de atendimento para a equipe ACIRV do Matchmaker SudoExpo.",
      },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: StaffPage,
});

const NEXT_STATUS: Record<ConnectionStatus, ConnectionStatus | null> = {
  aguardando: "em_atendimento",
  em_atendimento: "apresentados",
  apresentados: "contato_trocado",
  contato_trocado: "concluido",
  concluido: null,
  cancelado: null,
};

const LABELS: Record<ConnectionStatus, string> = {
  aguardando: "Aguardando",
  em_atendimento: "Em atendimento",
  apresentados: "Apresentados",
  contato_trocado: "Contato trocado",
  concluido: "Concluída",
  cancelado: "Cancelada",
};

const STATUS_TONE: Record<ConnectionStatus, string> = {
  aguardando: "bg-warning/20 text-warning-foreground border-warning/40",
  em_atendimento: "bg-accent/20 text-accent-foreground border-accent/40",
  apresentados: "bg-primary/15 text-primary border-primary/30",
  contato_trocado: "bg-secondary/20 text-secondary-foreground border-secondary/40",
  concluido: "bg-success/20 text-success-foreground border-success/40",
  cancelado: "bg-muted text-muted-foreground border-muted",
};

// ------------------------------------------------------------------
// Entry
// ------------------------------------------------------------------
function StaffPage() {
  const { user, isAuthenticated, isLoading: sessionLoading } = useSession();
  const roleQuery = useEventRole(EVENT_ID);

  if (sessionLoading) {
    return (
      <PageShell>
        <div className="mx-auto max-w-md px-4 py-12">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="mt-4 h-40 w-full" />
        </div>
      </PageShell>
    );
  }

  if (!isAuthenticated) return <LoginCard />;

  if (roleQuery.isLoading) {
    return (
      <PageShell>
        <div className="mx-auto max-w-5xl px-4 py-12">
          <Skeleton className="h-6 w-64" />
          <Skeleton className="mt-4 h-40 w-full" />
        </div>
      </PageShell>
    );
  }

  if (!roleQuery.data) {
    return (
      <PageShell>
        <section className="mx-auto max-w-md px-4 py-12">
          <Card className="p-6 text-center">
            <ShieldCheck className="mx-auto h-10 w-10 text-muted-foreground" />
            <h1 className="mt-3 font-display text-xl font-semibold">Sem acesso à equipe</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Sua conta <strong>{user?.email}</strong> não tem papel na equipe
              deste evento. Fale com um administrador da ACIRV.
            </p>
            <Button variant="outline" className="mt-4" onClick={() => signOut()}>
              <LogOut className="mr-1 h-4 w-4" /> Sair
            </Button>
          </Card>
        </section>
      </PageShell>
    );
  }

  return <StaffDashboard email={user?.email ?? ""} role={roleQuery.data} />;
}

// ------------------------------------------------------------------
// Login
// ------------------------------------------------------------------
function LoginCard() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[String(i.path[0])] = i.message;
      setErrors(errs);
      return;
    }
    setLoading(true);
    try {
      await signInWithPassword(parsed.data);
      toast.success("Bem-vindo(a)!");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha no login";
      toast.error(msg.includes("Invalid") ? "E-mail ou senha incorretos." : msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageShell>
      <section className="mx-auto max-w-md px-4 py-12">
        <Card className="p-6">
          <div className="mb-4 flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            <h1 className="font-display text-2xl font-bold">Área da equipe</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Acesso restrito à equipe autorizada da ACIRV.
          </p>
          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <div>
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@acirv.com.br"
              />
              {errors.email && (
                <p className="mt-1 text-xs text-destructive">{errors.email}</p>
              )}
            </div>
            <div>
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {errors.password && (
                <p className="mt-1 text-xs text-destructive">{errors.password}</p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Entrando…" : "Entrar"}
            </Button>
          </form>
          <p className="mt-6 text-xs text-muted-foreground">
            É participante da feira? Você não precisa fazer login —{" "}
            <Link to="/participar" className="text-primary hover:underline">
              cadastre seu perfil aqui
            </Link>
            .
          </p>
        </Card>
      </section>
    </PageShell>
  );
}

// ------------------------------------------------------------------
// Dashboard
// ------------------------------------------------------------------
function StaffDashboard({ email, role }: { email: string; role: "admin" | "staff" }) {
  const statsQuery = useEventStats(EVENT_ID, { refetchMs: 15_000 });
  const queueQuery = useConnectionsQueue(EVENT_ID, true);
  const advance = useAdvanceConnection(EVENT_ID);

  const [revealMatchId, setRevealMatchId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"pendentes" | "todas" | "concluidas">("pendentes");

  const items = useMemo(() => {
    const all = queueQuery.data ?? [];
    if (filter === "pendentes")
      return all.filter((c) => c.status !== "concluido" && c.status !== "cancelado");
    if (filter === "concluidas")
      return all.filter((c) => c.status === "concluido" || c.status === "cancelado");
    return all;
  }, [queueQuery.data, filter]);

  const stats = statsQuery.data ?? {
    totalProfiles: 0,
    totalMatches: 0,
    mutualMatches: 0,
    totalConnections: 0,
    completedConnections: 0,
    totalSegments: 0,
  };

  async function handleAdvance(c: QueueItem, next: ConnectionStatus) {
    try {
      await advance.mutateAsync({ connectionId: c.id, newStatus: next });
      toast.success(`Status: ${LABELS[next]}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao atualizar.");
    }
  }

  return (
    <PageShell>
      <section className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-primary">
              Equipe · SudoExpo 2026
            </p>
            <h1 className="font-display text-2xl font-bold md:text-3xl">
              Fila de conexões
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {email} · <Badge variant={role === "admin" ? "default" : "secondary"}>{role}</Badge>
            </p>
          </div>
          <div className="flex gap-2">
            {role === "admin" && (
              <Button asChild variant="outline" size="sm">
                <Link to="/admin">Gerenciar equipe</Link>
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => signOut()}>
              <LogOut className="mr-1 h-4 w-4" /> Sair
            </Button>
          </div>
        </header>

        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Stat label="Perfis" value={stats.totalProfiles} />
          <Stat label="Matches" value={stats.totalMatches} />
          <Stat label="Mútuos" value={stats.mutualMatches} />
          <Stat label="Conexões" value={stats.totalConnections} />
          <Stat label="Concluídas" value={stats.completedConnections} />
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {(["pendentes", "todas", "concluidas"] as const).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? "default" : "outline"}
              onClick={() => setFilter(f)}
              className="capitalize"
            >
              {f}
            </Button>
          ))}
          <span className="ml-auto self-center text-xs text-muted-foreground">
            {items.length} conexõe(s) · Realtime ativo
          </span>
        </div>

        {queueQuery.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : items.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            {filter === "pendentes"
              ? "Nada pendente. Quando dois participantes marcarem interesse mútuo, aparece aqui."
              : "Nenhuma conexão neste filtro."}
          </Card>
        ) : (
          <ul className="space-y-3">
            {items.map((c) => (
              <ConnectionCard
                key={c.id}
                c={c}
                onAdvance={handleAdvance}
                onCancel={() => handleAdvance(c, "cancelado")}
                onReveal={() => setRevealMatchId(c.matchId)}
                busy={advance.isPending}
              />
            ))}
          </ul>
        )}
      </section>

      <RevealContactDialog
        matchId={revealMatchId}
        onClose={() => setRevealMatchId(null)}
      />
    </PageShell>
  );
}

function ConnectionCard({
  c,
  onAdvance,
  onCancel,
  onReveal,
  busy,
}: {
  c: QueueItem;
  onAdvance: (c: QueueItem, next: ConnectionStatus) => void;
  onCancel: () => void;
  onReveal: () => void;
  busy: boolean;
}) {
  const nextStatus = NEXT_STATUS[c.status];
  const canReveal =
    c.status === "em_atendimento" ||
    c.status === "apresentados" ||
    c.status === "contato_trocado";
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={`border ${STATUS_TONE[c.status]}`} variant="outline">
              {LABELS[c.status]}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {new Date(c.createdAt).toLocaleString("pt-BR")}
            </span>
          </div>
          <p className="mt-2 font-medium">
            {c.a.name} · <span className="text-muted-foreground">{c.a.company}</span>{" "}
            <span className="mx-1 text-muted-foreground">↔</span>{" "}
            {c.b.name} · <span className="text-muted-foreground">{c.b.company}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            {c.a.city} · {c.b.city}
          </p>
          {c.reason && (
            <p className="mt-2 rounded-md bg-muted/40 p-2 text-xs italic text-muted-foreground">
              "{c.reason}"
            </p>
          )}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {canReveal && (
            <Button size="sm" variant="outline" onClick={onReveal}>
              <Mail className="mr-1 h-4 w-4" /> Ver contatos
            </Button>
          )}
          {nextStatus && (
            <Button size="sm" onClick={() => onAdvance(c, nextStatus)} disabled={busy}>
              Avançar → {LABELS[nextStatus]}
            </Button>
          )}
          {c.status !== "concluido" && c.status !== "cancelado" && (
            <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
              Cancelar
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

function RevealContactDialog({
  matchId,
  onClose,
}: {
  matchId: string | null;
  onClose: () => void;
}) {
  const query = useStaffRevealContacts(matchId);
  return (
    <Dialog open={matchId !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Contatos dos participantes</DialogTitle>
          <DialogDescription>
            Uso interno da equipe · esta consulta fica registrada no log de auditoria.
          </DialogDescription>
        </DialogHeader>
        {query.isLoading && <Skeleton className="h-24 w-full" />}
        {query.isError && (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            Não foi possível carregar os contatos.
          </p>
        )}
        {query.data && (
          <div className="space-y-3">
            {query.data.map((c) => (
              <div key={c.profileId} className="rounded-lg border p-3">
                <p className="font-medium">{c.name}</p>
                <p className="text-xs text-muted-foreground">{c.company}</p>
                <div className="mt-2 space-y-1 text-sm">
                  {c.phone ? (
                    <p>
                      📱{" "}
                      <a
                        href={`https://wa.me/${c.phone.replace(/\D/g, "")}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline"
                      >
                        {c.phone}
                      </a>
                    </p>
                  ) : (
                    <p className="text-muted-foreground">Sem WhatsApp cadastrado</p>
                  )}
                  {c.email && (
                    <p>
                      ✉️ <a href={`mailto:${c.email}`} className="text-primary hover:underline">{c.email}</a>
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-4">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-3xl font-bold tabular-nums">{value}</p>
    </Card>
  );
}
