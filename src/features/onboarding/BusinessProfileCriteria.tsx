import { Label } from "@/components/ui/label";
import type { CatalogSegment } from "@/features/participant/types";
import type { BusinessSize, BusinessType } from "./types";
import { ANY_PREFERENCE } from "./types";

/**
 * Classificadores compartilhados entre "Quem eu sou" (mode="self") e
 * "Quem eu procuro" (mode="target"). MESMA base de opções, apenas dois
 * contextos: o modo `target` acrescenta a escolha explícita "Qualquer".
 *
 * Campos exclusivos do perfil próprio (nicho, resumo, Instagram) NÃO vivem
 * aqui — eles continuam em `StepWhoIAm`.
 */
export type CriteriaMode = "self" | "target";

export const BUSINESS_SIZE_OPTIONS: { value: BusinessSize; label: string }[] = [
  { value: "pequeno", label: "Pequeno" },
  { value: "medio", label: "Médio" },
  { value: "grande", label: "Grande" },
];
export const BUSINESS_TYPE_OPTIONS: { value: BusinessType; label: string }[] = [
  { value: "comercio", label: "Comércio" },
  { value: "industria", label: "Indústria" },
  { value: "servico", label: "Serviço" },
];
export const BUSINESS_SIZE_LABEL: Record<BusinessSize, string> = Object.fromEntries(
  BUSINESS_SIZE_OPTIONS.map((o) => [o.value, o.label]),
) as Record<BusinessSize, string>;
export const BUSINESS_TYPE_LABEL: Record<BusinessType, string> = Object.fromEntries(
  BUSINESS_TYPE_OPTIONS.map((o) => [o.value, o.label]),
) as Record<BusinessType, string>;

/** Texto exibido quando a preferência é "Qualquer"/NULL. */
export const ANY_LABEL = "Qualquer";

/**
 * Segmentos oferecidos na escolha de perfil. Segmentos históricos
 * (Comércio / Indústria / Serviços) vivem em "Tipo principal" e vêm do banco
 * com `profile_selectable = false` — nunca aparecem como segmento.
 */
export function profileSelectableSegments(segments: CatalogSegment[]): CatalogSegment[] {
  return segments.filter((s) => s.profile_selectable !== false);
}

/** Sinais visuais por contexto — accent da marca, nunca outro tema. */
const ACCENT = {
  self: {
    chipActive: "border-secondary bg-secondary/10 ring-2 ring-secondary/40",
    cardActive: "border-secondary bg-secondary/10 shadow-sm ring-2 ring-secondary/40",
  },
  target: {
    chipActive: "border-success bg-success/15 ring-2 ring-success/40",
    cardActive: "border-success bg-success/15 shadow-sm ring-2 ring-success/40",
  },
} as const;

function ChoiceGroup<T extends string>({
  label,
  hint,
  value,
  options,
  onChange,
  mode,
  testIdPrefix,
}: {
  label: string;
  hint?: string;
  value: T | "";
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  mode: CriteriaMode;
  testIdPrefix: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={label}>
        {options.map((o) => {
          const active = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={active}
              data-testid={`${testIdPrefix}-${o.value}`}
              onClick={() => onChange(o.value)}
              className={`min-h-11 rounded-full border px-4 py-2 text-sm transition-all ${
                active ? ACCENT[mode].chipActive : "hover:bg-muted"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function BusinessProfileCriteria({
  mode,
  segments,
  size,
  type,
  segmentId,
  onSizeChange,
  onTypeChange,
  onSegmentChange,
  manualMode = false,
  manualSegmentLabel,
  sizeLabel,
  typeLabel,
  segmentLabel,
  hints,
}: {
  mode: CriteriaMode;
  segments: CatalogSegment[];
  size: BusinessSize | "any" | "";
  type: BusinessType | "any" | "";
  /** `""` = não respondeu; `"any"` = Qualquer (apenas em mode="target"). */
  segmentId: string;
  onSizeChange: (v: BusinessSize | "any") => void;
  onTypeChange: (v: BusinessType | "any") => void;
  onSegmentChange: (v: string) => void;
  manualMode?: boolean;
  manualSegmentLabel?: string;
  sizeLabel?: string;
  typeLabel?: string;
  segmentLabel?: string;
  hints?: { size?: string; type?: string; segment?: string };
}) {
  const withAny = mode === "target";
  const sizeOptions = withAny
    ? [...BUSINESS_SIZE_OPTIONS, { value: ANY_PREFERENCE, label: ANY_LABEL }]
    : BUSINESS_SIZE_OPTIONS;
  const typeOptions = withAny
    ? [...BUSINESS_TYPE_OPTIONS, { value: ANY_PREFERENCE, label: ANY_LABEL }]
    : BUSINESS_TYPE_OPTIONS;
  const list = profileSelectableSegments(segments);

  return (
    <div className="space-y-6" data-testid={`criteria-${mode}`}>
      <ChoiceGroup
        mode={mode}
        label={sizeLabel ?? "Porte da empresa"}
        hint={hints?.size}
        value={size}
        options={sizeOptions as { value: BusinessSize | "any"; label: string }[]}
        onChange={onSizeChange}
        testIdPrefix={`criteria-${mode}-size`}
      />
      <ChoiceGroup
        mode={mode}
        label={typeLabel ?? "Tipo principal"}
        hint={hints?.type}
        value={type}
        options={typeOptions as { value: BusinessType | "any"; label: string }[]}
        onChange={onTypeChange}
        testIdPrefix={`criteria-${mode}-type`}
      />

      <div>
        <Label>{segmentLabel ?? "Segmento"}</Label>
        {hints?.segment && <p className="mt-0.5 text-xs text-muted-foreground">{hints.segment}</p>}
        {manualMode ? (
          <div
            className="mt-2 rounded-xl border border-warning/40 bg-warning/5 p-3 text-sm"
            aria-live="polite"
          >
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Segmento atual (bloqueado)
            </p>
            <p className="mt-1 font-medium">{manualSegmentLabel ?? segmentId}</p>
          </div>
        ) : (
          <div className="mt-2 grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 lg:grid-cols-3">
            {withAny && (
              <button
                type="button"
                aria-pressed={segmentId === ANY_PREFERENCE}
                data-testid={`criteria-${mode}-segment-any`}
                onClick={() => onSegmentChange(ANY_PREFERENCE)}
                className={`min-h-11 rounded-xl border p-3 text-left text-sm transition-all ${
                  segmentId === ANY_PREFERENCE ? ACCENT[mode].cardActive : "hover:bg-muted"
                }`}
              >
                🌐 {ANY_LABEL}
              </button>
            )}
            {list.map((s) => {
              const active = segmentId === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={active}
                  data-testid={`criteria-${mode}-segment-${s.id}`}
                  onClick={() => onSegmentChange(s.id)}
                  className={`min-h-11 rounded-xl border p-3 text-left text-sm transition-all ${
                    active ? ACCENT[mode].cardActive : "hover:bg-muted"
                  }`}
                >
                  {s.emoji && <span className="mr-1">{s.emoji}</span>}
                  {s.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
