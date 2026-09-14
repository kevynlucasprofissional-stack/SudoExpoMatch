import type { OwnMatchDTO } from "./types";

/**
 * IMPL 31 — quebra-gelo sugerido para o WhatsApp do participante.
 *
 * Prioridade honesta:
 * 1. `approach` do briefing OFICIAL persistido (mesma fonte do painel admin);
 * 2. fallback determinístico com motivos do matcher, oferta/necessidade e nomes;
 * 3. fallback mínimo natural.
 *
 * Nunca afirma que o texto foi gerado por IA. Nunca inclui telefone.
 */

export type IcebreakerSource = "briefing_approach" | "deterministic" | "minimal";

export interface Icebreaker {
  text: string;
  source: IcebreakerSource;
}

function firstName(full: string): string {
  const t = (full ?? "").trim();
  if (!t) return "tudo bem";
  return t.split(/\s+/)[0];
}

/** Gancho concreto derivado do que o matcher realmente encontrou. */
export function resolveIcebreakerHook(match: OwnMatchDTO): string | null {
  const codes = new Set((match.reasons ?? []).map((r) => r.code));
  const offer = match.other_offers?.[0]?.label?.trim();
  const need =
    match.other_needs?.find((n) => n.is_priority)?.label?.trim() ||
    match.other_needs?.[0]?.label?.trim();

  if (codes.has("outro_oferece_o_que_procuro") && offer) {
    return `vocês trabalham com ${offer}, que é exatamente o que eu procuro`;
  }
  if (codes.has("outro_procura_o_que_ofereco") && need) {
    return `vocês estão procurando ${need}, e é justamente com isso que eu trabalho`;
  }
  if (offer) return `vocês trabalham com ${offer}`;
  if (need) return `vocês estão procurando ${need}`;

  const reason = (match.reasons ?? [])[0]?.label?.trim();
  if (reason) return reason.toLowerCase();
  return null;
}

export function buildParticipantIcebreaker(match: OwnMatchDTO): Icebreaker {
  const name = firstName(match.other?.name ?? "");
  const approach = match.briefing?.approach?.trim();

  if (approach) {
    return {
      source: "briefing_approach",
      text: `Oi, ${name}! Tudo bem? Nos conhecemos pelo SudoExpo Match. ${approach} Topa marcar um café para trocarmos uma ideia?`,
    };
  }

  const hook = resolveIcebreakerHook(match);
  if (hook) {
    return {
      source: "deterministic",
      text: `Oi, ${name}! Tudo bem? Nos conhecemos pelo SudoExpo Match. Vi que ${hook}. Achei que faria sentido trocarmos uma ideia. Topa marcar um café?`,
    };
  }

  return {
    source: "minimal",
    text: `Oi, ${name}! Tudo bem? Nos conhecemos pelo SudoExpo Match e o sistema sugeriu a nossa conexão. Topa marcar um café para trocarmos uma ideia?`,
  };
}

/** Link wa.me com texto opcional — vazio abre o contato sem mensagem. */
export function buildParticipantWhatsAppLink(phoneE164: string, message?: string): string {
  const digits = (phoneE164 ?? "").replace(/\D/g, "");
  const text = (message ?? "").trim();
  return text
    ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
    : `https://wa.me/${digits}`;
}
