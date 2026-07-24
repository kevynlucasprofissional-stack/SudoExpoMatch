import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  LogOut,
  Mail,
  ShieldCheck,
  RefreshCw,
  Search,
  UserCheck,
  UserX,
  ClipboardList,
  ArrowRightLeft,
} from "lucide-react";

import { PageShell } from "@/components/brand/BrandShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { EVENT_ID } from "@/lib/mock-data";
import type { ConnectionStatus } from "@/lib/types";
import { useSession } from "@/features/auth/useSession";
import { useEventRole } from "@/features/staff/useEventRole";
import { useEventStats } from "@/features/staff/useEventStats";
import { useStaffRevealContacts } from "@/features/staff/useConnectionsQueue";
import { useEventStaffMembers } from "@/features/admin/useEventStaff";
import { cancelNoteSchema, translateStaffRevealError } from "@/features/staff/schemas";
import { signInWithPassword, signOut, loginSchema } from "@/features/auth/actions";
import {
  useOperationalQueue,
  useAssumeConnection,
  useReleaseConnection,
  useReassignConnection,
  useAddConnectionNote,
  useConnectionDetail,
  type QueueItem,
  type QueueScope,
} from "@/features/staff/useOperationalQueue";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CONNECTION_STATUS_LABEL,
  CONNECTION_STATUS_TONE,
  NEXT_CONNECTION_STATUS,
  canAssume,
  canOperate,
  canRevealContact,
  isTerminalStatus,
  translateOperationalError,
} from "@/features/connections/domain";

