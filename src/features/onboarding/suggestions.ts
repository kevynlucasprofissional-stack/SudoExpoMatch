import type { EventCatalog } from "@/features/participant/types";
import { suggestionResultSchema } from "./schemas";
import type { SuggestionItem } from "./types";
import type { NeedKind } from "@/lib/types";

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

/**
 * IMPL 6 — classificação determinística do tipo de necessidade a partir do
 * significado do label. Usada pelo fallback heurístico para NUNCA herdar o
 * tipo selecionado na UI. Sem regra aplicável => "outro".
 */
const NEED_KIND_RULES: Array<{ kind: NeedKind; terms: string[] }> = [
  {
    kind: "fornecedor",
    terms: ["fornecedor", "fornecimento", "insumo", "materia prima", "embalagem"],
  },
  {
    kind: "distribuidores",
    terms: ["distribuidor", "distribuicao", "revendedor", "representante comercial"],
  },
  { kind: "compradores", terms: ["comprador", "cliente", "clientes", "lead", "novos negocios"] },
  {
    kind: "profissionais",
    terms: ["profissional", "profissionais", "mao de obra", "contratar equipe", "vaga", "talento"],
  },
  { kind: "parceiro", terms: ["parceiro", "parceria", "coworking", "joint venture"] },
  {
    kind: "produtos",
    terms: ["comprar produto", "equipamento", "maquina", "mercadoria", "produto"],
  },
  {
    kind: "servico",
    terms: [
      "servico",
      "consultoria",
      "contabil",
      "contabilidade",
      "marketing",
      "assessoria",
      "manutencao",
      "suporte",
      "software",
      "sistema",
      "logistica",
      "transporte",
      "juridico",
      "design",
    ],
  },
];

export function inferNeedKind(label: string): NeedKind {
  const n = norm(label);
  for (const rule of NEED_KIND_RULES) {
    if (rule.terms.some((t) => n.includes(t))) return rule.kind;
  }
  return "outro";
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

/**
 * Provedor heurístico determinístico sobre o catálogo REAL do banco.
 * - `taxonomyItemId` só é preenchido quando o item existe no catálogo recebido.
 * - Itens sem correspondência viram `taxonomyItemId: null` ("Outro").
 * - Nunca cria segmentos/itens fora do catálogo.
 * - Falha na sugestão não deve bloquear o wizard (a rota captura).
 */
export const heuristicSuggestionProvider: SuggestionProvider = {
  async suggest({ segmentId, summary, catalog }) {
    await new Promise((r) => setTimeout(r, 0));
    const items: SuggestionItem[] = [];
    const validIds = new Set(catalog.taxonomy.map((t) => t.id));
    const summaryNorm = norm(summary);

    const segTax = catalog.taxonomy.filter((t) => t.segment_id === segmentId);
    const segOffers = segTax.filter((t) => t.kind === "offer" || t.kind === "both");
    for (const t of segOffers.slice(0, 5)) {
      items.push({
        taxonomyItemId: validIds.has(t.id) ? t.id : null,
        label: t.label,
        kind: "offer",
        confidence: 0.6,
      });
    }

    const words = new Set(summaryNorm.split(/[^a-z0-9]+/).filter(Boolean));
    const segNeeds = segTax.filter((t) => t.kind === "need" || t.kind === "both");
    for (const t of segNeeds) {
      if (items.filter((i) => i.kind === "need").length >= 3) break;
      const nLabel = norm(t.label);
      const kw = KEYWORDS[segmentId] ?? [];
      const hits =
        kw.some((k) => summaryNorm.includes(k)) ||
        Array.from(words).some((w) => w.length > 3 && nLabel.includes(w));
      if (hits) {
        items.push({
          taxonomyItemId: validIds.has(t.id) ? t.id : null,
          label: t.label,
          kind: "need",
          confidence: 0.5,
        });
      }
    }

    return suggestionResultSchema.parse({ items });
  },
};
