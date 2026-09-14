import { Info, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { NO_DATA_LABEL, formatRate, type Rate } from "@/features/admin/intelligencePresentation";

/**
 * IMPL 29 — cartão de KPI do SudoExpo Intelligence.
 * Regra: nenhuma taxa aparece sem denominador visível, e amostra pequena
 * recebe aviso discreto em vez de ser escondida.
 */
export function KpiCard({
  label,
  value,
  hint,
  description,
  tone = "default",
  smallSample = false,
}: {
  label: string;
  value: string | number;
  hint?: string;
  description: string;
  tone?: "default" | "positive" | "warning" | "danger";
  smallSample?: boolean;
}) {
  const toneRing =
    tone === "positive"
      ? "border-emerald-500/40 bg-emerald-500/5"
      : tone === "warning"
        ? "border-amber-500/40 bg-amber-500/5"
        : tone === "danger"
          ? "border-destructive/40 bg-destructive/5"
          : "border-border/60 bg-muted/25";

  return (
    <div className={cn("rounded-xl border p-4 shadow-sm", toneRing)}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <span title={description} aria-label={description}>
          <Info className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
        </span>
      </div>
      <p className="mt-2 font-display text-2xl font-semibold leading-none">{value}</p>
      {hint && <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">{hint}</p>}
      {smallSample && (
        <Badge variant="outline" className="mt-2 gap-1 border-amber-500/50 text-[10px] font-normal">
          <TriangleAlert className="h-3 w-3" /> amostra pequena
        </Badge>
      )}
      <p className="mt-2 text-[11px] leading-snug text-muted-foreground/80">{description}</p>
    </div>
  );
}

/** KPI derivado de uma taxa: já formata "x% (num/den)". */
export function RateKpi({
  label,
  r,
  description,
  tone,
}: {
  label: string;
  r: Rate;
  description: string;
  tone?: "default" | "positive" | "warning" | "danger";
}) {
  return (
    <KpiCard
      label={label}
      value={r.pct === null ? NO_DATA_LABEL : formatRate(r)}
      hint={`${r.numerator} de ${r.denominator}`}
      description={description}
      tone={tone}
      smallSample={r.smallSample}
    />
  );
}

export function SectionTitle({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h2 className="font-display text-base font-semibold">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function EmptyBlock({ message = NO_DATA_LABEL }: { message?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 p-6 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}
