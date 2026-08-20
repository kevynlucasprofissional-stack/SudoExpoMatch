/**
 * Regra do "Continuar" da etapa 2 (Quem eu sou): decide se o enriquecimento
 * por Instagram precisa rodar antes de avançar.
 *
 * - `@` vazio → avança imediatamente (zero chamadas);
 * - mesmo `@` já resolvido → reaproveita o contexto (zero chamadas);
 * - `@` novo/alterado → executa a cadeia de providers uma única vez.
 */
export function normalizeHandleForCompare(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "")
    .replace(/^@+/, "")
    .toLowerCase();
}

export function shouldRunSocialEnrichment(
  rawInput: string | null | undefined,
  resolvedHandle: string | null | undefined,
): boolean {
  const wanted = normalizeHandleForCompare(rawInput);
  if (!wanted) return false;
  return wanted !== normalizeHandleForCompare(resolvedHandle);
}
