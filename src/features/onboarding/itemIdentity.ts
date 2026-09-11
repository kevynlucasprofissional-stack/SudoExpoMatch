/**
 * Identidade canônica de um item do wizard (oferta ou necessidade).
 *
 * Contexto: incidente de cadastro de 09/09/2026 — o front comparava labels
 * apenas por `toLowerCase()`, enquanto `public.norm_label` no banco compara
 * minúsculas + sem acentos + espaços colapsados. Variações invisíveis
 * (acento, espaço duplo, tab) passavam pela tela e só falhavam no save com
 * `duplicate_need_label`.
 *
 * Regra única, usada em TODOS os caminhos de entrada e nas defesas de
 * fronteira: dois itens são equivalentes quando têm o MESMO
 * `taxonomyItemId` não-nulo OU o mesmo label normalizado.
 */
import { normalizeLabel } from "./suggestionFeed";

export { normalizeLabel };

export interface IdentifiableItem {
  label: string;
  taxonomyItemId?: string | null;
}

/** Identidade canônica: `id:<uuid>` quando há taxonomia, senão `label:<norm>`. */
export function itemIdentity(item: IdentifiableItem): string {
  const id = item.taxonomyItemId?.trim();
  return id ? `id:${id}` : `label:${normalizeLabel(item.label)}`;
}

/**
 * Dois itens colidem se compartilham taxonomyItemId não-nulo OU label
 * normalizado. Note que isso é mais amplo que comparar só a identidade:
 * catálogo (com id) e texto livre (sem id) com o mesmo label colidem — foi
 * exatamente esse o caso real do incidente.
 */
export function isEquivalentItem(a: IdentifiableItem, b: IdentifiableItem): boolean {
  const idA = a.taxonomyItemId?.trim();
  const idB = b.taxonomyItemId?.trim();
  if (idA && idB && idA === idB) return true;
  return normalizeLabel(a.label) === normalizeLabel(b.label);
}

/** `true` se a lista já contém um item equivalente a `candidate`. */
export function hasEquivalentItem(list: IdentifiableItem[], candidate: IdentifiableItem): boolean {
  return list.some((item) => isEquivalentItem(item, candidate));
}

/**
 * Primeiro par equivalente encontrado na lista, na ordem original.
 * Retorna os labels ORIGINAIS (sem normalizar) para a mensagem ao usuário.
 */
export function findDuplicatePair<T extends IdentifiableItem>(
  list: T[],
): { first: T; second: T } | null {
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      if (isEquivalentItem(list[i], list[j])) return { first: list[i], second: list[j] };
    }
  }
  return null;
}
