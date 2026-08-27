/**
 * Briefing do match — CAMADA DETERMINÍSTICA.
 *
 * Traduz os códigos gravados em `match_reasons` (por perspectiva) em frases
 * comerciais legíveis em pt-BR. Não depende de IA, é instantânea e 100%
 * auditável: tudo que aparece aqui existe no banco.
 */

export interface TopReason {
  code: string;
  label: string;
  weight: number;
  need_label?: string | null;
  offer_label?: string | null;
}

export interface ExplainSides {
  /** Nome curto de quem enxerga o motivo (perspectiva). */
  self: string;
  /** Nome curto do outro lado. */
  other: string;
}

/** Rótulo curto do sinal, usado nos chips do card. */
export const SIGNAL_TEXT: Record<string, string> = {
  outro_oferece_o_que_procuro: "oferta ↔ necessidade",
  outro_procura_o_que_ofereco: "necessidade ↔ oferta",
  perfil_desejado: "perfil desejado",
  perfil_desejado_mutuo: "perfil desejado mútuo",
  prioridade: "necessidade prioritária",
  complementaridade: "atividades complementares",
  atualidade: "cadastro recente",
  proximidade: "mesma região",
};

export function signalText(code: string): string {
  return SIGNAL_TEXT[code] ?? code.replace(/_/g, " ");
}

/** Uma frase comercial para um motivo, na perspectiva de `sides.self`. */
export function explainReason(r: TopReason, sides: ExplainSides): string {
  const need = r.need_label?.trim();
  const offer = r.offer_label?.trim();
  switch (r.code) {
    case "outro_oferece_o_que_procuro":
      return offer && need
        ? `${sides.other} oferece “${offer}”, que ${sides.self} listou como necessidade (“${need}”).`
        : offer
          ? `${sides.other} oferece “${offer}”, que ${sides.self} procura.`
          : `${sides.other} oferece exatamente o que ${sides.self} procura.`;
    case "outro_procura_o_que_ofereco":
      return offer && need
        ? `${sides.other} procura “${need}”, e ${sides.self} oferece “${offer}”.`
        : need
          ? `${sides.other} procura “${need}”, que ${sides.self} oferece.`
          : `${sides.other} procura justamente o que ${sides.self} oferece.`;
    case "perfil_desejado":
      return `${sides.self} procura empresas com o perfil de ${sides.other} (${r.label.toLowerCase()}).`;
    case "perfil_desejado_mutuo":
      return `${sides.self} e ${sides.other} descreveram um ao outro como o perfil de empresa que procuram.`;
    case "prioridade":
      return need
        ? `Atende uma necessidade marcada como prioritária: “${need}”.`
        : `Atende uma necessidade marcada como prioritária.`;
    case "complementaridade":
      return need && offer
        ? `Atividades complementares pela taxonomia: “${need}” → “${offer}”.`
        : `Atividades complementares segundo a taxonomia do evento.`;
    case "atualidade":
      return `Cadastro de ${sides.other} foi atualizado recentemente — dados confiáveis para abordar hoje.`;
    case "proximidade":
      return `${sides.self} e ${sides.other} atuam na mesma região.`;
    default:
      return r.label;
  }
}

/**
 * Resumo curto do card: junta o motivo mais forte de cada lado, sem repetir
 * a mesma frase quando o sinal é simétrico.
 */
export function buildCardSummary(
  whyA: TopReason[],
  whyB: TopReason[],
  names: { a: string; b: string },
): string {
  const first = (list: TopReason[]) => [...list].sort((x, y) => y.weight - x.weight)[0] ?? null;
  const ra = first(whyA);
  const rb = first(whyB);
  const phrases: string[] = [];
  if (ra) phrases.push(explainReason(ra, { self: names.a, other: names.b }));
  if (rb) {
    const p = explainReason(rb, { self: names.b, other: names.a });
    if (!phrases.includes(p)) phrases.push(p);
  }
  if (phrases.length === 0) {
    return "Sem motivos registrados pelo matcher — revise os cadastros antes de apresentar.";
  }
  return phrases.join(" ");
}

/** Chips de sinais únicos (ordem estável por peso). */
export function buildSignals(whyA: TopReason[], whyB: TopReason[], max = 4): string[] {
  const byWeight = [...whyA, ...whyB].sort((x, y) => y.weight - x.weight);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of byWeight) {
    if (seen.has(r.code)) continue;
    seen.add(r.code);
    out.push(signalText(r.code));
    if (out.length >= max) break;
  }
  return out;
}

/** Pontos de atenção calculados só com dados estruturais (sem IA). */
export function buildDeterministicRisks(input: {
  scoreGap: number;
  whyA: TopReason[];
  whyB: TopReason[];
  hasNeedsA?: boolean;
  hasNeedsB?: boolean;
  names: { a: string; b: string };
}): string[] {
  const risks: string[] = [];
  if (input.scoreGap >= 30) {
    risks.push(
      `Assimetria alta (${input.scoreGap} pontos): um lado tem muito mais a ganhar que o outro.`,
    );
  }
  if (input.whyA.length === 0) risks.push(`Nenhum motivo registrado na perspectiva de ${input.names.a}.`);
  if (input.whyB.length === 0) risks.push(`Nenhum motivo registrado na perspectiva de ${input.names.b}.`);
  if (input.hasNeedsA === false) risks.push(`${input.names.a} não cadastrou necessidades.`);
  if (input.hasNeedsB === false) risks.push(`${input.names.b} não cadastrou necessidades.`);
  return risks;
}

/** Primeiro nome — os cards ficam legíveis sem estourar a linha. */
export function shortName(full: string): string {
  const first = (full ?? "").trim().split(/\s+/)[0];
  return first && first.length > 0 ? first : full;
}
