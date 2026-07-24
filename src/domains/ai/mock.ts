// Adaptador de IA — no primeiro build usa heurística determinística local.
// Contrato pronto para ser trocado por uma Edge Function que retorne o mesmo JSON.

import { SEGMENTS, TAXONOMY } from "@/lib/mock-data";
import type { NeedKind } from "@/lib/types";

export interface AISuggestion {
  segmentIds: string[];
  offers: string[];
  needs: { kind: NeedKind; label: string }[];
  rationale: string;
}

const KEYWORDS: Record<string, string> = {
  loja: "comercio",
  varejo: "comercio",
  comercio: "comercio",
  industria: "industria",
  fabrica: "industria",
  producao: "industria",
  servico: "servicos",
  manutencao: "servicos",
  software: "tecnologia",
  ti: "tecnologia",
  tecnologia: "tecnologia",
  marketing: "marketing",
  design: "marketing",
  publicidade: "marketing",
  saude: "saude",
  clinica: "saude",
  escola: "educacao",
  curso: "educacao",
  treinamento: "educacao",
  restaurante: "alimentacao",
  alimento: "alimentacao",
  agro: "agro",
  rural: "agro",
  construcao: "construcao",
  obra: "construcao",
  contabil: "financas",
  financas: "financas",
  banco: "financas",
  transporte: "logistica",
  logistica: "logistica",
  consultoria: "consultoria",
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

export async function suggestFromSummary(
  summary: string,
): Promise<AISuggestion> {
  // Simula latência para permitir estados de loading reais.
  await new Promise((r) => setTimeout(r, 450));
  const words = norm(summary).split(/[^a-z0-9]+/).filter(Boolean);
  const scores: Record<string, number> = {};
  for (const w of words) {
    for (const k in KEYWORDS) {
      if (w.includes(k)) scores[KEYWORDS[k]] = (scores[KEYWORDS[k]] ?? 0) + 1;
    }
  }
  const ranked = Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);
  const segmentIds = ranked.slice(0, 2);
  const fallback = segmentIds.length ? segmentIds : [SEGMENTS[2].id];

  const offers = TAXONOMY.filter((t) => fallback.includes(t.segmentId))
    .slice(0, 5)
    .map((t) => t.label);

  const needs: AISuggestion["needs"] = [
    { kind: "compradores", label: "Compradores para meus produtos/serviços" },
    { kind: "parceiro", label: "Parceiros locais" },
    { kind: "fornecedor", label: "Fornecedores confiáveis" },
  ];

  return {
    segmentIds: fallback,
    offers,
    needs,
    rationale:
      "Sugestão baseada em palavras-chave do seu resumo. Você pode aceitar, editar ou remover cada item.",
  };
}
