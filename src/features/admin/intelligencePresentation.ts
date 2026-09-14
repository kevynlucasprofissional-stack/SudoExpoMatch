import {
  HIGH_SCORE_MIN,
  LOW_SCORE_MAX,
  SCORE_BUCKETS,
  SMALL_SAMPLE_N,
  type IntelligenceBehavior,
  type IntelligenceMatcher,
  type IntelligenceOverview,
  type IntelligenceTaxonomy,
  type KindRow,
  type MatrixCell,
  type OverviewBucket,
  type ReasonLiftRow,
  type ScoreBucket,
} from "@/features/admin/intelligenceSchemas";

/**
 * IMPL 29 — camada de apresentação PURA do SudoExpo Intelligence.
 *
 * Tudo aqui é função determinística sobre o payload das RPCs: nenhuma
 * consulta, nenhum estado. É este módulo que os testes exercitam.
 *
 * Invariantes:
 * - taxa só existe com denominador; denominador 0 ⇒ `null` (nunca 0%);
 * - `sem_decisao` já não chega aqui (filtrado no SQL) e jamais é rejeição;
 * - "amostra pequena" é sinalizada, não escondida.
 */

export interface Rate {
  /** percentual 0–100 com 1 decimal, ou null quando não há denominador */
  pct: number | null;
  numerator: number;
  denominator: number;
  smallSample: boolean;
}

export function rate(numerator: number, denominator: number): Rate {
  const safeDen = Math.max(0, Math.trunc(denominator));
  const safeNum = Math.max(0, Math.trunc(numerator));
  return {
    pct: safeDen > 0 ? Math.round((safeNum / safeDen) * 1000) / 10 : null,
    numerator: safeNum,
    denominator: safeDen,
    smallSample: safeDen > 0 && safeDen < SMALL_SAMPLE_N,
  };
}

export function formatRate(r: Rate): string {
  return r.pct === null ? "—" : `${r.pct.toFixed(1)}%`;
}

