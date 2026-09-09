import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { supabase } from "@/integrations/supabase/client";

const statusSchema = z.object({
  event_id: z.string(),
  taxonomy_revision: z.coerce.number().int().nonnegative(),
  applied_taxonomy_revision: z.coerce.number().int().nonnegative(),
  dirty: z.boolean(),
  last_rebuilt_at: z.string().nullable(),
  last_rebuilt_profiles: z.coerce.number().int().nonnegative(),
  eligible_profiles: z.coerce.number().int().nonnegative(),
  offers_total: z.coerce.number().int().nonnegative(),
  offers_canonical: z.coerce.number().int().nonnegative(),
  offers_coverage_pct: z.coerce.number().nonnegative(),
  needs_total: z.coerce.number().int().nonnegative(),
  needs_canonical: z.coerce.number().int().nonnegative(),
  needs_coverage_pct: z.coerce.number().nonnegative(),
  active_items: z.coerce.number().int().nonnegative(),
  items_with_synonyms: z.coerce.number().int().nonnegative(),
  active_relations: z.coerce.number().int().nonnegative(),
  effective_relations: z.coerce.number().int().nonnegative(),
});

type MatcherTaxonomyStatus = z.infer<typeof statusSchema>;

/**
 * As RPCs abaixo são adicionadas pela migration de governança do matcher desta branch.
 * O arquivo gerado `supabase/types.ts` só passa a conhecê-las depois que o schema remoto
 * for regenerado; este adaptador local evita editar manualmente código gerado.
 */
type RpcResult = { data: unknown; error: { message?: string } | null };
type RuntimeRpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<RpcResult>;
};
const runtimeRpc = supabase as unknown as RuntimeRpcClient;

const statusKey = (eventId: string) => ["admin", "matcher-taxonomy-status", eventId] as const;

function formatDate(value: string | null): string {
  if (!value) return "nunca";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("pt-BR");
}

async function fetchStatus(eventId: string): Promise<MatcherTaxonomyStatus> {
  const { data, error } = await runtimeRpc.rpc("admin_get_matcher_taxonomy_status", {
    _event_id: eventId,
  });
  if (error) throw new Error(error.message || "matcher_status_failed");
  return statusSchema.parse(data);
}

export function MatcherTaxonomyStatusCard({ eventId }: { eventId: string }) {
  const qc = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const status = useQuery({
    queryKey: statusKey(eventId),
    queryFn: () => fetchStatus(eventId),
    staleTime: 10_000,
  });

  const rebuild = useMutation({
    mutationFn: async () => {
      const { data, error } = await runtimeRpc.rpc("admin_recompute_event_matches", {
        _event_id: eventId,
      });
      if (error) throw new Error(error.message || "matcher_rebuild_failed");
      return data as Record<string, unknown>;
    },
    onSuccess: async (data) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: statusKey(eventId) }),
        qc.invalidateQueries({ queryKey: ["admin", "matches", eventId] }),
        qc.invalidateQueries({ queryKey: ["admin", "taxonomy", eventId] }),
      ]);
      const count = Number(data.profiles_rebuilt ?? 0);
      toast.success(`Matcher recalculado para ${count} perfil(is).`);
      setConfirmOpen(false);
    },
    onError: () => toast.error("Não foi possível recalcular os matches deste evento."),
  });

  if (status.isLoading) {
    return (
      <Card className="mb-4 p-4 text-sm text-muted-foreground">
        Verificando saúde do matcher e cobertura da taxonomia…
      </Card>
    );
  }

  if (status.isError || !status.data) {
    return (
      <Card className="mb-4 border-destructive/40 p-4 text-sm text-destructive">
        Não foi possível consultar o estado do matcher. Verifique se a migration de governança da
        taxonomia já foi aplicada neste ambiente.
      </Card>
    );
  }

  const s = status.data;
  return (
    <>
      <Card className="mb-4 p-4" data-testid="matcher-taxonomy-status">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              {s.dirty ? (
                <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />
              )}
              <h2 className="font-display text-base font-semibold">Saúde do matcher</h2>
              <Badge variant={s.dirty ? "destructive" : "secondary"}>
                {s.dirty ? "rebuild necessário" : "taxonomia aplicada"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Revisão taxonômica {s.taxonomy_revision} · aplicada no evento {s.applied_taxonomy_revision}
              {" · "}último rebuild: {formatDate(s.last_rebuilt_at)}.
            </p>
          </div>
          <Button
            size="sm"
            variant={s.dirty ? "default" : "outline"}
            onClick={() => setConfirmOpen(true)}
            disabled={rebuild.isPending}
          >
            <RefreshCw className={`mr-1 h-4 w-4 ${rebuild.isPending ? "animate-spin" : ""}`} />
            {rebuild.isPending ? "Recalculando…" : "Recalcular matches do evento"}
          </Button>
        </div>

        {s.dirty ? (
          <p className="mt-3 rounded-md bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
            A taxonomia mudou desde o último rebuild completo. Matches persistidos podem refletir
            regras, sinônimos ou relações anteriores até a recomputação deste evento.
          </p>
        ) : null}

        <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-md border p-2">
            <p className="text-muted-foreground">Cobertura de ofertas</p>
            <p className="font-medium">
              {s.offers_coverage_pct}% · {s.offers_canonical}/{s.offers_total} canônicas
            </p>
          </div>
          <div className="rounded-md border p-2">
            <p className="text-muted-foreground">Cobertura de necessidades</p>
            <p className="font-medium">
              {s.needs_coverage_pct}% · {s.needs_canonical}/{s.needs_total} canônicas
            </p>
          </div>
          <div className="rounded-md border p-2">
            <p className="text-muted-foreground">Relações complementares</p>
            <p className="font-medium">
              {s.effective_relations} efetivas · {s.active_relations} ativas
            </p>
          </div>
          <div className="rounded-md border p-2">
            <p className="text-muted-foreground">Sinônimos / perfis</p>
            <p className="font-medium">
              {s.items_with_synonyms}/{s.active_items} itens · {s.eligible_profiles} perfis elegíveis
            </p>
          </div>
        </div>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Recalcular todos os matches deste evento?</AlertDialogTitle>
            <AlertDialogDescription>
              O banco vai reaplicar o matcher v2.4 a {s.eligible_profiles} perfil(is) elegível(is).
              Conexões já formalizadas continuam preservadas como histórico. Em eventos grandes,
              esta operação pode levar alguns instantes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={rebuild.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={rebuild.isPending}
              onClick={(event) => {
                event.preventDefault();
                rebuild.mutate();
              }}
            >
              {rebuild.isPending ? "Recalculando…" : "Recalcular agora"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
