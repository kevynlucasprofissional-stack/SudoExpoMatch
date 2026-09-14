import { useState } from "react";
import { ChevronDown, Play, RotateCcw, Settings2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

import {
  GRAPH_SETTINGS_RANGES,
  type GraphSettings,
} from "@/features/admin/graphSettings";

/**
 * Painel de personalização do Mapa de conexões, inspirado nas opções de
 * "Graph view" do Obsidian. Só mexe em aparência e física — filtros
 * analíticos continuam na URL, fora daqui.
 */

function Section({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md px-1 py-1.5 text-sm font-semibold hover:bg-muted/50">
        {title}
        <ChevronDown
          aria-hidden
          className={`h-4 w-4 transition-transform ${open ? "" : "-rotate-90"}`}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-4 px-1 pb-2 pt-3">{children}</CollapsibleContent>
    </Collapsible>
  );
}

function SliderRow({
  id,
  label,
  value,
  range,
  decimals = 2,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  range: { min: number; max: number; step: number };
  decimals?: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id} className="text-xs font-normal">
          {label}
        </Label>
        <span className="tabular-nums text-xs text-muted-foreground">
          {decimals === 0 ? Math.round(value) : value.toFixed(decimals)}
        </span>
      </div>
      <Slider
        id={id}
        aria-label={label}
        min={range.min}
        max={range.max}
        step={range.step}
        value={[value]}
        onValueChange={(v) => onChange(v[0] ?? value)}
      />
    </div>
  );
}

export function GraphSettingsPanel({
  settings,
  onChange,
  onAnimate,
  onReset,
}: {
  settings: GraphSettings;
  onChange: (patch: Partial<GraphSettings>) => void;
  onAnimate: () => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Card className="p-3">
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex items-center justify-between gap-2">
          <CollapsibleTrigger className="flex items-center gap-2 rounded-md px-1 py-1 text-sm font-semibold hover:bg-muted/50">
            <Settings2 aria-hidden className="h-4 w-4 text-primary" />
            Personalizar visualização
            <ChevronDown
              aria-hidden
              className={`h-4 w-4 transition-transform ${open ? "" : "-rotate-90"}`}
            />
          </CollapsibleTrigger>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onReset}
            title="Restaurar padrão"
          >
            <RotateCcw className="mr-1 h-4 w-4" /> Restaurar padrão
          </Button>
        </div>

        <CollapsibleContent className="mt-2 grid gap-4 md:grid-cols-2">
          <Section title="Tela">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="graph-arrows" className="text-xs font-normal">
                Setas (direção do interesse)
              </Label>
              <Switch
                id="graph-arrows"
                aria-label="Setas (direção do interesse)"
                checked={settings.showArrows}
                onCheckedChange={(v) => onChange({ showArrows: v })}
              />
            </div>
            <SliderRow
              id="graph-text-threshold"
              label="Limite para a visibilidade textual"
              value={settings.textThreshold}
              range={GRAPH_SETTINGS_RANGES.textThreshold}
              decimals={1}
              onChange={(textThreshold) => onChange({ textThreshold })}
            />
            <SliderRow
              id="graph-node-size"
              label="Tamanho dos nós"
              value={settings.nodeSize}
              range={GRAPH_SETTINGS_RANGES.nodeSize}
              decimals={1}
              onChange={(nodeSize) => onChange({ nodeSize })}
            />
            <SliderRow
              id="graph-link-thickness"
              label="Grossura dos links"
              value={settings.linkThickness}
              range={GRAPH_SETTINGS_RANGES.linkThickness}
              decimals={2}
              onChange={(linkThickness) => onChange({ linkThickness })}
            />
            <Button type="button" size="sm" variant="outline" onClick={onAnimate}>
              <Play className="mr-1 h-4 w-4" /> Animar
            </Button>
          </Section>

          <Section title="Forças">
            <SliderRow
              id="graph-center-force"
              label="Força centrípeta"
              value={settings.centerForce}
              range={GRAPH_SETTINGS_RANGES.centerForce}
              decimals={2}
              onChange={(centerForce) => onChange({ centerForce })}
            />
            <SliderRow
              id="graph-repulsion"
              label="Força de repulsão"
              value={settings.repulsion}
              range={GRAPH_SETTINGS_RANGES.repulsion}
              decimals={0}
              onChange={(repulsion) => onChange({ repulsion })}
            />
            <SliderRow
              id="graph-link-force"
              label="Força dos links"
              value={settings.linkForce}
              range={GRAPH_SETTINGS_RANGES.linkForce}
              decimals={2}
              onChange={(linkForce) => onChange({ linkForce })}
            />
            <SliderRow
              id="graph-link-distance"
              label="Distância dos links"
              value={settings.linkDistance}
              range={GRAPH_SETTINGS_RANGES.linkDistance}
              decimals={0}
              onChange={(linkDistance) => onChange({ linkDistance })}
            />
          </Section>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

export default GraphSettingsPanel;
