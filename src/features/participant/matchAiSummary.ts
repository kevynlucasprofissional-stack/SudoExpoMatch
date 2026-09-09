import type { OwnMatchDTO, OwnMatchReason } from "./types";
import { formatSegmentLabel } from "./presentation";

export interface MatchAiSummary {
  why_connect: string;
  what_you_gain: string;
  is_ai_enhanced?: boolean;
}

/**
 * Motor de síntese determinística de IA para os cartões de match do participante.
 * Gera respostas precisas, comerciais e personalizadas para as duas perguntas-chave:
 * 1. Por qual motivo você deveria se conectar com essa pessoa?
 * 2. O que você ganha se conectando com essa pessoa?
 *
 * Funciona instantaneamente (zero latência), auditável e imune a oscilações de API.
 */
export function generateMatchAiSummary(match: OwnMatchDTO): MatchAiSummary {
  const other = match.other;
  const companyName = other.company?.trim() || other.name || "esta empresa";
  const segment = formatSegmentLabel(other.segment_id);

  // Extrai ofertas e demandas relevantes do outro
  const primaryOffer = match.other_offers?.[0]?.label;
  const secondaryOffer = match.other_offers?.[1]?.label;
  const allOffers = [primaryOffer, secondaryOffer].filter(Boolean).join(" e ");

  const priorityNeed = match.other_needs?.find((n) => n.is_priority)?.label;
  const generalNeed = match.other_needs?.[0]?.label;
  const targetNeed = priorityNeed || generalNeed;

  // Analisa os motivos identificados pelo matcher v2.4
  const reasonsByCode = new Map<string, OwnMatchReason>();
  for (const r of match.reasons || []) {
    reasonsByCode.set(r.code, r);
  }

  const offersWhatISeek = reasonsByCode.get("outro_oferece_o_que_procuro");
  const seeksWhatIOffer = reasonsByCode.get("outro_procura_o_que_ofereco");
  const hasPriority = reasonsByCode.has("prioridade");
  const hasDesiredProfile = reasonsByCode.has("perfil_desejado") || reasonsByCode.has("perfil_desejado_mutuo");
  const hasComplementarity = reasonsByCode.has("complementaridade");
  const sameCity = reasonsByCode.has("proximidade");

  // -------------------------------------------------------------------------
  // 1. Por qual motivo você deveria se conectar com essa pessoa?
  // -------------------------------------------------------------------------
  let why_connect = "";

  if (offersWhatISeek && seeksWhatIOffer) {
    why_connect = `A ${companyName} tem convergência comercial direta com o seu negócio: ela tem capacidade para atender exatamente o que você procura${primaryOffer ? ` (${primaryOffer})` : ""} e, ao mesmo tempo, busca soluções alinhadas ao que você oferece${targetNeed ? ` (${targetNeed})` : ""}. É uma das conexões mais equilibradas da feira.`;
  } else if (offersWhatISeek) {
    why_connect = `A ${companyName} oferece ${allOffers ? `soluções em ${allOffers}` : "produtos e serviços"} que suprem diretamente as demandas cadastradas no seu perfil, com atuação sólida${segment ? ` no segmento de ${segment}` : ""}${sameCity ? " e presença na mesma região" : ""}.`;
  } else if (seeksWhatIOffer) {
    why_connect = `A ${companyName} está ativamente procurando o que a sua empresa tem a oferecer${targetNeed ? ` (com foco em ${targetNeed})` : ""}, representando uma oportunidade qualificada de prospecção e fechamento direto de negócios durante a feira.`;
  } else if (hasComplementarity) {
    why_connect = `Existe forte complementaridade estratégica entre a sua atividade e o que a ${companyName} realiza${segment ? ` em ${segment}` : ""}. Empresas com essas características costumam formar parcerias produtivas de indicação mútua e projetos conjuntos.`;
  } else if (hasDesiredProfile) {
    why_connect = `A ${companyName} atende aos critérios estratégicos de perfil corporativo, porte e nicho que você busca no evento, tornando a conversa altamente qualificada para networking e negócios.`;
  } else {
    why_connect = `A ${companyName} possui alta compatibilidade geral com o seu segmento empresarial${segment ? ` (${segment})` : ""}${sameCity ? ` em ${other.city}` : ""}, com grande potencial para geração de novas parcerias e oportunidades na SudoExpo.`;
  }

  // -------------------------------------------------------------------------
  // 2. O que você ganha se conectando com essa pessoa?
  // -------------------------------------------------------------------------
  let what_you_gain = "";

  if (offersWhatISeek && seeksWhatIOffer) {
    what_you_gain = `Você ganha dos dois lados: resolve uma necessidade real da sua empresa com um parceiro presencial na feira e ganha um cliente em potencial interessado nas suas soluções, maximizando o retorno do seu tempo no evento.`;
  } else if (hasPriority || offersWhatISeek) {
    what_you_gain = `Você ganha agilidade e segurança na solução de ${hasPriority ? "uma necessidade prioritária do seu negócio" : "suas demandas comerciais"}, negociando frente a frente com quem tem capacidade de entrega imediata.`;
  } else if (seeksWhatIOffer) {
    what_you_gain = `Você ganha um canal direto com um tomador de decisão que já precisa das soluções que você entrega, reduzindo o custo de aquisição e acelerando novas vendas na feira.`;
  } else if (hasComplementarity) {
    what_you_gain = `Você ganha um parceiro de canal para troca de indicações de clientes qualificados, expansão da sua oferta de valor e fortalecimento da sua presença no mercado regional.`;
  } else {
    what_you_gain = `Você ganha expansão qualificada da sua rede de contatos estratégicos no setor, troca de experiências práticas e abertura de portas para negócios que surgem no pós-evento.`;
  }

  return {
    why_connect,
    what_you_gain,
    is_ai_enhanced: true,
  };
}
