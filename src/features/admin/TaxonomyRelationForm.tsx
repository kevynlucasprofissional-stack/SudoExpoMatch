import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  MAX_RATIONALE_LENGTH,
  TAXONOMY_RELATION_TYPES,
  relationFormSchema,
  type RelationDirection,
  type TaxonomyRelationFormValues,
} from "@/features/admin/taxonomySchemas";
import { useAdminTaxonomy } from "@/features/admin/useAdminTaxonomy";

const DIRECTION_TEXT: Record<RelationDirection, string> = {
  outgoing: "Quem PRECISA deste item combina com quem OFERECE o outro",
  incoming: "Quem PRECISA do outro item combina com quem OFERECE este",
};

/**
 * IMPL 12 — formulário de relação complementar.
 *
 * Semântica do banco/matcher: from_taxonomy_item_id é uma NECESSIDADE e
 * to_taxonomy_item_id é uma OFERTA. A UI explicita isso para evitar que o admin
 * interprete a seta como uma complementaridade genérica ou automaticamente bidirecional.
 */
export function TaxonomyRelationForm({
  eventId,
  currentItemId,
  currentItemLabel = "este item",
  mode,
  initial,
  pending,
  onSubmit,
  onCancel,
}: {
  eventId: string;
  currentItemId: string;
  currentItemLabel?: string;
  mode: "create" | "edit";
  initial?: Partial<TaxonomyRelationFormValues> & { otherLabel?: string };
  pending: boolean;
  onSubmit: (values: TaxonomyRelationFormValues) => void;
  onCancel?: () => void;
}) {
  const [direction, setDirection] = useState<RelationDirection>(
    (initial?.direction as RelationDirection) ?? "outgoing",
  );
  const [otherItemId, setOtherItemId] = useState(initial?.otherItemId ?? "");
  const [weight, setWeight] = useState(String(initial?.weight ?? 60));
  const [rationale, setRationale] = useState(initial?.rationale ?? "");
  const [search, setSearch] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isCreate = mode === "create";

  const options = useAdminTaxonomy(
    eventId,
    {
      q: search.trim(),
      segments: [],
      kinds: [],
      status: "active",
      offset: 0,
      limit: 20,
    },
    isCreate,
  );

  const items = useMemo(
    () => (options.data?.items ?? []).filter((i) => i.id !== currentItemId),
    [options.data, currentItemId],
  );
  const selectedOtherLabel =
    (isCreate ? items.find((item) => item.id === otherItemId)?.label : initial?.otherLabel) ??
    "outro item";
  const needLabel = direction === "outgoing" ? currentItemLabel : selectedOtherLabel;
  const offerLabel = direction === "outgoing" ? selectedOtherLabel : currentItemLabel;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    const parsed = relationFormSchema.safeParse({
      direction,
      otherItemId: isCreate ? otherItemId : (initial?.otherItemId ?? currentItemId),
      relationType: "complements",
      weight,
      rationale,
    });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) errs[String(issue.path[0])] = issue.message;
      setErrors(errs);
      return;
    }
    onSubmit(parsed.data);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" data-testid="relation-form">
      {isCreate ? (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="rel-direction">Sentido comercial (necessidade → oferta)</Label>
            <Select value={direction} onValueChange={(v) => setDirection(v as RelationDirection)}>
              <SelectTrigger id="rel-direction">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["outgoing", "incoming"] as const).map((d) => (
                  <SelectItem key={d} value={d}>
                    {DIRECTION_TEXT[d]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              A relação é direcional. A seta significa “quem precisa de A pode se beneficiar de
              quem oferece B”; o inverso só existe se for cadastrado separadamente.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rel-search">Buscar item da outra ponta</Label>
            <Input
              id="rel-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Digite parte do nome do item"
            />
            <Select value={otherItemId} onValueChange={setOtherItemId}>
              <SelectTrigger id="rel-other" aria-label="Item relacionado">
                <SelectValue placeholder="Escolha o item relacionado" />
              </SelectTrigger>
              <SelectContent>
                {items.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.label}
                    {i.segment_label ? ` · ${i.segment_label}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {options.isLoading ? (
              <p className="text-xs text-muted-foreground">Carregando itens…</p>
            ) : items.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum item ativo encontrado.</p>
            ) : null}
            {errors.otherItemId ? (
              <p className="text-xs text-destructive">{errors.otherItemId}</p>
            ) : null}
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          <span>Relação com</span>
          <Badge variant="outline">{initial?.otherLabel ?? "outro item"}</Badge>
          <span>. Para mudar os itens ou a direção, desative esta relação e crie outra.</span>
        </div>
      )}

      <div className="rounded-md border bg-muted/30 p-3 text-xs" data-testid="relation-semantics-preview">
        <p className="font-medium">Como o matcher interpreta</p>
        <p className="mt-1 text-muted-foreground">
          Quem PRECISA de <strong className="text-foreground">{needLabel}</strong> combina com uma
          empresa que OFERECE <strong className="text-foreground">{offerLabel}</strong>.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="rel-weight">Peso (1 a 100)</Label>
        <Input
          id="rel-weight"
          type="number"
          min={1}
          max={100}
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
        />
        {errors.weight ? <p className="text-xs text-destructive">{errors.weight}</p> : null}
        <p className="text-xs text-muted-foreground">
          O matcher v2.4 só considera relações com peso a partir de 40 e converte o peso em até 30
          pontos no score (peso × 0,30, arredondado).
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="rel-rationale">Justificativa (opcional)</Label>
        <Textarea
          id="rel-rationale"
          rows={3}
          maxLength={MAX_RATIONALE_LENGTH}
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
          placeholder="Por que essa necessidade se beneficia dessa oferta?"
        />
        {errors.rationale ? <p className="text-xs text-destructive">{errors.rationale}</p> : null}
      </div>

      <input type="hidden" name="relationType" value={TAXONOMY_RELATION_TYPES[0]} />

      <div className="flex flex-wrap justify-end gap-2 pt-1">
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
            Cancelar
          </Button>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando…" : isCreate ? "Criar relação" : "Salvar relação"}
        </Button>
      </div>
    </form>
  );
}
