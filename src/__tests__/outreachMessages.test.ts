import { describe, expect, it } from "vitest";
import {
  cleanPhone,
  buildWhatsAppLink,
  getFirstName,
  generateOutreachMessage,
} from "@/features/admin/outreachMessages";

describe("outreachMessages helper", () => {
  it("cleans phone numbers and formats for Brazilian WhatsApp", () => {
    expect(cleanPhone("(64) 99247-0988")).toBe("5564992470988");
    expect(cleanPhone("64992470988")).toBe("5564992470988");
    expect(cleanPhone("+55 64 99247-0988")).toBe("5564992470988");
    expect(cleanPhone("064992470988")).toBe("5564992470988");
  });

  it("extracts first name gracefully", () => {
    expect(getFirstName("Kevyn Lucas")).toBe("Kevyn");
    expect(getFirstName("Ana")).toBe("Ana");
    expect(getFirstName("   Maria Santos   ")).toBe("Maria");
    expect(getFirstName("")).toBe("Participante");
  });

  it("builds valid wa.me URL with encoded text", () => {
    const link = buildWhatsAppLink("64992470988", "Oi, Kevyn! Tudo bem?");
    expect(link).toBe("https://wa.me/5564992470988?text=Oi%2C%20Kevyn!%20Tudo%20bem%3F");
  });

  it("generates 1st contact message with exact required structure", () => {
    const msg = generateOutreachMessage({
      target: { id: "1", name: "Bruna Silva", company: "Silva Modas" },
      other: { id: "2", name: "Carlos Souza", company: "Souza Tecidos", decision: "interesse" },
      isRecurrent: false,
      customBenefit: "preços diferenciados de fábrica e prazo estendido",
      customJustification: "você procura fornecedor de tecidos e Carlos é fabricante regional",
    });

    expect(msg).toContain("Oi, Bruna! Como vai você? Aqui é o Kevyn, da comunicação da ACIRV.");
    expect(msg).toContain("Graças ao seu cadastro no SudoExpo Match, encontrei uma ótima oportunidade de negócio para você.");
    expect(msg).toContain("Carlos Souza, da Souza Tecidos, demonstrou interesse em se conectar com você");
    expect(msg).toContain("O que você pode ganhar com essa conexão: preços diferenciados de fábrica e prazo estendido.");
    expect(msg).toContain("Por que essa conexão faz sentido: você procura fornecedor de tecidos e Carlos é fabricante regional.");
    expect(msg).toContain("Essa conexão faz sentido para você?");
  });

  it("generates recurrent contact message with concise structure", () => {
    const msg = generateOutreachMessage({
      target: { id: "1", name: "Bruna Silva", company: "Silva Modas" },
      other: { id: "3", name: "Daniel Rocha", company: "Rocha Logística", decision: "interesse" },
      isRecurrent: true,
      customBenefit: "frete com desconto para a sua região",
      customJustification: "otimização da sua malha de entrega",
    });

    expect(msg).toContain("Oi, Bruna! Sou eu aqui de novo, Kevyn, da comunicação da ACIRV.");
    expect(msg).toContain("Encontrei mais uma oportunidade de conexão para você.");
    expect(msg).toContain("Daniel Rocha, da Rocha Logística, demonstrou interesse em se conectar com você");
    expect(msg).toContain("O que você pode ganhar com essa conexão: frete com desconto para a sua região.");
    expect(msg).toContain("Por que essa conexão faz sentido: otimização da sua malha de entrega.");
    expect(msg).not.toContain("Essa conexão faz sentido para você?");
  });

  it("uses AI briefing and matcher reasons when custom text is omitted", () => {
    const msg = generateOutreachMessage({
      target: { id: "1", name: "Paula Prado" },
      other: { id: "2", name: "Lucas Lima", company: "Lima Tech", decision: "interesse" },
      isRecurrent: false,
      briefingSide: ["Redução de custos operacionais com novo software", "Suporte local prioritário"],
      briefingSummary: "A Lima Tech desenvolve sistemas sob medida para o setor da Paula.",
    });

    expect(msg).toContain("Oi, Paula!");
    expect(msg).toContain("Lucas Lima, da Lima Tech");
    expect(msg).toContain("Redução de custos operacionais com novo software; Suporte local prioritário");
    expect(msg).toContain("A Lima Tech desenvolve sistemas sob medida para o setor da Paula.");
  });
});
