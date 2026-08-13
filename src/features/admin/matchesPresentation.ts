import {
  DECISION_TEXT,
  KIND_TEXT,
  LABEL_TEXT,
  matchLabelForScore,
} from "@/features/matching/presentation";
import { CONNECTION_STATUS_LABEL } from "@/features/connections/domain";
import type { ConnectionStatus, Decision, MatchKind, MatchLabel } from "@/lib/types";

/** Classificação SEMPRE por perspectiva (Impl 1). Nunca a label global do match. */
export function sideLabelText(label: string | null | undefined, score: number) {
  const key = (label ?? matchLabelForScore(score)) as MatchLabel;
  return LABEL_TEXT[key] ?? key;
}

export function decisionText(d: string) {
  return DECISION_TEXT[d as Decision] ?? d;
}

export function kindText(k: string) {
  return KIND_TEXT[k as MatchKind] ?? k;
}

export function connectionStatusText(s: string) {
  return CONNECTION_STATUS_LABEL[s as ConnectionStatus] ?? s;
}

export function fmtDateTime(d: string | null | undefined) {
  if (!d) return "—";
  const date = new Date(d);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("pt-BR");
}
