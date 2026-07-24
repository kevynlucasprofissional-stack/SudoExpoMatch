/**
 * Helpers puros para exibir durações operacionais em pt-BR.
 * Não dependem de I/O e são fáceis de testar.
 */

/** Formata uma quantidade de segundos como "há N min/h/dias". */
export function formatDurationPt(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) {
    return "—";
  }
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return "há poucos segundos";
  const minutes = Math.floor(s / 60);
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  return `há ${days} dias`;
}

/** Mesma escala, mas em forma neutra ("N min", "N h", "N dias"). */
export function formatDurationShortPt(
  seconds: number | null | undefined,
): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) {
    return "—";
  }
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return `${s}s`;
  const minutes = Math.floor(s / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h`;
  const days = Math.floor(hours / 24);
  return `${days} dias`;
}

/** Segundos entre um ISO e agora (ou uma referência). */
export function secondsSince(
  iso: string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((now.getTime() - t) / 1000));
}

/**
 * Retorna o ISO do início da etapa atual, dado um detalhe de conexão v2.
 * Usa o timestamp da última transição relevante para o status corrente.
 */
export function stageStartAt(d: {
  status: string;
  created_at: string;
  assumed_at: string | null;
  presented_at: string | null;
  contact_exchanged_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
}): string {
  switch (d.status) {
    case "aguardando":
      return d.created_at;
    case "em_atendimento":
      return d.assumed_at ?? d.created_at;
    case "apresentados":
      return d.presented_at ?? d.assumed_at ?? d.created_at;
    case "contato_trocado":
      return (
        d.contact_exchanged_at ?? d.presented_at ?? d.assumed_at ?? d.created_at
      );
    case "concluido":
      return (
        d.completed_at ??
        d.contact_exchanged_at ??
        d.presented_at ??
        d.assumed_at ??
        d.created_at
      );
    case "cancelado":
      return d.cancelled_at ?? d.created_at;
    default:
      return d.created_at;
  }
}
