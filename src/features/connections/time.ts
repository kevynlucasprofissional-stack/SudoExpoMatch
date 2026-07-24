/**
 * Helpers puros de tempo para conexões operacionais.
 * Mantido enxuto: apenas o utilitário efetivamente usado em produção.
 * A formatação legível pt-BR vive em `src/features/staff/operationalUi.ts`.
 */

/** Segundos entre um ISO e agora (ou uma referência). Retorna null para entrada inválida. */
export function secondsSince(
  iso: string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now.getTime() - t) / 1000));
}
