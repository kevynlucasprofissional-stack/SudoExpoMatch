import type { EventCatalog } from "@/features/participant/types";
import { suggestionResultSchema } from "./schemas";
import type { SuggestionItem } from "./types";

export interface SuggestionProvider {
  suggest(input: {
    segmentId: string;
    summary: string;
    catalog: EventCatalog;
  }): Promise<{ items: SuggestionItem[] }>;
}

const KEYWORDS: Record<string, string[]> = {
  comercio: ["loja", "varejo", "comercio", "revenda"],
  industria: ["industria", "fabrica", "producao", "metal"],
  servicos: ["servico", "manutencao", "instalacao"],
  tecnologia: ["software", "sistema", "ti", "tecnologia", "automacao"],
  marketing: ["marketing", "design", "publicidade", "midia"],
  saude: ["saude", "clinica", "medic"],
  educacao: ["escola", "curso", "treinamento", "educ"],
  alimentacao: ["restaurante", "alimento", "refeicao"],
  agro: ["agro", "rural", "fazenda"],
  construcao: ["construcao", "obra", "engenharia"],
  financas: ["contabil", "financas", "banco", "credito"],
  logistica: ["transporte", "logistica", "entrega"],
  consultoria: ["consultoria", "consultor"],
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

/**
 * Provedor heurístico determinístico. Devolve APENAS itens cujo
 * `taxonomyItemId` existe no catálogo real recebido; caso não haja
 * correspondência, retorna `taxonomyItemId: null` (será tratado como
 * "Outro" pelo wizard). NUNCA cria segmentos ou itens fora do catálogo.
 */
export const heuristicSuggestionProvider: SuggestionProvider = {
  async suggest({ segmentId, summary, catalog }) {
    await new Promise((r) => setTimeout(r, 0));
    const items: SuggestionItem[] = [];
    const validIds = new Set(catalog.taxonomy.map((t) => t.id));
    const summaryNorm = norm(summary);

    // Ofertas: primeiros itens do catálogo para o segmento (offer|both)
    const segTax = catalog.taxonomy.filter(
      (t) => t.segmentId === segmentId || t.segment_id === segmentId,
    );
    const segOffers = segTax.filter((t) => t.kind === "offer" || t.kind === "both");
    for (const t of segOffers.slice(0, 5)) {
      items.push({
        taxonomyItemId: validIds.has(t.id) ? t.id : null,
        label: t.label,
        kind: "offer",
        confidence: 0.6,
      });
    }

    // Necessidades: itens `need|both` que combinam com palavras-chave do resumo
    const words = new Set(summaryNorm.split(/[^a-z0-9]+/).filter(Boolean));
    const segNeeds = segTax.filter((t) => t.kind === "need" || t.kind === "both");
    for (const t of segNeeds) {
      const nLabel = norm(t.label);
      const kw = KEYWORDS[segmentId] ?? [];
      const matches =
        kw.some((k) => summaryNorm.includes(k)) ||
        Array.from(words).some((w) => nLabel.includes(w));
      if (matches && items.filter((i) => i.kind === "need").length < 3) {
        items.push({
          taxonomyItemId: validIds.has(t.id) ? t.id : null,
          label: t.label,
          kind: "need",
          confidence: 0.5,
        });
      }
    }

    const validated = suggestionResultSchema.parse({ items });
    return validated;
  },
};

/** Auxiliar para acessar o campo do catálogo em compat com `segment_id`. */
declare module "@/features/participant/types" {
  interface CatalogTaxonomyItem {
    segmentId?: string; // compat
  }
}
