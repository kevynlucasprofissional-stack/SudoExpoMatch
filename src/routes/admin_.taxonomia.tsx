import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { zodValidator } from "@tanstack/zod-adapter";
import { Plus, Search, ShieldAlert, Tags } from "lucide-react";
import { toast } from "sonner";

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
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { EVENT_ID } from "@/config/event";
import { AdminEventProvider, useAdminEvent } from "@/features/admin/AdminEventContext";
import { EventSelector } from "@/features/admin/EventSelector";
import { useSession } from "@/features/auth/useSession";
import { useEventRole } from "@/features/staff/useEventRole";
import { useEventSegments } from "@/features/staff/useEventSegments";
import { useDebouncedValue } from "@/features/admin/useAdminParticipants";
import { useAdminTaxonomy, useCreateTaxonomyItem } from "@/features/admin/useAdminTaxonomy";
import { TaxonomyItemForm } from "@/features/admin/TaxonomyItemForm";
import { TaxonomyItemSheet } from "@/features/admin/TaxonomyItemSheet";
import {
  EMPTY_TAXONOMY_SEARCH,
  TAXONOMY_KINDS,
  TAXONOMY_KIND_TEXT,
  TAXONOMY_PAGE_SIZE,
  TAXONOMY_STATUS,
  TAXONOMY_STATUS_TEXT,
  hasActiveTaxonomyFilters,
  kindText,
  normalizeTaxonomySearch,
  taxonomyPageToOffset,
  taxonomySearchSchema,
  taxonomyTotalPages,
  translateTaxonomyError,
  usageTotal,
  type TaxonomyItemRow,
  type TaxonomyStatus,
} from "@/features/admin/taxonomySchemas";

