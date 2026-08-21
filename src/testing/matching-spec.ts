/**
 * ESPECIFICAÇÃO DE REFERÊNCIA DO MATCHING — USO EXCLUSIVO EM TESTES.
 *
 * Este módulo NÃO é executado em produção. O matching real roda inteiramente no
 * banco (Matcher v2.4, funções `_recompute_matches_for_profile` /
 * `match_label_for_score`). Aqui vive apenas um espelho legível dos pesos e das
 * regras de classificação, usado pelas suítes para conferir que o SQL continua
 * aderente à especificação. Nenhum arquivo em src/routes, src/components ou
 * src/features pode importá-lo (há guarda estática em onda-a.test.ts).
 */
import type { Match, MatchKind, MatchLabel, MatchReason, Profile } from "@/lib/types";

// Pesos oficiais da especificação:
// 55 outro oferece o que procuro | 25 outro procura o que ofereço
// 10 prioridade | 5 complementaridade | 3 atualidade | 2 proximidade
// v2.4: perfil_desejado = 10 + 10*specified_count (só com full fit) | mútuo +10
export const WEIGHTS = {
  offersWhatINeed: 55,
  needsWhatIOffer: 25,
  priority: 10,
  complementarity: 5,
  recency: 3,
  proximity: 2,
  targetBase: 10,
  targetPerCriterion: 10,
  targetMutual: 10,
} as const;

export interface TargetFit {
  specifiedCount: number;
  matchedCount: number;
  full: boolean;
  points: number;
  criteria: ("porte" | "tipo" | "segmento")[];
}

/**
 * Target fit da perspectiva de `me` sobre `other`.
 * `null`/`undefined` no target = "Qualquer" => critério ignorado.
 */
export function targetFit(me: Profile, other: Profile): TargetFit {
  const pairs: [string | null | undefined, string | null | undefined, TargetFit["criteria"][number]][] =
    [
      [me.targetBusinessSize, other.businessSize, "porte"],
      [me.targetBusinessType, other.businessType, "tipo"],
      [me.targetSegmentId, other.segmentId, "segmento"],
    ];
  let specifiedCount = 0;
  const criteria: TargetFit["criteria"] = [];
  for (const [target, actual, name] of pairs) {
    if (target == null) continue;
    specifiedCount += 1;
    if (actual != null && actual === target) criteria.push(name);
  }
  const matchedCount = criteria.length;
  const full = specifiedCount > 0 && matchedCount === specifiedCount;
  return {
    specifiedCount,
    matchedCount,
    full,
    points: full ? WEIGHTS.targetBase + WEIGHTS.targetPerCriterion * specifiedCount : 0,
    criteria,
  };
}

const CRITERIA_TEXT = { porte: "porte", tipo: "tipo", segmento: "segmento" } as const;

