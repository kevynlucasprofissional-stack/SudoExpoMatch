/**
 * Helper puro para juntar sugestões aceitas a uma lista existente,
 * preservando ordem, deduplicando pela identidade canônica de item
 * (`itemIdentity`) e respeitando o limite máximo. Usado por `Aceitar todas`
 * e por aceitação individual.
 *
 * Contrato:
 * - `existing` é preservada inteira e vem primeiro.
 * - `additions` são anexadas na ordem original, pulando itens equivalentes
 *   (mesmo taxonomyItemId OU mesmo label normalizado) a algo já presente.
 * - O corte por `cap` é aplicado à lista final.
 */
import { hasEquivalentItem, type IdentifiableItem } from "./itemIdentity";

export function mergeCapped<T extends IdentifiableItem>(
  existing: T[],
  additions: T[],
  cap: number,
): T[] {
  const out = existing.slice(0, cap);
  for (const item of additions) {
    if (out.length >= cap) break;
    if (!item.label.trim()) continue;
    if (hasEquivalentItem(out, item)) continue;
    out.push(item);
  }
  return out;
}
