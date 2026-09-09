import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { zodValidator } from "@tanstack/zod-adapter";
import { ArrowLeft, Search, ShieldAlert, Sparkles, TestTube2, Trash2, Users, X } from "lucide-react";
import { toast } from "sonner";

import { PageShell } from "@/components/brand/BrandShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { EVENT_ID } from "@/config/event";
import { AdminEventProvider, useAdminEvent } from "@/features/admin/AdminEventContext";
import { EventSelector } from "@/features/admin/EventSelector";
import { useStaffCheckinMutation } from "@/features/admin/useAdminEvents";
import { useSession } from "@/features/auth/useSession";
import { useEventRole } from "@/features/staff/useEventRole";
import { useEventSegments } from "@/features/staff/useEventSegments";
import {
  useAdminParticipants,
  useAdminDeleteParticipantMutation,
  useDebouncedValue,
} from "@/features/admin/useAdminParticipants";
import {
  PARTICIPANTS_PAGE_SIZE,
  normalizeParticipantesSearch,
  pageToOffset,
  participantesSearchSchema,
  totalPages,
} from "@/features/admin/participantsUrlState";
import { translateAdminParticipantsError } from "@/features/admin/participantsSchemas";
import { ParticipantDetailSheet } from "@/features/admin/ParticipantDetailSheet";

export const Route = createFileRoute("/admin_/participantes")({
  validateSearch: zodValidator(participantesSearchSchema),
  head: () => ({
    meta: [
      { title: "Participantes — Administração Matchmaker SudoExpo" },
      {
        name: "description",
        content:
          "Governança dos participantes do Matchmaker SudoExpo: busca, filtros e detalhe operacional.",
      },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: ParticipantesPage,
});

function ParticipantesPage() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useSession();
  const roleQuery = useEventRole(EVENT_ID);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) navigate({ to: "/equipe" });
  }, [isLoading, isAuthenticated, navigate]);

  if (isLoading || !isAuthenticated || roleQuery.isLoading) {
    return (
      <PageShell>
        <div className="mx-auto max-w-5xl px-4 py-12">
          <Skeleton className="h-40 w-full" />
        </div>
      </PageShell>
    );
  }

  if (roleQuery.data !== "admin") {
    return (
      <PageShell>
        <section className="mx-auto max-w-md px-4 py-12">
          <Card className="p-6 text-center">
            <ShieldAlert className="mx-auto h-10 w-10 text-destructive" />
            <h1 className="mt-3 font-display text-xl font-semibold">Acesso negado</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Apenas administradores do evento acessam esta página.
            </p>
            <Button asChild variant="outline" className="mt-4">
              <Link to="/equipe">Voltar</Link>
            </Button>
          </Card>
        </section>
      </PageShell>
    );
  }

  return (
    <AdminEventProvider>
      <ParticipantsBoard />
    </AdminEventProvider>
  );
}

