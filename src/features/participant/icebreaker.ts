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

/**
 * Padrões META: texto escrito para a EQUIPE apresentar os dois, não para o
 * participante falar. Briefings antigos (`briefing-v1`) foram gerados assim.
 */
const META_APPROACH_PATTERNS: RegExp[] = [
  /^ao\s+(falar|conversar|apresentar|abordar|encontrar)\b/i,
  /^(pergunte|questione|sugira|proponha|apresente|inicie|puxe|explore|destaque|reforce|use|aproveite|convide|lembre|mostre)\b/i,
  /\bequipe\b/i,
  /\bapresentar os dois\b/i,
];

/** Prefixos instrucionais que podem ser removidos com segurança. */
const META_PREFIX = /^(diga|comente|mencione|fale|conte)\s+(?:para\s+\S+\s+)?(?:que|sobre)\s+/i;

/**
 * Adapta o `approach` do briefing para uso direto no WhatsApp.
 * Retorna `null` quando o texto é instrucional e não pode ser convertido com
 * confiança — nesse caso o quebra-gelo cai no fallback determinístico.
 */
export function adaptApproachForWhatsApp(approach?: string | null): string | null {
  const raw = (approach ?? "").trim();
  if (!raw) return null;

  const stripped = raw.replace(META_PREFIX, "").trim();
  const candidate =
    stripped !== raw && stripped ? stripped.charAt(0).toUpperCase() + stripped.slice(1) : raw;

  if (META_APPROACH_PATTERNS.some((r) => r.test(candidate))) return null;
  return candidate;
}

export function buildParticipantIcebreaker(match: OwnMatchDTO): Icebreaker {
  const name = firstName(match.other?.name ?? "");
  const approach = adaptApproachForWhatsApp(match.briefing?.approach);

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
