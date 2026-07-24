import type { EventCatalog } from "@/features/participant/types";

export type CatalogAvailability =
  | { kind: "loading" }
  | { kind: "blocked" }
  | {
      kind: "ready";
      catalog: EventCatalog;
      /** Somente `true` quando não há dados vindos do servidor (modo manual real). */
      manualMode: boolean;
      /** `true` quando há cache válido mas uma tentativa recente falhou. */
      refreshFailed: boolean;
    };

export interface ResolveCatalogInput {
  data: EventCatalog | null | undefined;
  isPending: boolean;
  isError: boolean;
  fallbackSegmentId: string;
}

/**
 * Resolve o estado do catálogo do wizard.
 * - Se há dados (mesmo em cache), NÃO é modo manual — apenas sinaliza refresh falho.
 * - Modo manual só quando não há dados e existe segmento autoritativo.
 * - Bloqueio total quando não há dados nem segmento autoritativo.
 */
export function resolveCatalogAvailability(
  input: ResolveCatalogInput,
): CatalogAvailability {
  const { data, isPending, isError, fallbackSegmentId } = input;
  const hasData = !!data;
  if (hasData) {
    return {
      kind: "ready",
      catalog: data!,
      manualMode: false,
      refreshFailed: isError,
    };
  }
  if (fallbackSegmentId) {
    return {
      kind: "ready",
      catalog: { segments: [], taxonomy: [] },
      manualMode: true,
      refreshFailed: false,
    };
  }
  if (isPending) return { kind: "loading" };
  return { kind: "blocked" };
}
