import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { zodValidator } from "@tanstack/zod-adapter";
import { ArrowLeft, CheckCircle2, Network, Search, ShieldAlert } from "lucide-react";

import { PageShell } from "@/components/brand/BrandShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { EVENT_ID } from "@/config/event";
import { useSession } from "@/features/auth/useSession";
import { useEventRole } from "@/features/staff/useEventRole";
import { useEventSegments } from "@/features/staff/useEventSegments";
import { useDebouncedValue } from "@/features/admin/useAdminParticipants";
import { useAdminMatches, useSetMatchReviewed } from "@/features/admin/useAdminMatches";
import { Checkbox } from "@/components/ui/checkbox";
import {
  CONNECTION_MODES,
  CONNECTION_MODE_TEXT,
  CONNECTION_STATUSES,
  DECISIONS,
  MATCHES_PAGE_SIZE,
  MATCH_KINDS,
  MATCH_LABELS,
  SCORE_SIDES,
  SCORE_SIDE_TEXT,
  SORTS,
  SORT_TEXT,
  hasActiveMatchFilters,
  matchesPageToOffset,
  matchesSearchSchema,
  matchesTotalPages,
  normalizeMatchesSearch,
} from "@/features/admin/matchesUrlState";
import { translateAdminMatchesError, type MatchRow } from "@/features/admin/matchesSchemas";
import { MatchDetailSheet } from "@/features/admin/MatchDetailSheet";
import {
  connectionStatusText,
  decisionText,
  kindText,
  sideLabelText,
} from "@/features/admin/matchesPresentation";
import { LABEL_TEXT, KIND_TEXT, DECISION_TEXT } from "@/features/matching/presentation";
import { CONNECTION_STATUS_LABEL } from "@/features/connections/domain";
import type { ConnectionStatus, Decision, MatchKind, MatchLabel } from "@/lib/types";

