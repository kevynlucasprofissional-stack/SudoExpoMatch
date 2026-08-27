import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
  ShieldAlert,
  MapPin,
  MapPinOff,
  X,
  MessageCircle,
} from "lucide-react";
import { zodValidator } from "@tanstack/zod-adapter";

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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";

import { useStaffParticipantSocial } from "@/features/staff/useParticipantSocial";
import { readStringList, readText } from "@/features/social/socialProfile";
import { EVENT_ID } from "@/config/event";
import type { ConnectionStatus } from "@/lib/types";
import { useSession } from "@/features/auth/useSession";
import { useEventRole } from "@/features/staff/useEventRole";
import { useEventStats } from "@/features/staff/useEventStats";
import { useEventSegments } from "@/features/staff/useEventSegments";
import { useRevealStaffContact } from "@/features/staff/useConnectionsQueue";
import { ReleaseWhatsAppDialog } from "@/features/connections/ReleaseWhatsAppDialog";
import { useEventStaffMembers } from "@/features/admin/useEventStaff";
import {
  cancelNoteSchema,
  adminRevealOverrideSchema,
  optionalStaffNoteSchema,
  pinCodeSchema,
  translateStaffRevealError,
} from "@/features/staff/schemas";
import {
  equipeSearchSchema,
  normalizeEquipeSearch,
  segmentsToParam,
  type EquipeSearch,
  type NormalizedEquipeSearch,
} from "@/features/staff/urlState";
import { signInWithPassword, signOut, loginSchema } from "@/features/auth/actions";
import {
  useOperationalQueue,
  useAssumeConnection,
  useReleaseConnection,
  useReassignConnection,
  useAddConnectionNote,
  useConnectionDetail,
  QUEUE_SORT_LABEL,
  QUEUE_SORTS,
  useParticipantPins,
  useSetParticipantPin,
  useClearParticipantPin,
  useMarkConnectionMapped,
  useUnmarkConnectionMapped,
  type QueueItem,
  type QueueSort,
  type PinItem,
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
import { secondsSince } from "@/features/connections/time";
import { track } from "@/features/analytics/track";
import {
  OUTCOME_KINDS,
  OUTCOME_LABEL,
  OUTCOME_NOTE_MAX,
  translateOutcomeError,
  useRecordConnectionOutcome,
  useRemoveConnectionOutcome,
  type ConnectionOutcome,
  type OutcomeKind,
} from "@/features/staff/outcomes";
import {
  canAddInternalNote,
  eligibleReassignees,
  formatElapsedSeconds,
  getOperationalCta,
} from "@/features/staff/operationalUi";

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
  validateSearch: zodValidator(equipeSearchSchema),
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
            <h1 className="mt-3 font-display text-xl font-semibold">Sem acesso à equipe</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Sua conta <strong>{user?.email}</strong> não tem papel na equipe deste evento. Fale
              com um administrador da ACIRV.
            </p>
            <Button variant="outline" className="mt-4" onClick={() => signOut()}>
              <LogOut className="mr-1 h-4 w-4" /> Sair
            </Button>
          </Card>
        </section>
      </PageShell>
    );
  }

  return <StaffDashboard email={user?.email ?? ""} userId={user?.id ?? ""} role={roleQuery.data} />;
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
              {errors.email && <p className="mt-1 text-xs text-destructive">{errors.email}</p>}
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
  const segmentsQuery = useEventSegments(EVENT_ID, true);
  const navigate = useNavigate({ from: "/equipe" });
  const rawSearch = Route.useSearch() as EquipeSearch;
  const search = useMemo<NormalizedEquipeSearch>(
    () => normalizeEquipeSearch(rawSearch),
    [rawSearch],
  );

  // Debounce real com useEffect + cleanup (não usa useMemo por efeito colateral).
  const [searchInput, setSearchInput] = useState(search.q);
  useEffect(() => {
    setSearchInput(search.q);
  }, [search.q]);
  useEffect(() => {
    const t = setTimeout(() => {
      const trimmed = searchInput.trim().slice(0, 200);
      if (trimmed === search.q) return;
      navigate({
        search: (prev: EquipeSearch) => ({ ...prev, q: trimmed, page: 1 }),
        replace: true,
      });
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput, search.q, navigate]);

  const pageIndex = Math.max(0, search.page - 1);
  const queueQuery = useOperationalQueue(
    {
      eventId: EVENT_ID,
      statuses: search.status === "all" ? undefined : [search.status],
      segmentIds: search.segments.length > 0 ? search.segments : undefined,
      search: search.q || undefined,
      scope: search.scope,
      sort: search.sort,
      limit: PAGE_SIZE,
      offset: pageIndex * PAGE_SIZE,
    },
    true,
  );

  const [revealTarget, setRevealTarget] = useState<QueueItem | null>(null);
  const [whatsTarget, setWhatsTarget] = useState<QueueItem | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<QueueItem | null>(null);
  const [cancelNote, setCancelNote] = useState("");
  const [releaseTarget, setReleaseTarget] = useState<QueueItem | null>(null);
  const [releaseNote, setReleaseNote] = useState("");

  const assume = useAssumeConnection(EVENT_ID);
  const release = useReleaseConnection(EVENT_ID);
  const advance = useAdvanceStatusMutation(EVENT_ID);
  const markMapped = useMarkConnectionMapped(EVENT_ID);
  const unmarkMapped = useUnmarkConnectionMapped(EVENT_ID);
  const [pinsOpen, setPinsOpen] = useState(false);

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

  function updateSearch(patch: Partial<EquipeSearch>) {
    navigate({
      search: (prev: EquipeSearch) => ({ ...prev, ...patch }),
      replace: true,
    });
  }

  async function handleAssume(c: QueueItem) {
    try {
      await assume.mutateAsync(c.id);
      toast.success(`Você assumiu ${c.a_name} ↔ ${c.b_name}.`);
    } catch (err) {
      toast.error(translateOperationalError(err));
      queueQuery.refetch();
    }
  }

  async function handleConfirmRelease() {
    if (!releaseTarget) return;
    const parsed = optionalStaffNoteSchema.safeParse(releaseNote || undefined);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Observação inválida.");
      return;
    }
    try {
      await release.mutateAsync({
        connectionId: releaseTarget.id,
        note: parsed.data,
      });
      toast.success("Conexão devolvida à fila.");
      setReleaseTarget(null);
      setReleaseNote("");
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

  async function handleToggleMapped(c: QueueItem) {
    try {
      if (c.mapped_at) {
        await unmarkMapped.mutateAsync({ connectionId: c.id });
        toast.success("Registro no mapa físico desfeito.");
      } else {
        await markMapped.mutateAsync({ connectionId: c.id });
        toast.success("Conexão registrada no mapa físico.");
      }
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
            <h1 className="font-display text-2xl font-bold md:text-3xl">Fila de conexões</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>{email}</span>
              <Badge variant={isAdmin ? "default" : "secondary"}>{role}</Badge>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPinsOpen(true)}>
              <MapPin className="mr-1 h-4 w-4" /> Pins do mapa
            </Button>
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
          <Stat label="Falta no mapa" value={counts.map_pending ?? 0} />
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
                  ["map_pending", "Falta no mapa"],
                  ["mapped", "No mapa"],
                ] as const
              ).map(([s, label]) => (
                <Button
                  key={s}
                  size="sm"
                  variant={search.scope === s ? "default" : "outline"}
                  onClick={() => updateSearch({ scope: s, page: 1 })}
                >
                  {label}
                  <span className="ml-1 text-xs opacity-70">{counts[s] ?? 0}</span>
                </Button>
              ))}
            </div>

            <Select
              value={search.status}
              onValueChange={(v) => updateSearch({ status: v, page: 1 })}
            >
              <SelectTrigger className="h-8 w-44">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Qualquer status</SelectItem>
                {(Object.keys(CONNECTION_STATUS_LABEL) as ConnectionStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {CONNECTION_STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={search.sort}
              onValueChange={(v) => updateSearch({ sort: v as QueueSort })}
            >
              <SelectTrigger className="h-8 w-44">
                <SelectValue placeholder="Ordenar" />
              </SelectTrigger>
              <SelectContent>
                {QUEUE_SORTS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {QUEUE_SORT_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <SegmentsFilter
              value={search.segments}
              options={segmentsQuery.data ?? []}
              onChange={(ids) => updateSearch({ segments: segmentsToParam(ids), page: 1 })}
            />

            <div className="relative ml-auto flex-1 min-w-[200px]">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
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
              <RefreshCw className={`h-4 w-4 ${queueQuery.isFetching ? "animate-spin" : ""}`} />
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
                  assume.isPending ||
                  release.isPending ||
                  advance.isPending ||
                  markMapped.isPending ||
                  unmarkMapped.isPending
                }
                onAssume={() => handleAssume(c)}
                onRelease={() => {
                  setReleaseTarget(c);
                  setReleaseNote("");
                }}
                onAdvance={handleAdvance}
                onCancel={() => {
                  setCancelTarget(c);
                  setCancelNote("");
                }}
                onReveal={() => setRevealTarget(c)}
                onReleaseWhatsApp={() => setWhatsTarget(c)}
                onToggleMapped={() => handleToggleMapped(c)}
                onDetail={() => setDetailId(c.id)}
              />
            ))}
          </ul>
        )}

        {total > PAGE_SIZE && (
          <div className="mt-4 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              Página {search.page} de {Math.ceil(total / PAGE_SIZE)} · {total} no total
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => updateSearch({ page: Math.max(1, search.page - 1) })}
                disabled={search.page === 1 || queueQuery.isFetching}
              >
                Anterior
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => updateSearch({ page: search.page + 1 })}
                disabled={search.page * PAGE_SIZE >= total || queueQuery.isFetching}
              >
                Próxima
              </Button>
            </div>
          </div>
        )}
      </section>

      <PinsDialog open={pinsOpen} onClose={() => setPinsOpen(false)} />

      <RevealContactDialog
        target={revealTarget}
        isAdmin={isAdmin}
        onClose={() => setRevealTarget(null)}
      />

      <ReleaseWhatsAppDialog
        matchId={whatsTarget?.match_id ?? null}
        pairLabel={whatsTarget ? `${whatsTarget.a_name} ↔ ${whatsTarget.b_name}` : undefined}
        alreadyReleased={whatsTarget ? canRevealContact(whatsTarget.status) : false}
        onClose={() => setWhatsTarget(null)}
        onReleased={() => {
          qc.invalidateQueries({ queryKey: ["staff", "queue", EVENT_ID] });
          qc.invalidateQueries({ queryKey: ["staff", "op-stats", EVENT_ID] });
        }}
      />

      <ConnectionDetailDrawer
        connectionId={detailId}
        onClose={() => setDetailId(null)}
        isAdmin={isAdmin}
      />

      {/* Cancelar (nota obrigatória 3–500) */}
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
              Explique brevemente o motivo (3 a 500 caracteres). Fica registrado no histórico.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={cancelNote}
            onChange={(e) => setCancelNote(e.target.value)}
            placeholder="Ex.: participante desistiu de comparecer ao evento."
            maxLength={500}
            rows={4}
          />
          <p className="text-xs text-muted-foreground">{cancelNote.trim().length}/500</p>
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

      {/* Devolver (nota opcional) */}
      <Dialog
        open={releaseTarget !== null}
        onOpenChange={(o) => {
          if (!o) {
            setReleaseTarget(null);
            setReleaseNote("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Devolver à fila</DialogTitle>
            <DialogDescription>
              A conexão volta para "Livres". Adicione uma observação (opcional).
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={releaseNote}
            onChange={(e) => setReleaseNote(e.target.value)}
            placeholder="Ex.: preciso passar para outro atendente."
            maxLength={500}
            rows={3}
          />
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setReleaseTarget(null);
                setReleaseNote("");
              }}
              disabled={release.isPending}
            >
              Voltar
            </Button>
            <Button onClick={handleConfirmRelease} disabled={release.isPending}>
              Devolver
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

// ---------------------------------------------------------------- Segments filter
function SegmentsFilter({
  value,
  options,
  onChange,
}: {
  value: string[];
  options: Array<{ id: string; label: string; emoji?: string }>;
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = new Set(value);
  const label =
    value.length === 0
      ? "Segmentos"
      : value.length === 1
        ? (options.find((o) => o.id === value[0])?.label ?? "1 segmento")
        : `${value.length} segmentos`;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="h-8">
          {label}
          {value.length > 0 && (
            <X
              className="ml-1 h-3 w-3 opacity-60 hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                onChange([]);
              }}
            />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <div className="max-h-64 space-y-1 overflow-auto">
          {options.length === 0 && (
            <p className="p-2 text-xs text-muted-foreground">Nenhum segmento disponível.</p>
          )}
          {options.map((o) => (
            <label
              key={o.id}
              className="flex cursor-pointer items-center gap-2 rounded p-1 hover:bg-muted"
            >
              <Checkbox
                checked={selected.has(o.id)}
                onCheckedChange={(v) => {
                  const next = new Set(selected);
                  if (v) next.add(o.id);
                  else next.delete(o.id);
                  onChange(Array.from(next));
                }}
              />
              <span className="text-sm">
                {o.emoji} {o.label}
              </span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** O mapa físico só aceita conexões cujas partes já foram apresentadas. */
function canMapConnection(status: ConnectionStatus): boolean {
  return status === "apresentados" || status === "contato_trocado" || status === "concluido";
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
  onReleaseWhatsApp,
  onToggleMapped,
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
  onReleaseWhatsApp: () => void;
  onToggleMapped: () => void;
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
  const canReveal = canRevealContact(c.status) || (isAdmin && !isTerminalStatus(c.status)); // admin pode com override

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={`border ${CONNECTION_STATUS_TONE[c.status]}`} variant="outline">
              {CONNECTION_STATUS_LABEL[c.status]}
            </Badge>
            {c.assigned_to ? (
              <Badge variant={mine ? "default" : "secondary"} className="text-xs">
                {mine ? "Você" : `Com ${c.assignee_email ?? "outro operador"}`}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs">
                Livre
              </Badge>
            )}
            {c.mapped_at ? (
              <Badge
                variant="outline"
                className="border-emerald-500/40 text-xs text-emerald-700"
                title={`Registrada no mapa em ${new Date(c.mapped_at).toLocaleString("pt-BR")}${
                  c.mapped_by_email ? ` por ${c.mapped_by_email}` : ""
                }`}
              >
                <MapPin className="mr-1 h-3 w-3" /> No mapa
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs text-muted-foreground">
                <MapPinOff className="mr-1 h-3 w-3" /> Fora do mapa
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">
              Criada {new Date(c.created_at).toLocaleString("pt-BR")}
            </span>
            <span className="text-xs text-muted-foreground" title="Tempo total desde a criação">
              · Espera: {formatElapsedSeconds(c.seconds_waiting)}
            </span>
            <span className="text-xs text-muted-foreground" title="Tempo na etapa atual">
              · Nesta etapa: {formatElapsedSeconds(c.seconds_in_stage)}
            </span>
          </div>
          <p className="mt-2 font-medium">
            {c.a_name} <span className="text-muted-foreground">· {c.a_company ?? ""}</span>{" "}
            <span className="mx-1 text-muted-foreground">↔</span> {c.b_name}{" "}
            <span className="text-muted-foreground">· {c.b_company ?? ""}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            {c.a_city ?? "—"} · {c.b_city ?? "—"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Pin {c.a_name}: {c.a_pin_code ?? (c.a_pin_placed_at ? "sem código" : "sem pin")} · Pin{" "}
            {c.b_name}: {c.b_pin_code ?? (c.b_pin_placed_at ? "sem código" : "sem pin")}
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
              <UserCheck className="mr-1 h-4 w-4" /> Assumir atendimento
            </Button>
          )}
          {mine && !isTerminalStatus(c.status) && c.status !== "aguardando" && (
            <Button size="sm" variant="outline" onClick={onRelease} disabled={busy}>
              <UserX className="mr-1 h-4 w-4" /> Devolver
            </Button>
          )}
          {canReveal && canOp && (
            <Button size="sm" variant="outline" onClick={onReveal}>
              <Mail className="mr-1 h-4 w-4" /> Contatos
              {!canRevealContact(c.status) && isAdmin && (
                <ShieldAlert className="ml-1 h-3 w-3 text-amber-600" />
              )}
            </Button>
          )}
          {isAdmin && c.status !== "cancelado" && (
            <Button
              size="sm"
              variant={canRevealContact(c.status) ? "outline" : "default"}
              onClick={onReleaseWhatsApp}
              data-testid="release-whatsapp"
            >
              <MessageCircle className="mr-1 h-4 w-4" />
              {canRevealContact(c.status) ? "WhatsApp liberado" : "Liberar WhatsApp"}
            </Button>
          )}
          {nextStatus && canOp && c.status !== "aguardando" && getOperationalCta(c.status) && (
            <Button
              size="sm"
              onClick={() => onAdvance(c, nextStatus)}
              disabled={busy}
              title={`Avançar para ${CONNECTION_STATUS_LABEL[nextStatus]}`}
            >
              {getOperationalCta(c.status)}
            </Button>
          )}
          {canOp && canMapConnection(c.status) && (
            <Button size="sm" variant="outline" onClick={onToggleMapped} disabled={busy}>
              {c.mapped_at ? (
                <>
                  <MapPinOff className="mr-1 h-4 w-4" /> Desfazer mapa
                </>
              ) : (
                <>
                  <MapPin className="mr-1 h-4 w-4" /> Registrar no mapa
                </>
              )}
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
  isAdmin,
}: {
  connectionId: string | null;
  onClose: () => void;
  isAdmin: boolean;
}) {
  const q = useConnectionDetail(connectionId);
  const addNote = useAddConnectionNote(EVENT_ID);
  const reassign = useReassignConnection(EVENT_ID);
  const staffMembers = useEventStaffMembers(EVENT_ID, isAdmin);

  const [noteInput, setNoteInput] = useState("");
  const [reassignTo, setReassignTo] = useState<string>("");
  const [reassignNote, setReassignNote] = useState("");

  // Limpa destino e nota ao fechar OU trocar de conexão.
  useEffect(() => {
    setNoteInput("");
    setReassignTo("");
    setReassignNote("");
  }, [connectionId]);

  // Analytics: abertura do detalhe da conexão (sem PII).
  useEffect(() => {
    if (!connectionId) return;
    track({
      kind: "connection_viewed",
      eventId: EVENT_ID,
      payload: { connection_id: connectionId },
      dedupeKey: `connection_viewed:${connectionId}`,
    });
  }, [connectionId]);

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
    const parsed = optionalStaffNoteSchema.safeParse(reassignNote || undefined);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Observação inválida.");
      return;
    }
    try {
      await reassign.mutateAsync({
        connectionId,
        newUserId: reassignTo,
        note: parsed.data,
      });
      toast.success("Conexão reatribuída.");
      setReassignTo("");
      setReassignNote("");
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
          <p className="mt-4 text-sm text-destructive">{translateOperationalError(q.error)}</p>
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
                <TimeRow label="Registrada no mapa" v={q.data.mapped_at} />
                {q.data.mapped_by_email && (
                  <p className="text-xs text-muted-foreground">
                    Registro no mapa por {q.data.mapped_by_email}
                  </p>
                )}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 rounded-md border border-border/60 bg-muted/30 p-2 text-xs">
                <div>
                  <span className="opacity-70">Tempo na etapa atual: </span>
                  <span className="font-medium">
                    {formatElapsedSeconds(secondsSince(q.data.updated_at))}
                  </span>
                </div>
                <div>
                  <span className="opacity-70">Tempo total desde a criação: </span>
                  <span className="font-medium">
                    {formatElapsedSeconds(secondsSince(q.data.created_at))}
                  </span>
                </div>
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
                      • {r.label ?? r.code} <span className="opacity-70">(+{r.weight})</span>
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
                    {e.actor_email && <p className="text-muted-foreground">por {e.actor_email}</p>}
                    {e.note && <p className="mt-1 italic">"{e.note}"</p>}
                  </li>
                ))}
                {q.data.events.length === 0 && (
                  <li className="text-xs text-muted-foreground">Sem eventos registrados.</li>
                )}
              </ul>
            </section>

            <OutcomesSection
              eventId={q.data.event_id}
              connectionId={q.data.id}
              outcomes={q.data.outcomes}
            />

            <section>
              <h3 className="mb-2 font-medium">Notas internas</h3>
              <ul className="space-y-2">
                {q.data.internal_notes.map((n) => (
                  <li
                    key={n.id}
                    className="rounded-md border border-border/60 bg-secondary/10 p-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{n.author_email ?? "Equipe"}</span>
                      <span className="text-muted-foreground">
                        {new Date(n.created_at).toLocaleString("pt-BR")}
                      </span>
                    </div>
                    <p className="mt-1">{n.body}</p>
                  </li>
                ))}
                {q.data.internal_notes.length === 0 && (
                  <li className="text-xs text-muted-foreground">Nenhuma nota interna ainda.</li>
                )}
              </ul>
              {canAddInternalNote() && (
                <div className="mt-2 space-y-2">
                  <Textarea
                    value={noteInput}
                    onChange={(e) => setNoteInput(e.target.value)}
                    placeholder="Registrar observação interna (visível apenas para equipe)…"
                    rows={3}
                    maxLength={1000}
                  />
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      Qualquer membro da equipe pode adicionar notas.
                    </p>
                    <Button
                      size="sm"
                      onClick={handleAddNote}
                      disabled={addNote.isPending || noteInput.trim().length < 1}
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
                {(() => {
                  const eligible = eligibleReassignees(staffMembers.data ?? [], q.data.assigned_to);
                  if (eligible.length === 0) {
                    return (
                      <p className="text-xs text-muted-foreground">
                        Não há outro membro disponível para reatribuição neste evento.
                      </p>
                    );
                  }
                  return (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <Select value={reassignTo} onValueChange={setReassignTo}>
                          <SelectTrigger>
                            <SelectValue placeholder="Escolha um membro" />
                          </SelectTrigger>
                          <SelectContent>
                            {eligible.map((m) => (
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
                      <Textarea
                        value={reassignNote}
                        onChange={(e) => setReassignNote(e.target.value)}
                        placeholder="Observação opcional para o histórico (máx. 500)"
                        rows={2}
                        maxLength={500}
                      />
                      <p className="text-right text-[10px] text-muted-foreground">
                        {reassignNote.trim().length}/500
                      </p>
                    </div>
                  );
                })()}
              </section>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function OutcomesSection({
  eventId,
  connectionId,
  outcomes,
}: {
  eventId: string;
  connectionId: string;
  outcomes: ConnectionOutcome[];
}) {
  const [kind, setKind] = useState<OutcomeKind | "">("");
  const [note, setNote] = useState("");
  const record = useRecordConnectionOutcome(eventId);
  const remove = useRemoveConnectionOutcome(eventId);
  const registered = new Set(outcomes.map((o) => o.kind));
  const available = OUTCOME_KINDS.filter((k) => !registered.has(k));

  async function handleRecord() {
    if (!kind) return;
    try {
      await record.mutateAsync({ connectionId, kind, note });
      toast.success("Resultado comercial registrado.");
      setKind("");
      setNote("");
    } catch (err) {
      toast.error(translateOutcomeError(err));
    }
  }

  async function handleRemove(target: OutcomeKind) {
    try {
      await remove.mutateAsync({ connectionId, kind: target });
      toast.success("Resultado removido.");
    } catch (err) {
      toast.error(translateOutcomeError(err));
    }
  }

  return (
    <section>
      <h3 className="mb-1 font-medium">Resultados comerciais</h3>
      <p className="mb-2 text-xs text-muted-foreground">
        Independente do status operacional. Registre apenas o que foi informado.
      </p>
      <ul className="space-y-2">
        {outcomes.map((o) => (
          <li
            key={o.kind}
            className="rounded-md border border-border/60 bg-secondary/10 p-2 text-xs"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{OUTCOME_LABEL[o.kind]}</span>
              <span className="text-muted-foreground">
                {new Date(o.created_at).toLocaleString("pt-BR")}
              </span>
            </div>
            {o.actor_email && <p className="text-muted-foreground">por {o.actor_email}</p>}
            {o.note && <p className="mt-1 italic">"{o.note}"</p>}
            <Button
              size="sm"
              variant="ghost"
              className="mt-1 h-7 px-2 text-xs"
              disabled={remove.isPending}
              onClick={() => handleRemove(o.kind)}
            >
              Remover
            </Button>
          </li>
        ))}
        {outcomes.length === 0 && (
          <li className="text-xs text-muted-foreground">Nenhum resultado registrado.</li>
        )}
      </ul>

      {available.length > 0 && (
        <div className="mt-2 space-y-2">
          <div className="flex gap-2">
            <Select value={kind} onValueChange={(v) => setKind(v as OutcomeKind)}>
              <SelectTrigger>
                <SelectValue placeholder="Tipo de resultado" />
              </SelectTrigger>
              <SelectContent>
                {available.map((k) => (
                  <SelectItem key={k} value={k}>
                    {OUTCOME_LABEL[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleRecord} disabled={!kind || record.isPending}>
              Registrar
            </Button>
          </div>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Observação curta opcional"
            rows={2}
            maxLength={OUTCOME_NOTE_MAX}
          />
          <p className="text-right text-[10px] text-muted-foreground">
            {note.trim().length}/{OUTCOME_NOTE_MAX}
          </p>
        </div>
      )}
    </section>
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
    company: string | null;
    city: string | null;
    segment_id: string | null;
    summary: string | null;
    pin_code?: string | null;
    pin_placed_at?: string | null;
  };
}) {
  return (
    <div className="rounded-md border p-2">
      <p className="text-xs uppercase text-muted-foreground">{title}</p>
      <p className="font-medium">{p.name}</p>
      <p className="text-xs text-muted-foreground">
        {p.company ?? "—"} · {p.city ?? "—"}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {p.pin_placed_at
          ? `Pin no mapa: ${p.pin_code ?? "sem código"}`
          : "Ainda sem pin no mapa"}
      </p>
      {p.summary && <p className="mt-1 text-xs">{p.summary}</p>}
      <StaffSocialLine profileId={p.id} />
    </div>
  );
}

/**
 * Contexto profissional/social do participante para a operação.
 * Sem SELECT direto em `private`: usa a RPC `staff_get_participant_social`,
 * que valida evento e papel do usuário e nunca devolve análise de IA.
 */
function StaffSocialLine({ profileId }: { profileId: string }) {
  const q = useStaffParticipantSocial(profileId);
  const data = q.data;
  if (!data) return null;
  const prof = data.profile;
  const social = data.social;
  const ctx = social?.context_snapshot ?? social?.cache?.extracted_context ?? null;
  const keywords = readStringList(ctx, "keywords", 6);
  const category = readText(ctx, "category");
  return (
    <div className="mt-2 space-y-1 text-xs text-muted-foreground">
      <p>
        Porte: {prof.business_size ?? "—"} · Tipo: {prof.business_type ?? "—"} · Nicho:{" "}
        {prof.niche ?? "—"}
      </p>
      {social && (
        <p>
          Instagram:{" "}
          <a
            href={social.canonical_url ?? `https://www.instagram.com/${social.handle}/`}
            target="_blank"
            rel="noreferrer noopener"
            className="underline underline-offset-2"
          >
            @{social.handle}
          </a>
          {category ? ` · ${category}` : ""}
          {keywords.length ? ` · ${keywords.join(", ")}` : ""}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- PinsDialog
function PinsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [search, setSearch] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const q = useParticipantPins(
    { eventId: EVENT_ID, search: search.trim() || undefined, onlyMissing, limit: 50 },
    open,
  );
  const setPin = useSetParticipantPin(EVENT_ID);
  const clearPin = useClearParticipantPin(EVENT_ID);

  useEffect(() => {
    if (!open) {
      setDrafts({});
      setSearch("");
      setOnlyMissing(true);
    }
  }, [open]);

  async function handleSave(item: PinItem) {
    const parsed = pinCodeSchema.safeParse(drafts[item.id] ?? item.pin_code ?? "");
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Identificação inválida.");
      return;
    }
    try {
      const res = await setPin.mutateAsync({ profileId: item.id, pinCode: parsed.data });
      toast.success(res.changed ? "Pin registrado." : "Pin já estava assim.");
      setDrafts((d) => ({ ...d, [item.id]: parsed.data }));
    } catch (err) {
      toast.error(translateOperationalError(err));
    }
  }

  async function handleClear(item: PinItem) {
    try {
      await clearPin.mutateAsync({ profileId: item.id });
      toast.success("Pin removido do participante.");
      setDrafts((d) => ({ ...d, [item.id]: "" }));
    } catch (err) {
      toast.error(translateOperationalError(err));
    }
  }

  const items = q.data?.items ?? [];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Pins do mapa físico</DialogTitle>
          <DialogDescription>
            Marque quem já recebeu e colocou o pin no mapa da SudoExpo. A identificação do pin é
            opcional para a pessoa, mas precisa ser única no evento.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Buscar por nome, empresa ou pin"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={onlyMissing}
              onCheckedChange={(v) => setOnlyMissing(v === true)}
            />
            Somente sem pin
          </label>
        </div>

        <p className="text-xs text-muted-foreground">
          {q.data ? `${q.data.pins_placed} com pin · ${q.data.pins_missing} sem pin` : "Carregando…"}
        </p>

        {q.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nenhum participante encontrado com esses filtros.
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <li key={item.id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.company ?? "—"} · {item.city ?? "—"}
                    </p>
                  </div>
                  {item.pin_placed_at ? (
                    <Badge variant="outline" className="text-xs">
                      <MapPin className="mr-1 h-3 w-3" /> Pin colocado
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs">
                      Sem pin
                    </Badge>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Input
                    className="h-9 max-w-[200px]"
                    maxLength={24}
                    placeholder="Identificação do pin"
                    value={drafts[item.id] ?? item.pin_code ?? ""}
                    onChange={(e) => setDrafts((d) => ({ ...d, [item.id]: e.target.value }))}
                  />
                  <Button
                    size="sm"
                    onClick={() => handleSave(item)}
                    disabled={setPin.isPending || clearPin.isPending}
                  >
                    Salvar pin
                  </Button>
                  {item.pin_placed_at && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleClear(item)}
                      disabled={setPin.isPending || clearPin.isPending}
                    >
                      Remover
                    </Button>
                  )}
                  {item.pin_placed_by_email && (
                    <span className="text-xs text-muted-foreground">
                      por {item.pin_placed_by_email}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- Reveal
function RevealContactDialog({
  target,
  isAdmin,
  onClose,
}: {
  target: QueueItem | null;
  isAdmin: boolean;
  onClose: () => void;
}) {
  const reveal = useRevealStaffContact();
  const needsOverride = target !== null && !canRevealContact(target.status) && isAdmin;
  const [reason, setReason] = useState("");

  useEffect(() => {
    // Ao abrir/fechar, limpa segredos e input.
    reveal.reset();
    setReason("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.id]);

  async function handleReveal() {
    if (!target) return;
    let overrideReason: string | undefined;
    if (needsOverride) {
      const parsed = adminRevealOverrideSchema.safeParse(reason);
      if (!parsed.success) {
        toast.error(parsed.error.issues[0]?.message ?? "Justificativa inválida.");
        return;
      }
      overrideReason = parsed.data;
    }
    try {
      await reveal.mutateAsync({
        matchId: target.match_id,
        overrideReason,
      });
    } catch (err) {
      toast.error(translateStaffRevealError(err));
    }
  }

  function handleClose() {
    reveal.reset();
    setReason("");
    onClose();
  }

  return (
    <Dialog open={target !== null} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Contatos dos participantes</DialogTitle>
          <DialogDescription>
            Uso interno da equipe · esta consulta fica registrada no log de auditoria.
          </DialogDescription>
        </DialogHeader>

        {target && !reveal.data && (
          <div className="space-y-3">
            {needsOverride ? (
              <>
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                  <p className="flex items-center gap-1 font-medium">
                    <ShieldAlert className="h-4 w-4" /> Liberação administrativa
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    A conexão ainda não chegou em "Apresentados". Justifique (3 a 500 caracteres)
                    para liberar os contatos. Fica no log.
                  </p>
                </div>
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="Ex.: participante confirmou saída, precisamos entregar contato agora."
                />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Confirma revelar os contatos das duas partes?
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={handleClose} disabled={reveal.isPending}>
                Voltar
              </Button>
              <Button
                onClick={handleReveal}
                disabled={reveal.isPending || (needsOverride && reason.trim().length < 3)}
              >
                {reveal.isPending ? "Carregando…" : "Revelar contatos"}
              </Button>
            </div>
          </div>
        )}

        {reveal.isError && !reveal.data && (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            {translateStaffRevealError(reveal.error)}
          </p>
        )}

        {reveal.data && (
          <div className="space-y-3">
            {reveal.data.map((c) => (
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
                      ✉️{" "}
                      <a href={`mailto:${c.email}`} className="text-primary hover:underline">
                        {c.email}
                      </a>
                    </p>
                  )}
                </div>
              </div>
            ))}
            <div className="flex justify-end">
              <Button variant="ghost" onClick={handleClose}>
                Fechar
              </Button>
            </div>
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