function ParticipantsBoard() {
  const navigate = useNavigate({ from: "/admin/participantes" });
  const rawSearch = Route.useSearch();
  const search = normalizeParticipantesSearch(rawSearch);

  const { selectedEventId } = useAdminEvent();
  const staffCheckin = useStaffCheckinMutation(EVENT_ID);

  const [participantToDelete, setParticipantToDelete] = useState<{ id: string; name: string } | null>(null);
  const deleteMutation = useAdminDeleteParticipantMutation();

  const [qInput, setQInput] = useState(search.q);
  const debouncedQ = useDebouncedValue(qInput, 300);

  // Busca debounced entra na URL (estado compartilhável) sem empilhar histórico.
  useEffect(() => {
    navigate({
      search: (prev) => ({ ...prev, q: debouncedQ, page: 1 }),
      replace: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ]);

  const segmentsQuery = useEventSegments(selectedEventId);
  const listQuery = useAdminParticipants(
    selectedEventId,
    {
      q: search.q,
      segments: search.segments,
      city: search.city,
      offset: pageToOffset(search.page),
      limit: PARTICIPANTS_PAGE_SIZE,
    },
    true,
  );

  const data = listQuery.data;
  const pages = totalPages(data?.total ?? 0);
  const segmentValue = search.segments[0] ?? "all";

  function setSegment(v: string) {
    navigate({
      search: (prev) => ({ ...prev, segments: v === "all" ? "" : v, page: 1 }),
      replace: true,
    });
  }
  function setCity(v: string) {
    navigate({ search: (prev) => ({ ...prev, city: v, page: 1 }), replace: true });
  }
  function goPage(p: number) {
    navigate({ search: (prev) => ({ ...prev, page: p }) });
  }
  function openDetail(id: string) {
    navigate({ search: (prev) => ({ ...prev, p: id }) });
  }
  function closeDetail() {
    navigate({ search: (prev) => ({ ...prev, p: "" }), replace: true });
  }

  const hasFilters = search.q.length > 0 || search.segments.length > 0 || search.city.length > 0;

  return (
    <PageShell>
      <section className="mx-auto max-w-5xl px-4 py-8">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-primary">Administração</p>
            <h1 className="font-display text-2xl font-bold md:text-3xl">Participantes</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              {data?.total ?? 0} participante{(data?.total ?? 0) === 1 ? "" : "s"} cadastrado
              {(data?.total ?? 0) === 1 ? "" : "s"}.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <EventSelector />
            <Button
              asChild
              variant="outline"
              size="sm"
              className="border-amber-500/40 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300"
            >
              <a
                href="/participar?event=sandbox-sudoexpo"
                target="_blank"
                rel="noopener noreferrer"
                data-testid="btn-admin-test-sandbox"
                className="flex items-center gap-1.5 font-medium"
              >
                <TestTube2 className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <span>Testar Cadastro (Sandbox)</span>
              </a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/admin">
                <ArrowLeft className="mr-1 h-4 w-4" /> Voltar ao admin
              </Link>
            </Button>
          </div>
        </header>

        <Card className="mb-4 p-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_180px_180px]">
            <div>
              <Label htmlFor="q" className="text-xs">
                Buscar por nome ou empresa
              </Label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="q"
                  className="pl-8"
                  placeholder="Ex.: padaria"
                  value={qInput}
                  onChange={(e) => setQInput(e.target.value)}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="seg" className="text-xs">
                Segmento
              </Label>
              <Select value={segmentValue} onValueChange={setSegment}>
                <SelectTrigger id="seg">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {(segmentsQuery.data ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.emoji} {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="city" className="text-xs">
                Cidade
              </Label>
              <Input
                id="city"
                placeholder="Rio Verde"
                defaultValue={search.city}
                onBlur={(e) => setCity(e.target.value.trim())}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setCity(e.currentTarget.value.trim());
                }}
              />
            </div>
          </div>
          {hasFilters && (
            <div className="mt-3 flex items-center gap-2">
              <Badge variant="secondary">{data?.total ?? 0} resultado(s)</Badge>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setQInput("");
                  navigate({
                    search: () => ({ q: "", segments: "", city: "", page: 1, p: "" }),
                    replace: true,
                  });
                }}
              >
                <X className="mr-1 h-4 w-4" /> Limpar filtros
              </Button>
            </div>
          )}
        </Card>

        {listQuery.isLoading ? (
          <div className="space-y-2" data-testid="list-loading">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : listQuery.isError ? (
          <Card className="p-6 text-sm text-destructive">
            {translateAdminParticipantsError(listQuery.error)}
          </Card>
        ) : (data?.items.length ?? 0) === 0 ? (
          <Card className="p-8 text-center">
            <Users className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">
              {hasFilters
                ? "Nenhum participante encontrado com estes filtros."
                : "Nenhum participante cadastrado ainda."}
            </p>
          </Card>
        ) : (
          <ul className="space-y-2" aria-label="Lista de participantes">
            {(data?.items ?? []).map((p) => (
              <li key={p.id}>
                <Card
                  role="button"
                  tabIndex={0}
                  onClick={() => openDetail(p.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openDetail(p.id);
                    }
                  }}
                  className="cursor-pointer p-4 transition hover:border-primary/50"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{p.name}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {p.company || "—"} · {p.city || "—"}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <Badge variant="secondary">
                          {p.segment_emoji ? `${p.segment_emoji} ` : ""}
                          {p.segment_label ?? p.segment_id ?? "sem segmento"}
                        </Badge>
                        <Badge variant="outline">
                          cadastro {new Date(p.created_at).toLocaleDateString("pt-BR")}
                        </Badge>
                      </div>
                    </div>
                    <dl className="grid grid-cols-4 gap-3 text-center text-xs">
                      <div>
                        <dt className="text-muted-foreground">Ofertas</dt>
                        <dd className="font-semibold">{p.offers_count}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Precisa</dt>
                        <dd className="font-semibold">{p.needs_count}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Matches</dt>
                        <dd className="font-semibold">{p.matches_count}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Conexões</dt>
                        <dd className="font-semibold">{p.connections_count}</dd>
                      </div>
                    </dl>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-2">
                    {selectedEventId !== EVENT_ID ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-7 text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          staffCheckin.mutate(p.id, {
                            onSuccess: () =>
                              toast.success(`Check-in de ${p.name} na SudoExpo 2026 realizado com sucesso!`),
                            onError: () => toast.error("Não foi possível realizar o check-in do participante."),
                          });
                        }}
                        disabled={staffCheckin.isPending}
                      >
                        <Sparkles className="mr-1 h-3 w-3 text-primary" />
                        Check-in na SudoExpo 2026
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground font-mono">
                        {p.city || "SudoExpo 2026"}
                      </span>
                    )}

                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        setParticipantToDelete({ id: p.id, name: p.name });
                      }}
                      data-testid="btn-delete-participant"
                    >
                      <Trash2 className="mr-1 h-3 w-3" />
                      Excluir
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}

        {(data?.total ?? 0) > PARTICIPANTS_PAGE_SIZE && (
          <nav aria-label="Paginação" className="mt-4 flex items-center justify-between gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={search.page <= 1}
              onClick={() => goPage(search.page - 1)}
            >
              Anterior
            </Button>
            <p className="text-xs text-muted-foreground">
              Página {search.page} de {pages} · {data?.total ?? 0} participantes
            </p>
            <Button
              variant="outline"
              size="sm"
              disabled={search.page >= pages}
              onClick={() => goPage(search.page + 1)}
            >
              Próxima
            </Button>
          </nav>
        )}
      </section>

      <AlertDialog
        open={participantToDelete !== null}
        onOpenChange={(open) => !open && setParticipantToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir participante / Resetar cadastro?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o cadastro de <strong>{participantToDelete?.name}</strong>?
              Esta ação apagará o perfil, ofertas, necessidades e liberará o WhatsApp imediatamente para novos cadastros e testes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (!participantToDelete) return;
                deleteMutation.mutate(participantToDelete.id, {
                  onSuccess: () => {
                    toast.success(`Cadastro de ${participantToDelete.name} excluído com sucesso! WhatsApp liberado.`);
                    if (search.selected === participantToDelete.id) {
                      closeDetail();
                    }
                    setParticipantToDelete(null);
                  },
                  onError: (err) => {
                    toast.error("Erro ao excluir participante: " + (err as Error).message);
                  },
                });
              }}
            >
              {deleteMutation.isPending ? "Excluindo…" : "Sim, excluir cadastro"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ParticipantDetailSheet profileId={search.selected} onClose={closeDetail} />
    </PageShell>
  );
}