export function formatPp(value: number | null): string {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)} pp`;
}

/** Taxa de interesse entre DECISÕES registradas (sem `sem_decisao`). */
export function interestRate(o: IntelligenceOverview): Rate {
  return rate(o.interests, o.decisions_total);
}

export const BUCKET_LABEL: Record<ScoreBucket, string> = {
  "0-19": "0–19",
  "20-39": "20–39",
  "40-59": "40–59",
  "60-74": "60–74",
  "75+": "75+",
};

/** Ordena e completa os buckets ausentes com zeros (eixo estável no gráfico). */
export function scoreBucketRows(o: IntelligenceOverview) {
  const found = new Map<string, OverviewBucket>(o.score_buckets.map((b) => [b.bucket, b]));
  return SCORE_BUCKETS.map((bucket) => {
    const b = found.get(bucket);
    const all = rate(b?.interests ?? 0, b?.decisions ?? 0);
    const selective = rate(b?.selective_interests ?? 0, b?.selective_decisions ?? 0);
    return {
      bucket,
      label: BUCKET_LABEL[bucket],
      decisions: b?.decisions ?? 0,
      interests: b?.interests ?? 0,
      selectiveDecisions: b?.selective_decisions ?? 0,
      selectiveInterests: b?.selective_interests ?? 0,
      all,
      selective,
      allPct: all.pct ?? 0,
      selectivePct: selective.pct ?? 0,
    };
  });
}

export interface SignalGap {
  high: Rate;
  low: Rate;
  /** diferença em pontos percentuais; null se algum lado não tem denominador */
  gapPp: number | null;
  smallSample: boolean;
}

/**
 * Selective Signal Gap: o matcher está separando bom de ruim para quem
 * de fato escolhe? Taxa de interesse de seletivos em score alto menos a
 * de seletivos em score baixo.
 */
export function selectiveSignalGap(o: IntelligenceOverview): SignalGap {
  const high = rate(o.selective_high.interests, o.selective_high.decisions);
  const low = rate(o.selective_low.interests, o.selective_low.decisions);
  const gapPp =
    high.pct === null || low.pct === null ? null : Math.round((high.pct - low.pct) * 10) / 10;
  return { high, low, gapPp, smallSample: high.smallSample || low.smallSample };
}

export const SIGNAL_GAP_DESCRIPTION =
  `Taxa de interesse de participantes seletivos em score ≥ ${HIGH_SCORE_MIN} menos a taxa em score < ${LOW_SCORE_MAX}. ` +
  "Quanto maior, mais o score está separando boas de más sugestões para quem realmente escolhe.";

/** Quanto do interesse de score baixo vem de quem aceita tudo. */
export function lowScoreNoiseShare(o: IntelligenceOverview): Rate {
  return rate(o.low_score_interests.permissive_strong, o.low_score_interests.total);
}

export function lowScoreComposition(o: IntelligenceOverview) {
  const l = o.low_score_interests;
  return [
    { key: "permissive_strong", label: "Permissivos fortes", value: l.permissive_strong },
    { key: "selective", label: "Seletivos", value: l.selective },
    { key: "other", label: "Outros (pouca amostra)", value: l.other },
  ].map((row) => ({ ...row, share: rate(row.value, l.total) }));
}

export function taxonomyCoverage(o: IntelligenceOverview) {
  return {
    needs: rate(o.taxonomy.needs_canonical, o.taxonomy.needs_total),
    offers: rate(o.taxonomy.offers_canonical, o.taxonomy.offers_total),
  };
}

/**
 * Snapshot drift: decisões cujo match foi regerado DEPOIS da decisão.
 * Sinal de integridade histórica — não é erro causal comprovado.
 */
export function snapshotDrift(o: IntelligenceOverview): Rate {
  return rate(o.snapshot.drift, o.snapshot.decisions);
}

export const SNAPSHOT_DRIFT_DESCRIPTION =
  "Decisões cujo match atual foi gerado depois do momento da decisão. Indica que o score/razões exibidos hoje podem não ser os que a pessoa viu. É sinal de integridade, não prova de causa.";

export function outcomesCoverage(o: IntelligenceOverview): Rate {
  return rate(o.outcomes.connections_with_outcome, o.connections.total);
}

/** Ground truth só é utilizável com amostra mínima de resultados fortes. */
export function groundTruthStatus(o: IntelligenceOverview): {
  sufficient: boolean;
  message: string;
} {
  const cov = outcomesCoverage(o);
  if (o.outcomes.total === 0) {
    return {
      sufficient: false,
      message:
        "Ground truth ainda insuficiente: nenhum resultado comercial forte registrado neste evento. Conexões concluídas medem operação, não valor gerado.",
    };
  }
  if (cov.denominator === 0 || (cov.pct ?? 0) < 10) {
    return {
      sufficient: false,
      message:
        "Ground truth ainda insuficiente: poucos resultados fortes registrados para sustentar conclusões de qualidade do match.",
    };
  }
  return { sufficient: true, message: "Cobertura de resultados suficiente para leitura inicial." };
}

// ---------------------------------------------------------------- Matcher Lab

export type MatrixMetric = "matches" | "mutual" | "connections";

export const MATRIX_METRIC_LABEL: Record<MatrixMetric, string> = {
  matches: "Volume de matches",
  mutual: "Interesse mútuo",
  connections: "Com conexão",
};

export interface MatrixGrid {
  buckets: readonly ScoreBucket[];
  cells: {
    bucketA: ScoreBucket;
    bucketB: ScoreBucket;
    matches: number;
    mutual: number;
    connections: number;
    value: number;
    /** 0–1 para intensidade de cor */
    intensity: number;
  }[];
  max: number;
}

export function scoreMatrix(m: IntelligenceMatcher, metric: MatrixMetric): MatrixGrid {
  const byKey = new Map<string, MatrixCell>();
  for (const c of m.score_matrix) byKey.set(`${c.bucket_a}|${c.bucket_b}`, c);

  const cells: MatrixGrid["cells"] = [];
  let max = 0;
  for (const bucketA of SCORE_BUCKETS) {
    for (const bucketB of SCORE_BUCKETS) {
      const c = byKey.get(`${bucketA}|${bucketB}`);
      const value = c ? c[metric] : 0;
      if (value > max) max = value;
      cells.push({
        bucketA,
        bucketB,
        matches: c?.matches ?? 0,
        mutual: c?.mutual ?? 0,
        connections: c?.connections ?? 0,
        value,
        intensity: 0,
      });
    }
  }
  for (const cell of cells) cell.intensity = max > 0 ? cell.value / max : 0;
  return { buckets: SCORE_BUCKETS, cells, max };
}

export type ReasonCohort = "all" | "selective";

export const REASON_LABEL: Record<string, string> = {
  outro_oferece_o_que_procuro: "O outro oferece o que eu procuro",
  outro_procura_o_que_ofereco: "O outro procura o que eu ofereço",
  prioridade: "Necessidade prioritária atendida",
  complementaridade: "Relação complementar (taxonomia)",
  perfil_desejado: "Perfil desejado",
  perfil_desejado_mutuo: "Perfil desejado mútuo",
  atualidade: "Perfil atualizado recentemente",
  proximidade: "Mesma cidade",
};

export function reasonLabel(code: string): string {
  return REASON_LABEL[code] ?? code;
}

export interface ReasonLiftView {
  code: string;
  label: string;
  withRate: Rate;
  withoutRate: Rate;
  liftPp: number | null;
  smallSample: boolean;
}

export function reasonLiftRows(
  m: IntelligenceMatcher,
  cohort: ReasonCohort = "all",
): ReasonLiftView[] {
  const pick = (r: ReasonLiftRow) =>
    cohort === "selective"
      ? {
          nWith: r.selective_n_with,
          iWith: r.selective_interests_with,
          nWithout: r.selective_n_without,
          iWithout: r.selective_interests_without,
        }
      : {
          nWith: r.n_with,
          iWith: r.interests_with,
          nWithout: r.n_without,
          iWithout: r.interests_without,
        };

  return m.reason_lift
    .map((r) => {
      const p = pick(r);
      const withRate = rate(p.iWith, p.nWith);
      const withoutRate = rate(p.iWithout, p.nWithout);
      const liftPp =
        withRate.pct === null || withoutRate.pct === null
          ? null
          : Math.round((withRate.pct - withoutRate.pct) * 10) / 10;
      return {
        code: r.code,
        label: reasonLabel(r.code),
        withRate,
        withoutRate,
        liftPp,
        smallSample: withRate.smallSample || withoutRate.smallSample,
      };
    })
    .sort((a, b) => (b.liftPp ?? -Infinity) - (a.liftPp ?? -Infinity));
}

export const REASON_LIFT_DISCLAIMER =
  "Lift é associação observada, não causalidade: mostra a diferença de taxa de interesse entre decisões que tinham e não tinham aquele sinal.";

export const KIND_LABEL: Record<string, string> = {
  direto: "Direto",
  inverso: "Inverso",
  bidirecional: "Bidirecional",
  complementar: "Complementar",
  hibrido: "Híbrido",
  perfil_desejado: "Perfil desejado",
};

export function kindLabel(kind: string): string {
  return KIND_LABEL[kind] ?? kind;
}

export function kindRows(m: IntelligenceMatcher) {
  return m.kinds
    .map((k: KindRow) => ({
      kind: k.kind,
      label: kindLabel(k.kind),
      matches: k.matches,
      decisions: k.decisions,
      interests: k.interests,
      all: rate(k.interests, k.decisions),
      selective: rate(k.selective_interests, k.selective_decisions),
    }))
    .sort((a, b) => (b.all.pct ?? -1) - (a.all.pct ?? -1));
}

// --------------------------------------------------------------- Behavior Lab

export function propensityRows(b: IntelligenceBehavior) {
  const found = new Map(b.propensity_histogram.map((h) => [h.bucket, h]));
  return ["0-10%", "10-25%", "25-50%", "50-75%", "75-90%", "90-100%"].map((bucket) => ({
    bucket,
    participants: found.get(bucket)?.participants ?? 0,
    decisions: found.get(bucket)?.decisions ?? 0,
  }));
}

export function behaviorScatterPoints(b: IntelligenceBehavior) {
  return b.participants
    .filter((p) => p.avg_accepted_score !== null)
    .map((p) => ({
      profileId: p.profile_id,
      name: p.name,
      company: p.company,
      x: p.propensity_pct,
      y: p.avg_accepted_score as number,
      decisions: p.decisions,
      selective: p.selective,
      permissiveStrong: p.permissive_strong,
    }));
}

/** Ranking usado quando o scatter tem pouca densidade. */
export function behaviorRanking(b: IntelligenceBehavior, limit = 15) {
  return [...b.participants]
    .sort((x, y) => y.decisions - x.decisions || y.propensity_pct - x.propensity_pct)
    .slice(0, limit);
}

export function cohortBadge(p: {
  selective: boolean;
  permissive_strong: boolean;
  all_interest_small_sample: boolean;
}): { label: string; tone: "selective" | "permissive" | "small" | "neutral" } {
  if (p.selective) return { label: "Seletivo", tone: "selective" };
  if (p.permissive_strong) return { label: "Permissivo forte", tone: "permissive" };
  if (p.all_interest_small_sample) return { label: "100% interesse (pouca amostra)", tone: "small" };
  return { label: "—", tone: "neutral" };
}

// ------------------------------------------------------- Taxonomy Intelligence

export function taxonomySideRows(t: IntelligenceTaxonomy) {
  const label: Record<string, string> = { need: "Necessidades", offer: "Ofertas" };
  return t.coverage.map((c) => ({
    side: c.side,
    label: label[c.side] ?? c.side,
    total: c.total,
    canonical: c.canonical,
    freeText: Math.max(0, c.total - c.canonical),
    coverage: rate(c.canonical, c.total),
  }));
}

export function taxonomySourceRows(t: IntelligenceTaxonomy) {
  return t.by_source
    .map((r) => ({ ...r, coverage: rate(r.canonical, r.total) }))
    .sort((a, b) => b.total - a.total);
}

export function taxonomySegmentRows(t: IntelligenceTaxonomy) {
  return t.by_segment
    .map((r) => ({ ...r, coverage: rate(r.canonical, r.total) }))
    .sort((a, b) => (a.coverage.pct ?? 101) - (b.coverage.pct ?? 101) || b.total - a.total);
}

export const OBSERVED_OPPORTUNITY_NOTE =
  "Oportunidade observada = frequência × participantes distintos. É demanda repetida sem item canônico — não é potencial de match calculado.";

export function isEmptyState(n: number): boolean {
  return n <= 0;
}

export const NO_DATA_LABEL = "Dados insuficientes";
