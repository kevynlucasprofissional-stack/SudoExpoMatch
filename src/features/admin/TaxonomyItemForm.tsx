import { useState } from "react";

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
  MAX_SYNONYMS,
  TAXONOMY_KINDS,
  TAXONOMY_KIND_TEXT,
  parseSynonymsInput,
  taxonomyFormSchema,
  type TaxonomyFormValues,
  type TaxonomyKind,
} from "@/features/admin/taxonomySchemas";
import type { Segment } from "@/lib/types";

/**
 * IMPL 11 — formulário compartilhado por criação e edição.
 * O slug NÃO é editável: é gerado e mantido estável pelo servidor.
 */
export function TaxonomyItemForm({
  segments,
  initial,
  submitLabel,
  pending,
  onSubmit,
  onCancel,
}: {
  segments: Segment[];
  initial?: Partial<TaxonomyFormValues>;
  submitLabel: string;
  pending: boolean;
  onSubmit: (values: TaxonomyFormValues) => void;
  onCancel?: () => void;
}) {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [segmentId, setSegmentId] = useState(initial?.segmentId ?? "");
  const [kind, setKind] = useState<TaxonomyKind>((initial?.kind as TaxonomyKind) ?? "both");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [synonymsText, setSynonymsText] = useState((initial?.synonyms ?? []).join(", "));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const rawSynonyms = synonymsText.split(",");
  const preview = parseSynonymsInput(synonymsText);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    const parsed = taxonomyFormSchema.safeParse({
      label,
      segmentId,
      kind,
      description,
      synonyms: rawSynonyms,
    });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) errs[String(issue.path[0])] = issue.message;
      setErrors(errs);
      return;
    }
    onSubmit({ ...parsed.data, synonyms: preview });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="tax-label">Nome do item</Label>
        <Input
          id="tax-label"
          value={label}
          maxLength={120}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Ex.: Consultoria financeira"
        />
        {errors.label ? <p className="text-xs text-destructive">{errors.label}</p> : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="tax-segment">Segmento</Label>
          <Select value={segmentId} onValueChange={setSegmentId}>
            <SelectTrigger id="tax-segment">
              <SelectValue placeholder="Escolha um segmento" />
            </SelectTrigger>
            <SelectContent>
              {segments.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.emoji} {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.segmentId ? <p className="text-xs text-destructive">{errors.segmentId}</p> : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="tax-kind">Tipo</Label>
          <Select value={kind} onValueChange={(v) => setKind(v as TaxonomyKind)}>
            <SelectTrigger id="tax-kind">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TAXONOMY_KINDS.map((k) => (
                <SelectItem key={k} value={k}>
                  {TAXONOMY_KIND_TEXT[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.kind ? <p className="text-xs text-destructive">{errors.kind}</p> : null}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="tax-description">Descrição (opcional)</Label>
        <Textarea
          id="tax-description"
          value={description}
          maxLength={800}
          rows={3}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Como esse item deve ser interpretado pela equipe e pela IA."
        />
        {errors.description ? (
          <p className="text-xs text-destructive">{errors.description}</p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="tax-synonyms">Sinônimos (separados por vírgula)</Label>
        <Input
          id="tax-synonyms"
          value={synonymsText}
          onChange={(e) => setSynonymsText(e.target.value)}
          placeholder="pdv, ponto de venda, caixa"
        />
        {errors.synonyms ? <p className="text-xs text-destructive">{errors.synonyms}</p> : null}
        <p className="text-xs text-muted-foreground">
          Até {MAX_SYNONYMS} sinônimos. Repetições e espaços extras são removidos automaticamente.
        </p>
        {preview.length > 0 ? (
          <div className="flex flex-wrap gap-1 pt-1" data-testid="synonyms-preview">
            {preview.map((s) => (
              <Badge key={s.toLowerCase()} variant="secondary">
                {s}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap justify-end gap-2 pt-2">
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
            Cancelar
          </Button>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