export function targetFitLabel(fit: TargetFit): string {
  if (fit.criteria.length === 0) return "Esta empresa corresponde ao perfil que você procura";
  const parts = fit.criteria.map((c) => CRITERIA_TEXT[c]);
  const text =
    parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}`;
  return `Corresponde ao ${text} que você procura`;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

/** Retorna quantos tokens de `needs` são cobertos por labels de `offers`. */
function overlapCount(
  offers: { label: string }[],
  needs: { label: string }[],
): { count: number; matched: string[] } {
  const offerTokens = offers.map((o) => norm(o.label));
  const matched: string[] = [];
  for (const n of needs) {
    const nn = norm(n.label);
    if (offerTokens.some((o) => o.includes(nn) || nn.includes(o))) {
      matched.push(n.label);
    }
  }
  return { count: matched.length, matched };
}

function daysBetween(a: string, b: string) {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86_400_000;
}

export interface PerspectiveScore {
  total: number;
  reasons: MatchReason[];
}

/** Pontua a perspectiva de `me` em relação a `other`. */
export function scorePerspective(me: Profile, other: Profile): PerspectiveScore {
  const reasons: MatchReason[] = [];
  let total = 0;

  const otherOffersWhatINeed = overlapCount(other.offers, me.needs);
  if (otherOffersWhatINeed.count > 0) {
    total += WEIGHTS.offersWhatINeed;
    reasons.push({
      code: "outro_oferece_o_que_procuro",
      weight: WEIGHTS.offersWhatINeed,
      detail: `Oferece: ${otherOffersWhatINeed.matched.slice(0, 3).join(", ")}`,
    });
  }

  const otherNeedsWhatIOffer = overlapCount(me.offers, other.needs);
  if (otherNeedsWhatIOffer.count > 0) {
    total += WEIGHTS.needsWhatIOffer;
    reasons.push({
      code: "outro_procura_o_que_ofereco",
      weight: WEIGHTS.needsWhatIOffer,
      detail: `Procura o que você oferece: ${otherNeedsWhatIOffer.matched.slice(0, 3).join(", ")}`,
    });
  }

  // v2.4: perfil desejado (só com full target fit) e afinidade mútua de perfil.
  const fitMe = targetFit(me, other);
  const fitOther = targetFit(other, me);
  if (fitMe.full) {
    total += fitMe.points;
    reasons.push({ code: "perfil_desejado", weight: fitMe.points, detail: targetFitLabel(fitMe) });
  }
  if (fitMe.full && fitOther.full) {
    total += WEIGHTS.targetMutual;
    reasons.push({
      code: "perfil_desejado_mutuo",
      weight: WEIGHTS.targetMutual,
      detail: "Vocês correspondem ao perfil de empresa procurado um pelo outro",
    });
  }

  // Prioridade: se algum item de necessidade prioritário meu é coberto
  const myPriority = me.needs.filter((n) => n.isPriority);
  if (myPriority.length > 0 && overlapCount(other.offers, myPriority).count > 0) {
    total += WEIGHTS.priority;
    reasons.push({
      code: "prioridade",
      weight: WEIGHTS.priority,
      detail: "Atende sua necessidade prioritária",
    });
  }

  // Complementaridade: segmentos diferentes mas com sobreposição forte
  if (
    me.segmentId !== other.segmentId &&
    (otherOffersWhatINeed.count > 0 || otherNeedsWhatIOffer.count > 0)
  ) {
    total += WEIGHTS.complementarity;
    reasons.push({
      code: "complementaridade",
      weight: WEIGHTS.complementarity,
      detail: "Segmentos complementares",
    });
  }

  // Atualidade: perfil atualizado nos últimos 7 dias
  if (daysBetween(other.updatedAt, new Date().toISOString()) <= 7) {
    total += WEIGHTS.recency;
    reasons.push({
      code: "atualidade",
      weight: WEIGHTS.recency,
      detail: "Perfil recém-atualizado",
    });
  }

  // Proximidade: mesma cidade
  if (norm(me.city) === norm(other.city) && me.city) {
    total += WEIGHTS.proximity;
    reasons.push({
      code: "proximidade",
      weight: WEIGHTS.proximity,
      detail: `Mesma cidade (${other.city})`,
    });
  }

  return { total, reasons };
}

export function classifyKind(me: Profile, other: Profile): { kind: MatchKind; hasSignal: boolean } {
  const otherOffersWhatINeed = overlapCount(other.offers, me.needs).count > 0;
  const otherNeedsWhatIOffer = overlapCount(me.offers, other.needs).count > 0;
  const differentSegment = me.segmentId !== other.segmentId;

  if (otherOffersWhatINeed && otherNeedsWhatIOffer) {
    return { kind: "bidirecional", hasSignal: true };
  }
  if (otherOffersWhatINeed && differentSegment) {
    return { kind: "hibrido", hasSignal: true };
  }
  if (otherOffersWhatINeed) return { kind: "direto", hasSignal: true };
  if (otherNeedsWhatIOffer) return { kind: "inverso", hasSignal: true };
  // v2.4: full target fit em qualquer direção é sinal legítimo de criação da dupla.
  if (targetFit(me, other).full || targetFit(other, me).full) {
    return { kind: "perfil_desejado", hasSignal: true };
  }
  if (differentSegment) return { kind: "complementar", hasSignal: false };
  return { kind: "direto", hasSignal: false };
}

export function classifyLabel(score: number): MatchLabel {
  if (score >= 75) return "alta_compatibilidade";
  if (score >= 40) return "boa_oportunidade";
  return "conexao_possivel";
}

export const LABEL_TEXT: Record<MatchLabel, string> = {
  alta_compatibilidade: "Alta compatibilidade",
  boa_oportunidade: "Boa oportunidade",
  conexao_possivel: "Conexão possível",
};

/** Gera todos os matches candidatos entre `me` e uma lista de outros perfis. */
export function computeMatchesFor(
  me: Profile,
  others: Profile[],
): Omit<Match, "id" | "decisionA" | "decisionB">[] {
  const now = new Date().toISOString();
  const results: Omit<Match, "id" | "decisionA" | "decisionB">[] = [];
  for (const other of others) {
    if (other.id === me.id) continue;
    const forA = scorePerspective(me, other);
    const forB = scorePerspective(other, me);
    const { kind, hasSignal } = classifyKind(me, other);
    if (!hasSignal && forA.total < 5 && forB.total < 5) continue;
    const overall = Math.max(forA.total, forB.total);
    results.push({
      eventId: me.eventId,
      aProfileId: me.id,
      bProfileId: other.id,
      kind,
      scoreForA: forA.total,
      scoreForB: forB.total,
      label: classifyLabel(overall),
      reasonsForA: forA.reasons,
      reasonsForB: forB.reasons,
      createdAt: now,
      updatedAt: now,
    });
  }
  return results.sort((a, b) => b.scoreForA - a.scoreForA);
}