export const Route = createFileRoute("/admin_/matches")({
  validateSearch: zodValidator(matchesSearchSchema),
  head: () => ({
    meta: [
      { title: "Auditoria de matches — Administração Matchmaker SudoExpo" },
      {
        name: "description",
        content:
          "Ferramenta administrativa somente leitura para auditar scores, motivos e qualidade do matcher do Matchmaker SudoExpo.",
      },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: MatchesPage,
});

function MatchesPage() {
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

  return <MatchesBoard />;
}

/**
 * IMPL 15 — o card mantém toda a inteligência A/B existente e ganha apenas um
 * check de GOVERNANÇA ("match revisado pelo admin"). O check vive FORA do
 * botão que abre o detalhe, então clicar nele nunca abre o MatchDetailSheet.
 */
function MatchCardRow({
  m,
  onOpen,
  onToggleReviewed,
  pending,
}: {
  m: MatchRow;
  onOpen: (id: string) => void;
  onToggleReviewed: (id: string, reviewed: boolean) => void;
  pending: boolean;
}) {
  const gap = m.score_gap;
  return (
    <li className={m.reviewed ? "rounded-lg ring-1 ring-primary/30" : undefined}>
      <button
        type="button"
        onClick={() => onOpen(m.id)}
        className="w-full rounded-lg border p-3 text-left transition hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Abrir auditoria do match entre ${m.a_name} e ${m.b_name}`}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Lado A</p>
            <p className="font-medium">{m.a_name}</p>
            <p className="text-xs text-muted-foreground">
              {m.a_company || "—"} · {m.a_segment_label ?? "—"}
            </p>
            <div className="mt-1 flex flex-wrap gap-1">
              <Badge>Score {m.score_for_a}</Badge>
              <Badge variant="secondary">{sideLabelText(m.label_a, m.score_for_a)}</Badge>
              <Badge variant="outline">{decisionText(m.decision_a)}</Badge>
            </div>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Lado B</p>
            <p className="font-medium">{m.b_name}</p>
            <p className="text-xs text-muted-foreground">
              {m.b_company || "—"} · {m.b_segment_label ?? "—"}
            </p>
            <div className="mt-1 flex flex-wrap gap-1">
              <Badge>Score {m.score_for_b}</Badge>
              <Badge variant="secondary">{sideLabelText(m.label_b, m.score_for_b)}</Badge>
              <Badge variant="outline">{decisionText(m.decision_b)}</Badge>
            </div>
          </div>
        </div>
        <p className="mt-2 text-sm" data-testid="match-why">
          <span className="text-primary">» </span>
          {m.briefing_summary?.trim()
            ? m.briefing_summary
            : buildCardSummary(m.why_a, m.why_b, {
                a: shortName(m.a_name),
                b: shortName(m.b_name),
              })}
        </p>
        <div className="mt-1 flex flex-wrap gap-1 text-xs" data-testid="match-signals">
          {buildSignals(m.why_a, m.why_b).map((s) => (
            <Badge key={s} variant="secondary">
              {s}
            </Badge>
          ))}
          {m.has_briefing ? (
            <Badge variant={m.briefing_stale ? "destructive" : "default"}>
              {m.briefing_stale ? "Briefing desatualizado" : "Briefing com IA"}
            </Badge>
          ) : null}
        </div>
        <div className="mt-2 flex flex-wrap gap-1 text-xs">

          <Badge variant="outline">{kindText(m.kind)}</Badge>
          <Badge variant="outline">{m.algorithm_version}</Badge>
          {gap >= 30 ? (
            <Badge variant="destructive" data-testid="asymmetry-badge">
              Assimetria {gap}
            </Badge>
          ) : (
            <Badge variant="outline">Assimetria {gap}</Badge>
          )}
          {m.mutual ? <Badge>Interesse mútuo</Badge> : null}
          {m.connection_status ? (
            <Badge variant="secondary">{connectionStatusText(m.connection_status)}</Badge>
          ) : (
            <Badge variant="outline">Sem conexão</Badge>
          )}
        </div>
      </button>

      <div
        className="mt-1 flex items-center gap-2 rounded-md px-3 pb-1 text-xs"
        data-testid="match-review-control"
      >
        <Checkbox
          id={`review-${m.id}`}
          checked={m.reviewed}
          disabled={pending}
          onCheckedChange={(v) => onToggleReviewed(m.id, v === true)}
          aria-label={`Marcar match entre ${m.a_name} e ${m.b_name} como revisado`}
        />
        <label
          htmlFor={`review-${m.id}`}
          className="cursor-pointer select-none text-muted-foreground"
        >
          Match revisado
        </label>
        {m.reviewed ? (
          <span className="inline-flex items-center gap-1 text-primary" data-testid="reviewed-flag">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Revisado
          </span>
        ) : null}
      </div>
    </li>
  );
}

function MatchesBoard() {
  const navigate = useNavigate({ from: "/admin/matches" });
  const rawSearch = Route.useSearch();
  const search = normalizeMatchesSearch(rawSearch);

  const [qInput, setQInput] = useState(search.q);
  const debouncedQ = useDebouncedValue(qInput, 350);

  useEffect(() => {
    if (debouncedQ === search.q) return;
    navigate({ search: (prev) => ({ ...prev, q: debouncedQ, page: 1 }), replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ]);

  const segmentsQuery = useEventSegments(EVENT_ID);
  const listQuery = useAdminMatches(
    EVENT_ID,
    {
      q: search.q,
      kinds: search.kinds,
      labels: search.labels,
      side: search.side,
      min: search.min,
      max: search.max,
      segments: search.segments,
      decisions: search.decisions,
      mutual: search.mutual,
      connection: search.connection,
      connectionStatuses: search.connectionStatuses,
      versions: search.versions,
      sort: search.sort,
      reviewed: search.reviewed,
      offset: matchesPageToOffset(search.page),
      limit: MATCHES_PAGE_SIZE,
    },
    true,
  );

  const data = listQuery.data;
  const pages = matchesTotalPages(data?.total ?? 0);
  const reviewMutation = useSetMatchReviewed(EVENT_ID);
  const pendingReviewId =
    reviewMutation.isPending ? (reviewMutation.variables?.matchId ?? null) : null;

  const setParam = (patch: Record<string, unknown>) =>
    navigate({ search: (prev) => ({ ...prev, ...patch, page: 1 }), replace: true });

  const single = (v: string) => (v === "all" ? "" : v);

  return (
    <PageShell>
      <section className="mx-auto max-w-5xl px-4 py-8">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-primary">Administração</p>
            <h1 className="font-display text-2xl font-bold md:text-3xl">Auditoria de matches</h1>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Somente leitura: confira score e classificação de cada lado, motivos do matcher e
              status da conexão. Nada aqui edita o algoritmo nem revela contatos.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/admin">
              <ArrowLeft className="mr-1 h-4 w-4" /> Voltar ao admin
            </Link>
          </Button>
        </header>

        <Card className="mb-4 space-y-3 p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="sm:col-span-2 lg:col-span-1">
              <Label htmlFor="q" className="text-xs">
                Buscar participante ou empresa
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
              <Label htmlFor="kind" className="text-xs">
                Tipo de match
              </Label>
              <Select
                value={search.kinds[0] ?? "all"}
                onValueChange={(v) => setParam({ kind: single(v) })}
              >
                <SelectTrigger id="kind">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {MATCH_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {KIND_TEXT[k as MatchKind]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="rev" className="text-xs">
                Revisão do admin
              </Label>
              <Select
                value={search.reviewed === null ? "all" : search.reviewed ? "1" : "0"}
                onValueChange={(v) => setParam({ rev: v === "all" ? "" : v })}
              >
                <SelectTrigger id="rev">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="1">Revisados</SelectItem>
                  <SelectItem value="0">Não revisados</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="seg" className="text-xs">
                Segmento (qualquer lado)
              </Label>
              <Select
                value={search.segments[0] ?? "all"}
                onValueChange={(v) => setParam({ seg: single(v) })}
              >
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
              <Label htmlFor="label" className="text-xs">
                Classificação
              </Label>
              <Select
                value={search.labels[0] ?? "all"}
                onValueChange={(v) => setParam({ label: single(v) })}
              >
                <SelectTrigger id="label">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {MATCH_LABELS.map((l) => (
                    <SelectItem key={l} value={l}>
                      {LABEL_TEXT[l as MatchLabel]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="side" className="text-xs">
                Perspectiva do score/classificação
              </Label>
              <Select value={search.side} onValueChange={(v) => setParam({ side: v })}>
                <SelectTrigger id="side">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCORE_SIDES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {SCORE_SIDE_TEXT[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="min" className="text-xs">
                  Score mín.
                </Label>
                <Input
                  id="min"
                  inputMode="numeric"
                  value={rawSearch.min}
                  onChange={(e) => setParam({ min: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="max" className="text-xs">
                  Score máx.
                </Label>
                <Input
                  id="max"
                  inputMode="numeric"
                  value={rawSearch.max}
                  onChange={(e) => setParam({ max: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="dec" className="text-xs">
                Decisão (qualquer lado)
              </Label>
              <Select
                value={search.decisions[0] ?? "all"}
                onValueChange={(v) => setParam({ dec: single(v) })}
              >
                <SelectTrigger id="dec">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {DECISIONS.map((d) => (
                    <SelectItem key={d} value={d}>
                      {DECISION_TEXT[d as Decision]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="conn" className="text-xs">
                Conexão
              </Label>
              <Select value={search.connection} onValueChange={(v) => setParam({ conn: v })}>
                <SelectTrigger id="conn">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONNECTION_MODES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {CONNECTION_MODE_TEXT[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="cstatus" className="text-xs">
                Status da conexão
              </Label>
              <Select
                value={search.connectionStatuses[0] ?? "all"}
                onValueChange={(v) => setParam({ cstatus: single(v) })}
              >
                <SelectTrigger id="cstatus">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {CONNECTION_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {CONNECTION_STATUS_LABEL[s as ConnectionStatus]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="ver" className="text-xs">
                Versão do algoritmo
              </Label>
              <Input
                id="ver"
                placeholder="Ex.: v2.3"
                value={rawSearch.ver}
                onChange={(e) => setParam({ ver: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="sort" className="text-xs">
                Ordenar por
              </Label>
              <Select value={search.sort} onValueChange={(v) => setParam({ sort: v })}>
                <SelectTrigger id="sort">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORTS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {SORT_TEXT[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Switch
                id="mutual"
                checked={search.mutual}
                onCheckedChange={(v) => setParam({ mutual: v ? "1" : "" })}
              />
              <Label htmlFor="mutual" className="text-xs">
                Somente interesse mútuo
              </Label>
            </div>
            {hasActiveMatchFilters(search) ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  navigate({
                    search: (prev) => ({
                      ...prev,
                      q: "",
                      kind: "",
                      label: "",
                      side: "any",
                      min: "",
                      max: "",
                      seg: "",
                      dec: "",
                      mutual: "",
                      conn: "any",
                      cstatus: "",
                      ver: "",
                      page: 1,
                    }),
                    replace: true,
                  })
                }
              >
                Limpar filtros
              </Button>
            ) : null}
          </div>
        </Card>

        {listQuery.isLoading ? (
          <div className="space-y-2" data-testid="matches-loading">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : listQuery.isError ? (
          <Card className="p-6 text-sm text-destructive" role="alert">
            {translateAdminMatchesError(listQuery.error)}
          </Card>
        ) : (data?.items.length ?? 0) === 0 ? (
          <Card className="p-8 text-center" data-testid="matches-empty">
            <Network className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">
              Nenhum match encontrado com estes filtros.
            </p>
          </Card>
        ) : (
          <>
            <p className="mb-2 text-xs text-muted-foreground">
              {data?.total} match(es) · página {search.page} de {pages}
            </p>
            <ul className="space-y-3">
              {(data?.items ?? []).map((m) => (
                <MatchCardRow
                  key={m.id}
                  m={m}
                  onOpen={(id) => navigate({ search: (prev) => ({ ...prev, m: id }) })}
                  onToggleReviewed={(id, reviewed) =>
                    reviewMutation.mutate({ matchId: id, reviewed })
                  }
                  pending={pendingReviewId === m.id}
                />
              ))}
            </ul>
            <div className="mt-4 flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                disabled={search.page <= 1}
                onClick={() => navigate({ search: (prev) => ({ ...prev, page: search.page - 1 }) })}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={search.page >= pages}
                onClick={() => navigate({ search: (prev) => ({ ...prev, page: search.page + 1 }) })}
              >
                Próxima
              </Button>
            </div>
          </>
        )}
      </section>

      <MatchDetailSheet
        matchId={search.selected}
        onClose={() => navigate({ search: (prev) => ({ ...prev, m: "" }), replace: true })}
      />
    </PageShell>
  );
}