export const Route = createFileRoute("/equipe")({
  head: () => ({
    meta: [
      { title: "Área da equipe — Matchmaker SudoExpo" },
      {
        name: "description",
        content:
          "Central operacional da equipe ACIRV: assumir, avançar e auditar conexões do Matchmaker SudoExpo.",
      },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: StaffPage,
});

const PAGE_SIZE = 25;

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
            <h1 className="mt-3 font-display text-xl font-semibold">
              Sem acesso à equipe
            </h1>
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

  return (
    <StaffDashboard
      email={user?.email ?? ""}
      userId={user?.id ?? ""}
      role={roleQuery.data}
    />
  );
}

// ---------------------------------------------------------------- Login
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
      toast.error(
        msg.includes("Invalid") ? "E-mail ou senha incorretos." : msg,
      );
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
                <p className="mt-1 text-xs text-destructive">
                  {errors.password}
                </p>
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

// ---------------------------------------------------------------- Dashboard
function StaffDashboard({
  email,
  userId,
  role,
}: {
  email: string;
  userId: string;
  role: "admin" | "staff";
}) {
  const isAdmin = role === "admin";
  const statsQuery = useEventStats(EVENT_ID, { refetchMs: 15_000 });

  const [scope, setScope] = useState<QueueScope>("pending");
  const [statusFilter, setStatusFilter] = useState<ConnectionStatus | "all">(
    "all",
  );
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(0);

  // Debounce simples do search
  useMemo(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const queueQuery = useOperationalQueue(
    {
      eventId: EVENT_ID,
      statuses: statusFilter === "all" ? undefined : [statusFilter],
      search: debouncedSearch || undefined,
      scope,
      sort: "priority",
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    },
    true,
  );

  const [revealMatchId, setRevealMatchId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<QueueItem | null>(null);
  const [cancelNote, setCancelNote] = useState("");

  const assume = useAssumeConnection(EVENT_ID);
  const release = useReleaseConnection(EVENT_ID);
  const advance = useAdvanceStatusMutation(EVENT_ID);

  const items = queueQuery.data?.items ?? [];
  const total = queueQuery.data?.total ?? 0;
  const counts = queueQuery.data?.counts_by_scope ?? {};
  const stats = statsQuery.data ?? {
    totalProfiles: 0,
    totalMatches: 0,
    mutualMatches: 0,
    totalConnections: 0,
    completedConnections: 0,
    totalSegments: 0,
  };

  async function handleAssume(c: QueueItem) {
    try {
      await assume.mutateAsync(c.id);
      toast.success(`Você assumiu ${c.a_name} ↔ ${c.b_name}.`);
    } catch (err) {
      toast.error(translateOperationalError(err));
      queueQuery.refetch();
    }
  }

  async function handleRelease(c: QueueItem) {
    try {
      await release.mutateAsync({ connectionId: c.id });
      toast.success("Conexão devolvida à fila.");
    } catch (err) {
      toast.error(translateOperationalError(err));
    }
  }

  async function handleAdvance(c: QueueItem, next: ConnectionStatus) {
    try {
      await advance.mutateAsync({ connectionId: c.id, newStatus: next });
      toast.success(`Status: ${CONNECTION_STATUS_LABEL[next]}`);
    } catch (err) {
      toast.error(translateOperationalError(err));
      queueQuery.refetch();
    }
  }

  async function handleConfirmCancel() {
    if (!cancelTarget) return;
    const parsed = cancelNoteSchema.safeParse(cancelNote);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Observação inválida.");
      return;
    }
    try {
      await advance.mutateAsync({
        connectionId: cancelTarget.id,
        newStatus: "cancelado",
        note: parsed.data,
      });
      toast.success("Conexão cancelada.");
      setCancelTarget(null);
      setCancelNote("");
    } catch (err) {
      toast.error(translateOperationalError(err));
    }
  }

  return (
    <PageShell>
      <section className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-primary">
              Central operacional · SudoExpo 2026
            </p>
            <h1 className="font-display text-2xl font-bold md:text-3xl">
              Fila de conexões
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {email} ·{" "}
              <Badge variant={isAdmin ? "default" : "secondary"}>{role}</Badge>
            </p>
          </div>
          <div className="flex gap-2">
            {isAdmin && (
              <Button asChild variant="outline" size="sm">
                <Link to="/admin">Administração</Link>
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => signOut()}>
              <LogOut className="mr-1 h-4 w-4" /> Sair
            </Button>
          </div>
        </header>

        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Stat label="Perfis" value={stats.totalProfiles} />
          <Stat label="Matches" value={stats.totalMatches} />
          <Stat label="Mútuos" value={stats.mutualMatches} />
          <Stat label="Na fila" value={counts.pending ?? 0} />
          <Stat label="Minhas" value={counts.mine ?? 0} />
          <Stat label="Livres" value={counts.unassigned ?? 0} />
        </div>

        <Card className="mb-4 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1">
              {(
                [
                  ["pending", "Ativas"],
                  ["mine", "Minhas"],
                  ["unassigned", "Livres"],
                  ["all", "Todas"],
                  ["closed", "Encerradas"],
                ] as const
              ).map(([s, label]) => (
                <Button
                  key={s}
                  size="sm"
                  variant={scope === s ? "default" : "outline"}
                  onClick={() => {
                    setScope(s);
                    setPage(0);
                  }}
                >
                  {label}
                  <span className="ml-1 text-xs opacity-70">
                    {counts[s] ?? 0}
                  </span>
                </Button>
              ))}
            </div>
            <Select
              value={statusFilter}
              onValueChange={(v) => {
                setStatusFilter(v as ConnectionStatus | "all");
                setPage(0);
              }}
            >
              <SelectTrigger className="h-8 w-44">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Qualquer status</SelectItem>
                {(Object.keys(CONNECTION_STATUS_LABEL) as ConnectionStatus[]).map(
                  (s) => (
                    <SelectItem key={s} value={s}>
                      {CONNECTION_STATUS_LABEL[s]}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
            <div className="relative ml-auto flex-1 min-w-[200px]">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
                placeholder="Buscar por nome, empresa ou cidade…"
                className="h-8 pl-8"
              />
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={() => queueQuery.refetch()}
              aria-label="Atualizar"
            >
              <RefreshCw
                className={`h-4 w-4 ${queueQuery.isFetching ? "animate-spin" : ""}`}
              />
            </Button>
          </div>
        </Card>

        {queueQuery.isPending ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : queueQuery.isError ? (
          <Card className="p-6">
            <p className="text-sm font-medium text-destructive">
              Não foi possível carregar a fila.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-3"
              onClick={() => queueQuery.refetch()}
            >
              Tentar novamente
            </Button>
          </Card>
        ) : items.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            Nenhuma conexão neste filtro.
          </Card>
        ) : (
          <ul className="space-y-3">
            {items.map((c) => (
              <ConnectionCard
                key={c.id}
                c={c}
                userId={userId}
                isAdmin={isAdmin}
                busy={
                  assume.isPending || release.isPending || advance.isPending
                }
                onAssume={() => handleAssume(c)}
                onRelease={() => handleRelease(c)}
                onAdvance={handleAdvance}
                onCancel={() => {
                  setCancelTarget(c);
                  setCancelNote("");
                }}
                onReveal={() => setRevealMatchId(c.match_id)}
                onDetail={() => setDetailId(c.id)}
              />
            ))}
          </ul>
        )}

        {total > PAGE_SIZE && (
          <div className="mt-4 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              Página {page + 1} de {Math.ceil(total / PAGE_SIZE)} · {total} no
              total
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0 || queueQuery.isFetching}
              >
                Anterior
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPage((p) => p + 1)}
                disabled={
                  (page + 1) * PAGE_SIZE >= total || queueQuery.isFetching
                }
              >
                Próxima
              </Button>
            </div>
          </div>
        )}
      </section>

      <RevealContactDialog
        matchId={revealMatchId}
        onClose={() => setRevealMatchId(null)}
      />

      <ConnectionDetailDrawer
        connectionId={detailId}
        onClose={() => setDetailId(null)}
        userId={userId}
        isAdmin={isAdmin}
      />

      <Dialog
        open={cancelTarget !== null}
        onOpenChange={(o) => {
          if (!o) {
            setCancelTarget(null);
            setCancelNote("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancelar conexão</DialogTitle>
            <DialogDescription>
              Explique brevemente o motivo (3 a 500 caracteres). Fica
              registrado no histórico.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={cancelNote}
            onChange={(e) => setCancelNote(e.target.value)}
            placeholder="Ex.: participante desistiu de comparecer ao evento."
            maxLength={500}
            rows={4}
          />
          <p className="text-xs text-muted-foreground">
            {cancelNote.trim().length}/500
          </p>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setCancelTarget(null);
                setCancelNote("");
              }}
              disabled={advance.isPending}
            >
              Voltar
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmCancel}
              disabled={advance.isPending || cancelNote.trim().length < 3}
            >
              Cancelar conexão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

// ---------------------------------------------------------------- ConnectionCard
function ConnectionCard({
  c,
  userId,
  isAdmin,
  busy,
  onAssume,
  onRelease,
  onAdvance,
  onCancel,
  onReveal,
  onDetail,
}: {
  c: QueueItem;
  userId: string;
  isAdmin: boolean;
  busy: boolean;
  onAssume: () => void;
  onRelease: () => void;
  onAdvance: (c: QueueItem, next: ConnectionStatus) => void;
  onCancel: () => void;
  onReveal: () => void;
  onDetail: () => void;
}) {
  const nextStatus = NEXT_CONNECTION_STATUS[c.status];
  const mine = c.assigned_to === userId;
  const canOp = canOperate({
    status: c.status,
    assignedTo: c.assigned_to,
    userId,
    isAdmin,
  });
  const showReveal = canRevealContact(c.status) && c.status !== "cancelado";

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              className={`border ${CONNECTION_STATUS_TONE[c.status]}`}
              variant="outline"
            >
              {CONNECTION_STATUS_LABEL[c.status]}
            </Badge>
            {c.assigned_to ? (
              <Badge
                variant={mine ? "default" : "secondary"}
                className="text-xs"
              >
                {mine
                  ? "Você"
                  : `Com ${c.assignee_email ?? "outro operador"}`}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs">
                Livre
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">
              Criada {new Date(c.created_at).toLocaleString("pt-BR")}
            </span>
          </div>
          <p className="mt-2 font-medium">
            {c.a_name}{" "}
            <span className="text-muted-foreground">· {c.a_company}</span>{" "}
            <span className="mx-1 text-muted-foreground">↔</span> {c.b_name}{" "}
            <span className="text-muted-foreground">· {c.b_company}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            {c.a_city} · {c.b_city}
          </p>
          {c.notes && (
            <p className="mt-2 rounded-md bg-muted/40 p-2 text-xs italic text-muted-foreground">
              "{c.notes}"
            </p>
          )}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onDetail}>
            <ClipboardList className="mr-1 h-4 w-4" /> Detalhes
          </Button>
          {canAssume(c.status, c.assigned_to) && (
            <Button size="sm" onClick={onAssume} disabled={busy}>
              <UserCheck className="mr-1 h-4 w-4" /> Assumir
            </Button>
          )}
          {mine && !isTerminalStatus(c.status) && c.status !== "aguardando" && (
            <Button
              size="sm"
              variant="outline"
              onClick={onRelease}
              disabled={busy}
            >
              <UserX className="mr-1 h-4 w-4" /> Devolver
            </Button>
          )}
          {showReveal && canOp && (
            <Button size="sm" variant="outline" onClick={onReveal}>
              <Mail className="mr-1 h-4 w-4" /> Contatos
            </Button>
          )}
          {nextStatus && canOp && (
            <Button
              size="sm"
              onClick={() => onAdvance(c, nextStatus)}
              disabled={busy}
            >
              → {CONNECTION_STATUS_LABEL[nextStatus]}
            </Button>
          )}
          {!isTerminalStatus(c.status) && canOp && (
            <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
              Cancelar
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------- Detail Drawer
function ConnectionDetailDrawer({
  connectionId,
  onClose,
  userId,
  isAdmin,
}: {
  connectionId: string | null;
  onClose: () => void;
  userId: string;
  isAdmin: boolean;
}) {
  const q = useConnectionDetail(connectionId);
  const addNote = useAddConnectionNote(EVENT_ID);
  const reassign = useReassignConnection(EVENT_ID);
  const staffMembers = useEventStaffMembers(EVENT_ID, isAdmin);

  const [noteInput, setNoteInput] = useState("");
  const [reassignTo, setReassignTo] = useState<string>("");

  async function handleAddNote() {
    if (!connectionId || noteInput.trim().length < 1) return;
    try {
      await addNote.mutateAsync({ connectionId, body: noteInput.trim() });
      setNoteInput("");
      toast.success("Nota adicionada.");
    } catch (err) {
      toast.error(translateOperationalError(err));
    }
  }

  async function handleReassign() {
    if (!connectionId || !reassignTo) return;
    try {
      await reassign.mutateAsync({
        connectionId,
        newUserId: reassignTo,
      });
      toast.success("Conexão reatribuída.");
      setReassignTo("");
    } catch (err) {
      toast.error(translateOperationalError(err));
    }
  }

  return (
    <Sheet open={connectionId !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Detalhes da conexão</SheetTitle>
          <SheetDescription>
            Histórico completo, notas internas e ações administrativas.
          </SheetDescription>
        </SheetHeader>

        {q.isPending && <Skeleton className="mt-4 h-40 w-full" />}
        {q.isError && (
          <p className="mt-4 text-sm text-destructive">
            {translateOperationalError(q.error)}
          </p>
        )}
        {q.data && (
          <div className="mt-4 space-y-6 text-sm">
            <section>
              <div className="flex items-center gap-2">
                <Badge
                  className={`border ${CONNECTION_STATUS_TONE[q.data.status]}`}
                  variant="outline"
                >
                  {CONNECTION_STATUS_LABEL[q.data.status]}
                </Badge>
                {q.data.assignee_email && (
                  <span className="text-xs text-muted-foreground">
                    Responsável: {q.data.assignee_email}
                  </span>
                )}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <TimeRow label="Criada" v={q.data.created_at} />
                <TimeRow label="Assumida" v={q.data.assumed_at} />
                <TimeRow label="Apresentados" v={q.data.presented_at} />
                <TimeRow label="Contato trocado" v={q.data.contact_exchanged_at} />
                <TimeRow label="Concluída" v={q.data.completed_at} />
                <TimeRow label="Cancelada" v={q.data.cancelled_at} />
              </div>
            </section>

            <section className="grid gap-2 sm:grid-cols-2">
              <PartyBlock title="A" p={q.data.a} />
              <PartyBlock title="B" p={q.data.b} />
            </section>

            {q.data.reasons.length > 0 && (
              <section>
                <h3 className="mb-1 font-medium">Sinais do match</h3>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {q.data.reasons.map((r) => (
                    <li key={r.code + (r.perspective_profile_id ?? "")}>
                      • {r.label ?? r.code}{" "}
                      <span className="opacity-70">(+{r.weight})</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <h3 className="mb-2 font-medium">Linha do tempo</h3>
              <ul className="space-y-2">
                {q.data.events.map((e) => (
                  <li
                    key={e.id}
                    className="rounded-md border border-border/60 bg-muted/30 p-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{e.action}</span>
                      <span className="text-muted-foreground">
                        {new Date(e.created_at).toLocaleString("pt-BR")}
                      </span>
                    </div>
                    {e.previous_status && e.new_status && (
                      <p className="text-muted-foreground">
                        {CONNECTION_STATUS_LABEL[e.previous_status]} →{" "}
                        {CONNECTION_STATUS_LABEL[e.new_status]}
                      </p>
                    )}
                    {e.actor_email && (
                      <p className="text-muted-foreground">por {e.actor_email}</p>
                    )}
                    {e.note && <p className="mt-1 italic">"{e.note}"</p>}
                  </li>
                ))}
                {q.data.events.length === 0 && (
                  <li className="text-xs text-muted-foreground">
                    Sem eventos registrados.
                  </li>
                )}
              </ul>
            </section>

            <section>
              <h3 className="mb-2 font-medium">Notas internas</h3>
              <ul className="space-y-2">
                {q.data.internal_notes.map((n) => (
                  <li
                    key={n.id}
                    className="rounded-md border border-border/60 bg-secondary/10 p-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">
                        {n.author_email ?? "Equipe"}
                      </span>
                      <span className="text-muted-foreground">
                        {new Date(n.created_at).toLocaleString("pt-BR")}
                      </span>
                    </div>
                    <p className="mt-1">{n.body}</p>
                  </li>
                ))}
                {q.data.internal_notes.length === 0 && (
                  <li className="text-xs text-muted-foreground">
                    Nenhuma nota interna ainda.
                  </li>
                )}
              </ul>
              {canOperate({
                status: q.data.status,
                assignedTo: q.data.assigned_to,
                userId,
                isAdmin,
              }) && (
                <div className="mt-2 space-y-2">
                  <Textarea
                    value={noteInput}
                    onChange={(e) => setNoteInput(e.target.value)}
                    placeholder="Registrar observação interna…"
                    rows={3}
                    maxLength={1000}
                  />
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      onClick={handleAddNote}
                      disabled={
                        addNote.isPending || noteInput.trim().length < 1
                      }
                    >
                      Adicionar nota
                    </Button>
                  </div>
                </div>
              )}
            </section>

            {isAdmin && !isTerminalStatus(q.data.status) && (
              <section>
                <h3 className="mb-2 flex items-center gap-1 font-medium">
                  <ArrowRightLeft className="h-4 w-4" /> Reatribuir
                </h3>
                <div className="flex gap-2">
                  <Select value={reassignTo} onValueChange={setReassignTo}>
                    <SelectTrigger>
                      <SelectValue placeholder="Escolha um membro" />
                    </SelectTrigger>
                    <SelectContent>
                      {(staffMembers.data ?? []).map((m) => (
                        <SelectItem key={m.userId} value={m.userId}>
                          {m.email} ({m.role})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={handleReassign}
                    disabled={!reassignTo || reassign.isPending}
                  >
                    Reatribuir
                  </Button>
                </div>
              </section>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function TimeRow({ label, v }: { label: string; v: string | null }) {
  return (
    <div>
      <span className="opacity-70">{label}: </span>
      <span>{v ? new Date(v).toLocaleString("pt-BR") : "—"}</span>
    </div>
  );
}

function PartyBlock({
  title,
  p,
}: {
  title: string;
  p: {
    id: string;
    name: string;
    company: string;
    city: string;
    segment_id: string;
    summary: string;
  };
}) {
  return (
    <div className="rounded-md border p-2">
      <p className="text-xs uppercase text-muted-foreground">{title}</p>
      <p className="font-medium">{p.name}</p>
      <p className="text-xs text-muted-foreground">
        {p.company} · {p.city}
      </p>
      <p className="mt-1 text-xs">{p.summary}</p>
    </div>
  );
}

// ---------------------------------------------------------------- Reveal
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
            Uso interno da equipe · esta consulta fica registrada no log de
            auditoria.
          </DialogDescription>
        </DialogHeader>
        {query.isLoading && <Skeleton className="h-24 w-full" />}
        {query.isError && (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            {translateStaffRevealError(query.error)}
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
                    <p className="text-muted-foreground">
                      Sem WhatsApp cadastrado
                    </p>
                  )}
                  {c.email && (
                    <p>
                      ✉️{" "}
                      <a
                        href={`mailto:${c.email}`}
                        className="text-primary hover:underline"
                      >
                        {c.email}
                      </a>
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
      <p className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-display text-3xl font-bold tabular-nums">
        {value}
      </p>
    </Card>
  );
}

// ---------------------------------------------------------------- Advance mutation
// Wrapper local que também invalida a fila v2/op-stats.
function useAdvanceStatusMutation(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      connectionId: string;
      newStatus: ConnectionStatus;
      note?: string | null;
    }) => {
      const { error } = await supabase.rpc("staff_advance_connection", {
        _connection_id: input.connectionId,
        _new_status: input.newStatus,
        _note: input.note ?? undefined,
      });
      if (error) throw error;
    },
    onSuccess: (_, input) => {
      qc.invalidateQueries({ queryKey: ["staff", "queue", eventId] });
      qc.invalidateQueries({ queryKey: ["staff", "op-stats", eventId] });
      qc.invalidateQueries({ queryKey: ["stats", eventId] });
      qc.invalidateQueries({
        queryKey: ["staff", "connection-detail", input.connectionId],
      });
    },
  });
}
