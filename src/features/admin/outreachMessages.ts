/**
 * Motor de geração de mensagens de abordagem via WhatsApp para o SudoExpo Match.
 * Automatiza a comunicação personalizada da ACIRV com os participantes com base
 * nos dados do matcher e leituras comerciais geradas por IA.
 */

export interface OutreachParticipant {
  id: string;
  name: string;
  company?: string | null;
  segment?: string | null;
  decision?: string | null;
}

export interface OutreachReason {
  code: string;
  label: string;
  weight?: number;
}

export interface GenerateOutreachParams {
  target: OutreachParticipant;
  other: OutreachParticipant;
  isRecurrent: boolean;
  senderName?: string;
  customBenefit?: string | null;
  customJustification?: string | null;
  briefingSummary?: string | null;
  briefingSide?: string[] | null;
  reasons?: OutreachReason[];
}

export const DEFAULT_SENDER_NAME = "Kevyn, da comunicação da ACIRV";

/**
 * Normaliza o número de telefone removendo caracteres não numéricos e
 * garantindo o código DDI 55 (Brasil) para números válidos.
 */
export function cleanPhone(raw: string | null | undefined): string {
  if (!raw) return "";
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10 || digits.length === 11) {
    digits = `55${digits}`;
  }
  return digits;
}

/**
 * Constrói o link wa.me para abertura direta no WhatsApp.
 */
export function buildWhatsAppLink(phone: string, message: string): string {
  const cleaned = cleanPhone(phone);
  const encoded = encodeURIComponent(message.trim());
  return `https://wa.me/${cleaned}?text=${encoded}`;
}

/**
 * Extrai o primeiro nome de um participante para saudações mais amigáveis e naturais.
 */
export function getFirstName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return "Participante";
  const parts = trimmed.split(/\s+/);
  return parts[0] || trimmed;
}

/**
 * Resolve o benefício concreto e a justificativa comercial a partir
 * de IA (briefing), razões do matcher ou fallbacks robustos.
 */
export function resolveOutreachContent(params: {
  target: OutreachParticipant;
  other: OutreachParticipant;
  customBenefit?: string | null;
  customJustification?: string | null;
  briefingSummary?: string | null;
  briefingSide?: string[] | null;
  reasons?: OutreachReason[];
}): { benefit: string; justification: string } {
  // 1. Benefício
  let benefit = params.customBenefit?.trim() || "";
  if (!benefit && params.briefingSide && params.briefingSide.length > 0) {
    benefit = params.briefingSide.slice(0, 2).join("; ");
  }
  if (!benefit && params.reasons && params.reasons.length > 0) {
    benefit = params.reasons[0].label;
  }
  if (!benefit) {
    benefit = "parceria comercial direta e novas oportunidades de negócios";
  }

  // 2. Justificativa
  let justification = params.customJustification?.trim() || "";
  if (!justification && params.briefingSummary) {
    justification = params.briefingSummary;
  }
  if (!justification && params.reasons && params.reasons.length > 1) {
    justification = `alta sinergia comercial detectada em ${params.reasons.map((r) => r.label).slice(0, 2).join(" e ")}`;
  }
  if (!justification) {
    const otherSeg = params.other.segment ? ` no segmento de ${params.other.segment}` : "";
    justification = `sua empresa e a de ${getFirstName(params.other.name)}${otherSeg} têm grande compatibilidade entre o que oferecem e o que procuram`;
  }

  return { benefit, justification };
}

/**
 * Gera o texto da mensagem de abordagem para WhatsApp de acordo com as regras canônicas:
 * - 1º Contato: Apresentação formal da ACIRV e do SudoExpo Match com pergunta de fechamento.
 * - Contato Recorrente: Tom ágil e direto ("Sou eu aqui de novo, Kevyn...").
 */
export function generateOutreachMessage(params: GenerateOutreachParams): string {
  const targetFirstName = getFirstName(params.target.name);
  const otherName = params.other.name.trim();
  const otherCompany = params.other.company?.trim()
    ? `da ${params.other.company.trim()}`
    : "parceiro de negócios da feira";

  const senderName = params.senderName?.trim() || DEFAULT_SENDER_NAME;
  const { benefit, justification } = resolveOutreachContent(params);

  // Mensagem varia de acordo com o interesse já manifestado ou indicação da ACIRV
  const isInterestMarked = params.other.decision === "interesse";
  const partnerActionText = isInterestMarked
    ? `${otherName}, ${otherCompany}, demonstrou interesse em se conectar com você e pode entrar em contato.`
    : `${otherName}, ${otherCompany}, tem alta sinergia com seu perfil e pode entrar em contato contigo.`;

  if (params.isRecurrent) {
    return `Oi, ${targetFirstName}! Sou eu aqui de novo, ${senderName}. Encontrei mais uma oportunidade de conexão para você. ${partnerActionText} O que você pode ganhar com essa conexão: ${benefit}. Por que essa conexão faz sentido: ${justification}.`;
  }

  return `Oi, ${targetFirstName}! Como vai você? Aqui é o ${senderName}. Graças ao seu cadastro no SudoExpo Match, encontrei uma ótima oportunidade de negócio para você. ${partnerActionText} O que você pode ganhar com essa conexão: ${benefit}. Por que essa conexão faz sentido: ${justification}. Essa conexão faz sentido para você?`;
}
