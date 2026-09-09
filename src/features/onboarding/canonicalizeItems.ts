/**
 * Canonicalização conservadora de itens do wizard (risco residual do
 * incidente de cadastro de 09/09/2026).
 *
 * Problema: um item digitado manualmente pode ter label canonicamente igual a
 * um item ATIVO da taxonomia, mas ser salvo com `taxonomy_item_id = null`,
 * degradando o matcher (o par deixa de ver a relação taxonômica curada).
 *
 * Regras (determinísticas, sem fuzzy):
 *  1. Item que já tem `taxonomyItemId` é preservado como está.
 *  2. Só há vínculo quando a MESMA `normalizeLabel` do onboarding produz
 *     igualdade EXATA com o label canônico do item, ou com um sinônimo exato.
 *  3. Label canônico tem precedência sobre sinônimo.
 *  4. `kind` precisa ser compatível: oferta ↔ offer/both, necessidade ↔ need/both.
 *  5. Mais de um candidato → NÃO vincula (falso negativo é preferível a
 *     vínculo taxonômico errado).
 *  6. Só vincula item com `segment_id` autoritativo, porque
 *     `save_own_profile_v2` exige `taxonomy_items.segment_id = segment_id do
 *     payload`; ao vincular, usamos esse segmento autoritativo.
 *  7. Nunca vincula um id já usado por outro item da mesma lista — isso
 *     evitaria criar duplicidade nova; a regra de duplicidade existente
 *     (itemIdentity) continua valendo e o erro segue sendo mostrado.
 *
 * Sem substring, sem Levenshtein, sem IA.
 */
import { normalizeLabel } from "./suggestionFeed";

export interface CanonicalCatalogItem {
  id: string;
  segment_id: string | null;
  label: string;
  kind: "offer" | "need" | "both";
  synonyms?: string[];
}

export type CanonicalKind = "offer" | "need";

export interface CanonicalizableItem {
  label: string;
  segmentId: string;
  taxonomyItemId: string | null;
}

function kindMatches(item: CanonicalCatalogItem, kind: CanonicalKind): boolean {
  return item.kind === "both" || item.kind === kind;
}

/** Item taxonômico salvável: ativo (o catálogo já traz só ativos) e com segmento. */
function isLinkable(item: CanonicalCatalogItem): boolean {
  return Boolean(item.segment_id && item.segment_id.trim());
}

/**
 * Único item do catálogo em correspondência de alta confiança com `label`,
 * ou `null` quando não houver nenhum ou houver ambiguidade.
 */
export function findCanonicalTaxonomyItem(args: {
  label: string;
  kind: CanonicalKind;
  catalog: CanonicalCatalogItem[];
}): CanonicalCatalogItem | null {
  const target = normalizeLabel(args.label);
  if (!target) return null;

  const eligible = args.catalog.filter((t) => kindMatches(t, args.kind) && isLinkable(t));

  const byLabel = eligible.filter((t) => normalizeLabel(t.label) === target);
  if (byLabel.length === 1) return byLabel[0];
  if (byLabel.length > 1) return null; // ambiguidade → texto livre

  const bySynonym = eligible.filter((t) =>
    (t.synonyms ?? []).some((s) => normalizeLabel(s) === target),
  );
  if (bySynonym.length === 1) return bySynonym[0];
  return null;
}

/** Canonicaliza UM item isolado (usado nos caminhos de entrada da UI). */
export function canonicalizeItem<T extends CanonicalizableItem>(
  item: T,
  args: { kind: CanonicalKind; catalog: CanonicalCatalogItem[]; usedTaxonomyIds?: Iterable<string> },
): T {
  if (item.taxonomyItemId) return item;
  const match = findCanonicalTaxonomyItem({
    label: item.label,
    kind: args.kind,
    catalog: args.catalog,
  });
  if (!match) return item;
  const used = new Set(args.usedTaxonomyIds ?? []);
  if (used.has(match.id)) return item;
  return { ...item, taxonomyItemId: match.id, segmentId: match.segment_id as string };
}

/**
 * Canonicaliza uma LISTA inteira (recupera rascunhos antigos antes do submit).
 * Itens já canônicos reservam seu id; nenhum item novo herda um id já em uso.
 */
export function canonicalizeItems<T extends CanonicalizableItem>(
  items: T[],
  args: { kind: CanonicalKind; catalog: CanonicalCatalogItem[] },
): T[] {
  const used = new Set(items.map((i) => i.taxonomyItemId).filter((v): v is string => Boolean(v)));
  return items.map((item) => {
    const next = canonicalizeItem(item, { ...args, usedTaxonomyIds: used });
    if (next.taxonomyItemId) used.add(next.taxonomyItemId);
    return next;
  });
}

/** Aplica a canonicalização a ofertas e necessidades de um rascunho. */
export function canonicalizeDraftItems<
  D extends { offers: CanonicalizableItem[]; needs: CanonicalizableItem[] },
>(draft: D, catalog: CanonicalCatalogItem[] | null | undefined): D {
  if (!catalog || catalog.length === 0) return draft;
  return {
    ...draft,
    offers: canonicalizeItems(draft.offers, { kind: "offer", catalog }),
    needs: canonicalizeItems(draft.needs, { kind: "need", catalog }),
  };
}
