/**
 * Configuração real do evento atendido por esta instância do ACIRV Connect.
 *
 * Este módulo é CONFIGURAÇÃO DE PRODUÇÃO (não é mock). O identificador precisa
 * corresponder a uma linha ativa em `public.events` no banco.
 *
 * O produto é intencionalmente single-event: não há camada multi-evento.
 * Para atender outro evento, basta apontar `EVENT_ID` para o novo registro.
 */

/** Identificador do evento corrente (chave primária em `public.events`). */
export const EVENT_ID = "sudoexpo-2026";

/** Nome de exibição do evento corrente. */
export const EVENT_NAME = "SudoExpo 2026";

/** Alias explícito para leitura em contextos onde "evento atual" é ambíguo. */
export const CURRENT_EVENT_ID = EVENT_ID;
