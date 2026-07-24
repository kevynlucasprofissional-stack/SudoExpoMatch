import type { Segment, TaxonomyItem } from "./types";

export const EVENT_ID = "sudoexpo-2026";
export const EVENT_NAME = "SudoExpo 2026";

export const SEGMENTS: Segment[] = [
  { id: "comercio", label: "Comércio", emoji: "🛍️" },
  { id: "industria", label: "Indústria", emoji: "🏭" },
  { id: "servicos", label: "Serviços", emoji: "🛠️" },
  { id: "tecnologia", label: "Tecnologia", emoji: "💻" },
  { id: "marketing", label: "Marketing e Comunicação", emoji: "📣" },
  { id: "saude", label: "Saúde", emoji: "🩺" },
  { id: "educacao", label: "Educação", emoji: "🎓" },
  { id: "alimentacao", label: "Alimentação", emoji: "🍽️" },
  { id: "agro", label: "Agronegócio", emoji: "🌱" },
  { id: "construcao", label: "Construção", emoji: "🏗️" },
  { id: "financas", label: "Finanças", emoji: "💳" },
  { id: "logistica", label: "Logística", emoji: "🚚" },
  { id: "consultoria", label: "Consultoria", emoji: "🧭" },
];

const t = (
  segmentId: string,
  label: string,
  kind: "offer" | "need" = "offer",
): TaxonomyItem => ({
  id: `${segmentId}:${label.toLowerCase().replace(/\s+/g, "-")}:${kind}`,
  segmentId,
  label,
  kind,
});

export const TAXONOMY: TaxonomyItem[] = [
  // Comércio
  t("comercio", "Revenda de produtos"),
  t("comercio", "Loja física"),
  t("comercio", "E-commerce"),
  t("comercio", "Atacado"),
  // Indústria
  t("industria", "Fabricação sob demanda"),
  t("industria", "Produção em escala"),
  t("industria", "Embalagens"),
  t("industria", "Metalurgia"),
  // Serviços
  t("servicos", "Manutenção"),
  t("servicos", "Instalação"),
  t("servicos", "Terceirização"),
  t("servicos", "Limpeza"),
  // Tecnologia
  t("tecnologia", "Desenvolvimento de software"),
  t("tecnologia", "Suporte técnico"),
  t("tecnologia", "Automação"),
  t("tecnologia", "Infraestrutura de TI"),
  // Marketing
  t("marketing", "Gestão de redes sociais"),
  t("marketing", "Design gráfico"),
  t("marketing", "Tráfego pago"),
  t("marketing", "Produção audiovisual"),
  // Saúde
  t("saude", "Consultório"),
  t("saude", "Equipamentos médicos"),
  t("saude", "Bem-estar corporativo"),
  // Educação
  t("educacao", "Cursos livres"),
  t("educacao", "Treinamento corporativo"),
  t("educacao", "Educação técnica"),
  // Alimentação
  t("alimentacao", "Restaurante"),
  t("alimentacao", "Fornecimento de refeições"),
  t("alimentacao", "Insumos alimentícios"),
  // Agro
  t("agro", "Insumos agrícolas"),
  t("agro", "Máquinas agrícolas"),
  t("agro", "Consultoria rural"),
  // Construção
  t("construcao", "Materiais de construção"),
  t("construcao", "Projetos e obras"),
  t("construcao", "Instalações elétricas"),
  // Finanças
  t("financas", "Contabilidade"),
  t("financas", "Crédito empresarial"),
  t("financas", "Meios de pagamento"),
  // Logística
  t("logistica", "Transporte de cargas"),
  t("logistica", "Armazenagem"),
  t("logistica", "Última milha"),
  // Consultoria
  t("consultoria", "Gestão empresarial"),
  t("consultoria", "Jurídica"),
  t("consultoria", "RH e pessoas"),
];

export const NEED_KIND_LABELS: Record<string, string> = {
  servico: "Um serviço",
  fornecedor: "Um fornecedor",
  parceiro: "Um parceiro",
  compradores: "Compradores",
  distribuidores: "Distribuidores",
  profissionais: "Profissionais",
  produtos: "Produtos",
  outro: "Outro",
};
