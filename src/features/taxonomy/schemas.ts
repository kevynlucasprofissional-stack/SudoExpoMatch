import { z } from "zod";

export const catalogSegmentSchema = z.object({
  id: z.string(),
  label: z.string(),
  emoji: z.string().nullable(),
  /** Metadados de domínio: segmentos históricos vêm com `false`. */
  profile_selectable: z.boolean().default(true),
});

export const catalogTaxonomyItemSchema = z.object({
  id: z.string(),
  /** IMPL 7: pode ser nulo no banco — item sem segmento não é autoritativo. */
  segment_id: z.string().nullable(),
  label: z.string(),
  kind: z.enum(["offer", "need", "both"]),
  synonyms: z.array(z.string()).default([]),
});

export const eventCatalogSchema = z.object({
  segments: z.array(catalogSegmentSchema),
  taxonomy: z.array(catalogTaxonomyItemSchema),
});
