import { z } from "zod";
import { fallback } from "@tanstack/zod-adapter";
import { INTEREST_STATES, type InterestState } from "@/features/admin/graphSchemas";
import { DEFAULT_GRAPH_FILTERS, type GraphFilters } from "@/features/admin/graphPresentation";

/**
 * Estado de URL de /admin/graph. Todo filtro é compartilhável, como nas demais
 * telas administrativas.
 */
export const graphSearchSchema = z.object({
  st: fallback(z.string(), "").default(""),
  min: fallback(z.string(), "").default(""),
  max: fallback(z.string(), "").default(""),
  seg: fallback(z.string(), "").default(""),
  q: fallback(z.string(), "").default(""),
  conn: fallback(z.string(), "").default(""),
  rev: fallback(z.string(), "").default(""),
  iso: fallback(z.string(), "").default(""),
  /** nó selecionado (painel contextual) */
  p: fallback(z.string(), "").default(""),
  /** "1" quando a ficha completa do participante está aberta */
  pd: fallback(z.string(), "").default(""),
  /** aresta aberta no detalhe */
  m: fallback(z.string(), "").default(""),
});
export type GraphSearch = z.infer<typeof graphSearchSchema>;

const csv = (raw: string) =>
  raw
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

const isState = (v: string): v is InterestState =>
  (INTEREST_STATES as readonly string[]).includes(v);

export interface NormalizedGraphSearch extends GraphFilters {
  selectedProfileId: string | null;
  /** ficha completa (Sheet) do participante aberta */
  profileSheetOpen: boolean;
  selectedMatchId: string | null;
}

export function normalizeGraphSearch(search: GraphSearch): NormalizedGraphSearch {
  const states = csv(search.st).filter(isState);
  const minRaw = Number.parseInt(search.min, 10);
  const maxRaw = Number.parseInt(search.max, 10);
  return {
    states: states.length > 0 ? states : DEFAULT_GRAPH_FILTERS.states,
    minScore: Number.isFinite(minRaw) ? Math.max(0, minRaw) : null,
    maxScore: Number.isFinite(maxRaw) ? Math.max(0, maxRaw) : null,
    segments: csv(search.seg),
    q: search.q.trim(),
    onlyConnected: search.conn === "1",
    onlyReviewed: search.rev === "1",
    showIsolated: search.iso === "1",
    selectedProfileId: search.p ? search.p : null,
    profileSheetOpen: search.p !== "" && search.pd === "1",
    selectedMatchId: search.m ? search.m : null,
  };
}

export function hasActiveGraphFilters(f: NormalizedGraphSearch): boolean {
  return (
    f.q !== "" ||
    f.minScore != null ||
    f.maxScore != null ||
    f.segments.length > 0 ||
    f.onlyConnected ||
    f.onlyReviewed ||
    f.showIsolated ||
    f.states.length !== DEFAULT_GRAPH_FILTERS.states.length ||
    f.states.some((s) => !DEFAULT_GRAPH_FILTERS.states.includes(s))
  );
}