export const Route = createFileRoute("/admin_/taxonomia")({
  validateSearch: zodValidator(taxonomySearchSchema),
  head: () => ({
    meta: [
      { title: "Taxonomia — Administração Matchmaker SudoExpo" },
      {
        name: "description",
        content:
          "Gestão auditada do catálogo de ofertas e necessidades usado pelo matching do Matchmaker SudoExpo.",
      },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: TaxonomyPage,
});

function TaxonomyPage() {
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
      <TaxonomyBoard />
    </AdminEventProvider>
  );
}

function TaxonomyRowCard({ row, onOpen }: { row: TaxonomyItemRow; onOpen: (id: string) => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(row.id)}
        className="w-full rounded-lg border p-3 text-left transition hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Abrir detalhe do item ${row.label}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-medium">{row.label}</p>
            <p className="text-xs text-muted-foreground">
              {row.slug} · {row.segment_label ?? row.segment_id ?? "sem segmento"}
            </p>
          </div>
          <div className="flex flex-wrap gap-1">
            <Badge variant="secondary">{kindText(row.kind)}</Badge>
            <Badge variant={row.active ? "default" : "outline"}>
              {row.active ? "Ativo" : "Inativo"}
            </Badge>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1 text-xs">
          <Badge variant="outline">{row.usage_offers_active} ofertas ativas</Badge>
          <Badge variant="outline">{row.usage_needs_active} necessidades ativas</Badge>
          <Badge variant="outline">
            {row.outgoing_relations_active + row.incoming_relations_active} relações ativas
          </Badge>
          <Badge variant="outline">{usageTotal(row)} usos no histórico</Badge>
        </div>
      </button>
    </li>
  );
}

function TaxonomyBoard() {
  const navigate = useNavigate({ from: "/admin/taxonomia" });
  const rawSearch = Route.useSearch();
  const search = normalizeTaxonomySearch(rawSearch);
  const { selectedEventId } = useAdminEvent();
  const segmentsQuery = useEventSegments(selectedEventId);
  const segments = segmentsQuery.data ?? [];

  const [qInput, setQInput] = useState(search.q);
  const debouncedQ = useDebouncedValue(qInput, 300);
  const [createOpen, setCreateOpen] = useState(false);
  const create = useCreateTaxonomyItem(selectedEventId);

  // A busca digitada vira estado de URL (auditoria compartilhável).
  useEffect(() => {
    if (debouncedQ === search.q) return;
    navigate({
      search: (prev) => ({ ...prev, q: debouncedQ, page: 1 }),
      replace: true,
    });
  }, [debouncedQ, search.q, navigate]);

  const listQuery = useAdminTaxonomy(
    selectedEventId,
    {
      q: search.q,
      segments: search.segments,
      kinds: search.kinds,
      status: search.status,
      offset: taxonomyPageToOffset(search.page),
    },
    true,
  );

  const total = listQuery.data?.total ?? 0;
  const totalPages = taxonomyTotalPages(total);
  const items = listQuery.data?.items ?? [];

  function setSearch(patch: Record<string, unknown>) {
    navigate({ search: (prev) => ({ ...prev, ...patch, page: 1 }) });
  }

  return (
    <PageShell>
      <section className="mx-auto max-w-5xl px-4 py-8">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-primary">Administração</p>
            <h1 className="font-display text-2xl font-bold md:text-3xl">Taxonomia</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Catálogo de ofertas e necessidades que alimenta o matching e a IA. Toda alteração é
              registrada em auditoria.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <EventSelector />
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1 h-4 w-4" /> Novo item
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/admin">Voltar à administração</Link>
            </Button>
          </div>
        </header>

        <Card className="mb-4 p-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="tax-search">Buscar</Label>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <Input
                  id="tax-search"
                  value={qInput}
                  onChange={(e) => setQInput(e.target.value)}
                  placeholder="Nome, apelido ou sinônimo"
                  className="pl-8"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tax-filter-segment">Segmento</Label>
              <Select
                value={search.segments[0] ?? "all"}
                onValueChange={(v) => setSearch({ seg: v === "all" ? "" : v })}
              >
                <SelectTrigger id="tax-filter-segment">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os segmentos</SelectItem>
                  {segments.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.emoji} {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tax-filter-kind">Tipo</Label>
              <Select
                value={search.kinds[0] ?? "all"}
                onValueChange={(v) => setSearch({ kind: v === "all" ? "" : v })}
              >
                <SelectTrigger id="tax-filter-kind">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os tipos</SelectItem>
                  {TAXONOMY_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {TAXONOMY_KIND_TEXT[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tax-filter-status">Status</Label>
              <Select
                value={search.status}
                onValueChange={(v) => setSearch({ status: v as TaxonomyStatus })}
              >
                <SelectTrigger id="tax-filter-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TAXONOMY_STATUS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {TAXONOMY_STATUS_TEXT[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {hasActiveTaxonomyFilters(search) ? (
            <div className="mt-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setQInput("");
                  navigate({ search: () => ({ ...EMPTY_TAXONOMY_SEARCH }) });
                }}
              >
                Limpar filtros
              </Button>
            </div>
          ) : null}
        </Card>

        <Card className="p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-lg font-semibold">
              <Tags className="mr-1 inline h-4 w-4" aria-hidden /> Itens
            </h2>
            <p className="text-xs text-muted-foreground">
              {total} item(ns) · página {search.page} de {totalPages}
            </p>
          </div>

          {listQuery.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : listQuery.isError ? (
            <p className="text-sm text-destructive">{translateTaxonomyError(listQuery.error)}</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum item encontrado com os filtros atuais.
            </p>
          ) : (
            <ul className="space-y-2">
              {items.map((row) => (
                <TaxonomyRowCard
                  key={row.id}
                  row={row}
                  onOpen={(id) => navigate({ search: (prev) => ({ ...prev, i: id }) })}
                />
              ))}
            </ul>
          )}

          {total > TAXONOMY_PAGE_SIZE ? (
            <div className="mt-4 flex items-center justify-between gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={search.page <= 1}
                onClick={() =>
                  navigate({ search: (prev) => ({ ...prev, page: Math.max(1, search.page - 1) }) })
                }
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={search.page >= totalPages}
                onClick={() =>
                  navigate({
                    search: (prev) => ({ ...prev, page: Math.min(totalPages, search.page + 1) }),
                  })
                }
              >
                Próxima
              </Button>
            </div>
          ) : null}
        </Card>
      </section>

      <TaxonomyItemSheet
        eventId={EVENT_ID}
        itemId={search.selected}
        segments={segments}
        onOpenChange={(open) => {
          if (!open) navigate({ search: (prev) => ({ ...prev, i: "" }) });
        }}
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo item de taxonomia</DialogTitle>
            <DialogDescription>
              O apelido (slug) é gerado automaticamente pelo servidor e permanece estável.
            </DialogDescription>
          </DialogHeader>
          <TaxonomyItemForm
            segments={segments}
            submitLabel="Criar item"
            pending={create.isPending}
            onCancel={() => setCreateOpen(false)}
            onSubmit={async (values) => {
              try {
                const id = await create.mutateAsync(values);
                toast.success("Item criado.");
                setCreateOpen(false);
                navigate({ search: (prev) => ({ ...prev, i: id }) });
              } catch (err) {
                toast.error(translateTaxonomyError(err));
              }
            }}
          />
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
