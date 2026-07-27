/**
 * Helper puro para juntar sugestões aceitas a uma lista existente,
 * preservando ordem, deduplicando por label case-insensitive e respeitando
 * o limite máximo. Usado por `Aceitar todas` e por aceitação individual.
 *
 * Contrato:
 * - `existing` é preservada inteira e vem primeiro.
 * - `additions` são anexadas na ordem original, pulando duplicatas e itens
 *   já presentes em `existing`.
 * - O corte por `cap` é aplicado à lista final.
 */
export function mergeCapped<T extends { label: string }>(
  existing: T[],
  additions: T[],
  cap: number,
): T[] {
  const out = existing.slice(0, cap);
  const seen = new Set(existing.map((x) => x.label.trim().toLowerCase()));
  for (const item of additions) {
    if (out.length >= cap) break;
    const key = item.label.trim().toLowerCase();
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
