import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  TAXONOMY_MAX_LIMIT,
  TAXONOMY_PAGE_SIZE,
  sanitizeSynonyms,
  taxonomyDetailSchema,
  taxonomyPageSchema,
  type NormalizedTaxonomySearch,
  type TaxonomyDetail,
  type TaxonomyFormValues,
  type TaxonomyPage,
} from "@/features/admin/taxonomySchemas";

/**
 * IMPL 11 — camada de API da taxonomia administrativa.
 * Leitura e mutação passam exclusivamente por RPCs admin-only auditadas.
 */

export type TaxonomyFilters = Omit<NormalizedTaxonomySearch, "page" | "selected"> & {
  offset: number;
  limit?: number;
};

export const taxonomyKey = (eventId: string, f: TaxonomyFilters) =>
  [
    "admin",
    "taxonomy",
    eventId,
    f.q,
    [...f.segments].sort().join(","),
    [...f.kinds].sort().join(","),
    f.status,
    f.offset,
    f.limit ?? TAXONOMY_PAGE_SIZE,
  ] as const;

export const taxonomyDetailKey = (itemId: string) => ["admin", "taxonomy-detail", itemId] as const;

const arr = (v: string[]) => (v.length > 0 ? v : undefined);

function activeFilter(status: NormalizedTaxonomySearch["status"]): boolean | undefined {
  if (status === "active") return true;
  if (status === "inactive") return false;
  return undefined;
}

export async function fetchAdminTaxonomy(
  eventId: string,
  f: TaxonomyFilters,
): Promise<TaxonomyPage> {
  const limit = Math.min(Math.max(f.limit ?? TAXONOMY_PAGE_SIZE, 1), TAXONOMY_MAX_LIMIT);
  const { data, error } = await supabase.rpc("admin_list_taxonomy_items", {
    _event_id: eventId,
    _search: f.q ? f.q : undefined,
    _segment_ids: arr(f.segments),
    _kinds: arr(f.kinds),
    _active: activeFilter(f.status),
    _limit: limit,
    _offset: Math.max(0, f.offset),
  });
  if (error) throw error;
  return taxonomyPageSchema.parse(data);
}

export function useAdminTaxonomy(eventId: string, filters: TaxonomyFilters, enabled: boolean) {
  return useQuery({
    queryKey: taxonomyKey(eventId, filters),
    enabled,
    staleTime: 15_000,
    placeholderData: keepPreviousData,
    queryFn: () => fetchAdminTaxonomy(eventId, filters),
  });
}

export async function fetchAdminTaxonomyDetail(
  eventId: string,
  itemId: string,
): Promise<TaxonomyDetail> {
  const { data, error } = await supabase.rpc("admin_get_taxonomy_item_detail", {
    _event_id: eventId,
    _item_id: itemId,
  });
  if (error) throw error;
  return taxonomyDetailSchema.parse(data);
}

export function useAdminTaxonomyDetail(
  eventId: string,
  itemId: string | null,
  enabled: boolean,
) {
  return useQuery({
    queryKey: taxonomyDetailKey(itemId ?? "none"),
    enabled: enabled && !!itemId,
    staleTime: 15_000,
    queryFn: () => fetchAdminTaxonomyDetail(eventId, itemId!),
  });
}

function useInvalidateTaxonomy(eventId: string) {
  const qc = useQueryClient();
  return async (itemId?: string) => {
    await qc.invalidateQueries({ queryKey: ["admin", "taxonomy", eventId] });
    if (itemId) await qc.invalidateQueries({ queryKey: taxonomyDetailKey(itemId) });
    // O catálogo do wizard também depende dos itens ativos.
    await qc.invalidateQueries({ queryKey: ["staff", "event-segments", eventId] });
  };
}

export function useCreateTaxonomyItem(eventId: string) {
  const invalidate = useInvalidateTaxonomy(eventId);
  return useMutation({
    mutationFn: async (values: TaxonomyFormValues): Promise<string> => {
      const { data, error } = await supabase.rpc("admin_create_taxonomy_item", {
        _event_id: eventId,
        _label: values.label.trim(),
        _segment_id: values.segmentId,
        _kind: values.kind,
        _description: values.description?.trim() || undefined,
        _synonyms: sanitizeSynonyms(values.synonyms),
      });
      if (error) throw error;
      return data as unknown as string;
    },
    onSuccess: (id) => invalidate(id),
  });
}

export function useUpdateTaxonomyItem(eventId: string) {
  const invalidate = useInvalidateTaxonomy(eventId);
  return useMutation({
    mutationFn: async ({ itemId, values }: { itemId: string; values: TaxonomyFormValues }) => {
      const { data, error } = await supabase.rpc("admin_update_taxonomy_item", {
        _event_id: eventId,
        _item_id: itemId,
        _label: values.label.trim(),
        _segment_id: values.segmentId,
        _kind: values.kind,
        _description: values.description?.trim() || undefined,
        _synonyms: sanitizeSynonyms(values.synonyms),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, vars) => invalidate(vars.itemId),
  });
}

export function useSetTaxonomyItemActive(eventId: string) {
  const invalidate = useInvalidateTaxonomy(eventId);
  return useMutation({
    mutationFn: async ({ itemId, active }: { itemId: string; active: boolean }) => {
      const { data, error } = await supabase.rpc("admin_set_taxonomy_item_active", {
        _event_id: eventId,
        _item_id: itemId,
        _active: active,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, vars) => invalidate(vars.itemId),
  });
}
