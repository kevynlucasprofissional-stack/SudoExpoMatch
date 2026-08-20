import { useState } from "react";
import { toast } from "sonner";
import { ArrowRight } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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

import {
  useAdminTaxonomyDetail,
  useCreateTaxonomyRelation,
  useSetTaxonomyItemActive,
  useSetTaxonomyRelationActive,
  useUpdateTaxonomyItem,
  useUpdateTaxonomyRelation,
} from "@/features/admin/useAdminTaxonomy";
import {
  kindText,
  translateTaxonomyError,
  type TaxonomyRelation,
} from "@/features/admin/taxonomySchemas";
import { TaxonomyItemForm } from "@/features/admin/TaxonomyItemForm";
import { TaxonomyRelationForm } from "@/features/admin/TaxonomyRelationForm";
import type { Segment } from "@/lib/types";


function fmt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("pt-BR");
}

function RelationItem({ r }: { r: TaxonomyRelation }) {
  return (
    <li className="rounded-md border p-3 text-sm" data-testid="relation-item">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {r.direction === "outgoing" ? (
          <>
            <Badge variant="outline">Este item</Badge>
            <ArrowRight className="h-3 w-3 text-muted-foreground" aria-hidden />
            <Badge variant="outline">{r.other_label}</Badge>
          </>
        ) : (
          <>
            <Badge variant="outline">{r.other_label}</Badge>
            <ArrowRight className="h-3 w-3 text-muted-foreground" aria-hidden />
            <Badge variant="outline">Este item</Badge>
          </>
        )}
        <Badge variant="secondary">peso {r.weight}</Badge>
        <Badge variant={r.active ? "default" : "outline"}>{r.active ? "ativa" : "inativa"}</Badge>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Tipo: {r.relation_type} · Segmento do outro item: {r.other_segment_label ?? "—"}
        {r.other_active ? "" : " (item inativo)"}
      </p>
      {r.rationale ? (
        <p className="mt-1 text-xs text-muted-foreground">Justificativa: {r.rationale}</p>
      ) : null}
    </li>
  );
}

/**
 * IMPL 11 — detalhe do item: edição auditada, ativação/desativação e visão
 * SOMENTE LEITURA das relações complementares (mutações ficam para a Impl 12).
 */
export function TaxonomyItemSheet({
  eventId,
  itemId,
  segments,
  onOpenChange,
}: {
  eventId: string;
  itemId: string | null;
  segments: Segment[];
  onOpenChange: (open: boolean) => void;
}) {
  const open = !!itemId;
  const detail = useAdminTaxonomyDetail(eventId, itemId, open);
  const update = useUpdateTaxonomyItem(eventId);
  const toggle = useSetTaxonomyItemActive(eventId);
  const createRelation = useCreateTaxonomyRelation(eventId, itemId);
  const updateRelation = useUpdateTaxonomyRelation(eventId, itemId);
  const toggleRelation = useSetTaxonomyRelationActive(eventId, itemId);
  const [editing, setEditing] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingRelation, setEditingRelation] = useState<string | null>(null);
  const [confirmRelationOff, setConfirmRelationOff] = useState<TaxonomyRelation | null>(null);

  const item = detail.data?.item;
  const relations = detail.data?.relations ?? [];

  /** Reativar é imediato; desativar SEMPRE pede confirmação explícita. */
  function handleToggleRequest(next: boolean) {
    if (!next) {
      setConfirmOff(true);
      return;
    }
    void applyActive(true);
  }

  async function applyActive(next: boolean) {
    if (!itemId) return;
    try {
      await toggle.mutateAsync({ itemId, active: next });
      toast.success(next ? "Item reativado." : "Item desativado (histórico preservado).");
    } catch (err) {
      toast.error(translateTaxonomyError(err));
    } finally {
      setConfirmOff(false);
    }
  }

  /** Relações também nunca são apagadas: desativar exige confirmação. */
  async function applyRelationActive(relationId: string, next: boolean) {
    try {
      await toggleRelation.mutateAsync({ relationId, active: next });
      toast.success(next ? "Relação reativada." : "Relação desativada (histórico preservado).");
    } catch (err) {
      toast.error(translateTaxonomyError(err));
    } finally {
      setConfirmRelationOff(null);
    }
  }


  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          setEditing(false);
          setConfirmOff(false);
        }
        onOpenChange(v);
      }}
    >
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{item?.label ?? "Item da taxonomia"}</SheetTitle>
          <SheetDescription>
            {item ? `${item.slug} · ${kindText(item.kind)}` : "Carregando detalhe do item…"}
          </SheetDescription>
        </SheetHeader>

        {detail.isLoading ? (
          <div className="mt-6 space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : detail.isError ? (
          <p className="mt-6 text-sm text-destructive">{translateTaxonomyError(detail.error)}</p>
        ) : item ? (
          <Tabs defaultValue="geral" className="mt-6">
            <TabsList className="w-full">
              <TabsTrigger value="geral" className="flex-1">
                Geral
              </TabsTrigger>
              <TabsTrigger value="uso" className="flex-1">
                Uso
              </TabsTrigger>
              <TabsTrigger value="relacoes" className="flex-1">
                Relações
              </TabsTrigger>
            </TabsList>

            <TabsContent value="geral" className="mt-4 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={item.active ? "default" : "outline"}>
                  {item.active ? "Ativo" : "Inativo"}
                </Badge>
                <Badge variant="secondary">{kindText(item.kind)}</Badge>
                <Badge variant="outline">{item.segment_label ?? item.segment_id ?? "—"}</Badge>
              </div>

              {editing ? (
                <TaxonomyItemForm
                  segments={segments}
                  submitLabel="Salvar alterações"
                  pending={update.isPending}
                  initial={{
                    label: item.label,
                    segmentId: item.segment_id ?? "",
                    kind: item.kind as never,
                    description: item.description ?? "",
                    synonyms: item.synonyms,
                  }}
                  onCancel={() => setEditing(false)}
                  onSubmit={async (values) => {
                    try {
                      await update.mutateAsync({ itemId: item.id, values });
                      toast.success("Item atualizado.");
                      setEditing(false);
                    } catch (err) {
                      toast.error(translateTaxonomyError(err));
                    }
                  }}
                />
              ) : (
                <div className="space-y-3 text-sm">
                  <p className="text-muted-foreground">
                    {item.description || "Sem descrição cadastrada."}
                  </p>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Sinônimos
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {item.synonyms.length > 0 ? (
                        item.synonyms.map((s) => (
                          <Badge key={s} variant="secondary">
                            {s}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground">Nenhum</span>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Criado em {fmt(item.created_at)} · Atualizado em {fmt(item.updated_at)}
                  </p>

                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
                    <div className="flex items-center gap-2">
                      <Switch
                        id="tax-active"
                        checked={item.active}
                        disabled={toggle.isPending}
                        onCheckedChange={handleToggleRequest}
                      />
                      <Label htmlFor="tax-active" className="text-sm">
                        Item ativo no catálogo
                      </Label>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                      Editar
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Itens nunca são apagados: desativar remove do catálogo novo e preserva
                    referências históricas em perfis e matches.
                  </p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="uso" className="mt-4 space-y-2 text-sm">
              <p>
                Ofertas: <strong>{item.usage_offers_active}</strong> ativas de{" "}
                {item.usage_offers_total} no total
              </p>
              <p>
                Necessidades: <strong>{item.usage_needs_active}</strong> ativas de{" "}
                {item.usage_needs_total} no total
              </p>
              <p>
                Motivos de match que citam relações deste item:{" "}
                <strong>{item.usage_match_reasons}</strong>
              </p>
            </TabsContent>

            <TabsContent value="relacoes" className="mt-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  Relações complementares usadas pelo matcher. Nada é apagado: relações são
                  desativadas.
                </p>
                {!creating ? (
                  <Button size="sm" variant="outline" onClick={() => setCreating(true)}>
                    Nova relação
                  </Button>
                ) : null}
              </div>

              {creating ? (
                <div className="rounded-md border p-3">
                  <TaxonomyRelationForm
                    eventId={eventId}
                    currentItemId={item.id}
                    mode="create"
                    pending={createRelation.isPending}
                    onCancel={() => setCreating(false)}
                    onSubmit={async (values) => {
                      try {
                        await createRelation.mutateAsync(values);
                        toast.success("Relação criada.");
                        setCreating(false);
                      } catch (err) {
                        toast.error(translateTaxonomyError(err));
                      }
                    }}
                  />
                </div>
              ) : null}

              {relations.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhuma relação complementar cadastrada para este item.
                </p>
              ) : (
                <ul className="space-y-2">
                  {relations.map((r) => (
                    <li key={`${r.direction}-${r.id}`}>
                      <RelationItem r={r} />
                      {editingRelation === r.id ? (
                        <div className="mt-2 rounded-md border p-3">
                          <TaxonomyRelationForm
                            eventId={eventId}
                            currentItemId={item.id}
                            mode="edit"
                            pending={updateRelation.isPending}
                            initial={{
                              direction: r.direction,
                              otherItemId: r.other_id,
                              relationType: "complements",
                              weight: r.weight,
                              rationale: r.rationale ?? "",
                              otherLabel: r.other_label,
                            }}
                            onCancel={() => setEditingRelation(null)}
                            onSubmit={async (values) => {
                              try {
                                await updateRelation.mutateAsync({ relationId: r.id, values });
                                toast.success("Relação atualizada.");
                                setEditingRelation(null);
                              } catch (err) {
                                toast.error(translateTaxonomyError(err));
                              }
                            }}
                          />
                        </div>
                      ) : (
                        <div className="mt-1 flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingRelation(r.id)}
                          >
                            Editar
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={toggleRelation.isPending}
                            onClick={() => {
                              if (r.active) {
                                setConfirmRelationOff(r);
                                return;
                              }
                              void applyRelationActive(r.id, true);
                            }}
                          >
                            {r.active ? "Desativar" : "Reativar"}
                          </Button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>

          </Tabs>
        ) : null}
      </SheetContent>

      <AlertDialog
        open={confirmOff}
        onOpenChange={(v) => {
          if (!v) setConfirmOff(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desativar “{item?.label ?? "item"}”?</AlertDialogTitle>
            <AlertDialogDescription>
              O item deixa de aparecer para novos cadastros e sugestões da IA. As referências
              históricas (ofertas, necessidades, matches e motivos já registrados) permanecem
              intactas e nada é apagado. Você pode reativar depois.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={toggle.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={toggle.isPending}
              onClick={(e) => {
                e.preventDefault();
                void applyActive(false);
              }}
            >
              {toggle.isPending ? "Desativando…" : "Desativar item"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}
