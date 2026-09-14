import { z } from "zod";

/**
 * IMPL 31 — mensageria participant-centric.
 *
 * Gerador PURO da mensagem de WhatsApp que a equipe/admin envia para UM
 * participante (não para uma dupla). Blocos são condicionais: nada é dito
 * sem dado real por trás.
 *
 * Regras invioláveis:
 * - nunca afirmar que alguém demonstrou interesse sem `incoming_interests`;
 * - conexão liberada sem decisão `interesse` do próprio participante usa
 *   formulação neutra;
 * - nenhum telefone de terceiros entra na mensagem.
 */

export const outreachPersonSchema = z.object({
  match_id: z.string().uuid(),
  profile_id: z.string().uuid(),
  name: z.string(),
  company: z.string().nullish(),
});
export type OutreachPerson = z.infer<typeof outreachPersonSchema>;

export const outreachReleasedSchema = outreachPersonSchema.extend({
  status: z.string(),
  my_decision: z.string(),
});
export type OutreachReleasedConnection = z.infer<typeof outreachReleasedSchema>;

export const participantOutreachContextSchema = z.object({
  profile_id: z.string().uuid(),
  event_id: z.string(),
  name: z.string(),
  company: z
    .string()
    .nullish()
    .transform((v) => v ?? null),
  phone_e164: z
    .string()
    .nullish()
    .transform((v) => v ?? null),
  active_matches_count: z.coerce.number().int().nonnegative().default(0),
  incoming_interests: z.array(outreachPersonSchema).default([]),
  released_connections: z.array(outreachReleasedSchema).default([]),
});
export type ParticipantOutreachContext = z.infer<typeof participantOutreachContextSchema>;

export const PARTICIPANT_SENDER_NAME = "Kevyn, da comunicação da ACIRV";

/** "Bruna Silva, da Silva Modas" — empresa só entra quando existe. */
export function describePerson(p: { name: string; company?: string | null }): string {
  const name = p.name.trim() || "um participante";
  const company = p.company?.trim();
  return company ? `${name}, da ${company}` : name;
}

/** Lista natural em português: "A", "A e B", "A, B e C". */
export function formatPersonList(people: Array<{ name: string; company?: string | null }>): string {
  const parts = people.map(describePerson);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}`;
}

/** Dedupe por pessoa mantendo a ordem de chegada (ordem estável do backend). */
export function dedupeByProfile<T extends { profile_id: string }>(list: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of list) {
    if (seen.has(item.profile_id)) continue;
    seen.add(item.profile_id);
    out.push(item);
  }
  return out;
}

const ACCESS_PATH_MAIN =
  'acesse o SudoExpo Match, vá até o final da página principal e clique em "Acessar Minhas Conexões"';
const ACCESS_PATH_CONNECTIONS =
  'entre no SudoExpo Match usando o seu número de WhatsApp, clique em "Acessar Minhas Conexões", abra a aba "Conexões"';

export interface GenerateParticipantOutreachOptions {
  senderName?: string;
}

/**
 * Monta a mensagem de reativação/abordagem do participante.
 * Sempre retorna texto válido, mesmo sem nenhum sinal (mensagem mínima).
 */
export function generateParticipantReactivationMessage(
  context: ParticipantOutreachContext,
  options?: GenerateParticipantOutreachOptions,
): string {
  const firstName = (context.name.trim().split(/\s+/)[0] || "tudo bem").trim();
  const sender = options?.senderName?.trim() || PARTICIPANT_SENDER_NAME;

  const incoming = dedupeByProfile(context.incoming_interests ?? []);
  const released = dedupeByProfile(context.released_connections ?? []);

  const blocks: string[] = [`Olá, ${firstName}, tudo bem? Aqui é o ${sender}.`];

  if (incoming.length > 0) {
    const list = formatPersonList(incoming);
    const plural = incoming.length > 1;
    blocks.push(
      `Estou entrando em contato porque ${list} ${
        plural ? "demonstraram" : "demonstrou"
      } interesse em conversar com você e ${
        plural ? "gostariam" : "gostaria"
      } de marcar um café.`,
    );
    blocks.push(
      "Se fizer sentido para você, é só me responder por aqui que a equipe da ACIRV coloca vocês em contato.",
    );

    const remaining = Math.max(
      0,
      (context.active_matches_count ?? 0) - incoming.length - released.length,
    );
    if (remaining > 0) {
      blocks.push(
        `Você também tem outras sugestões de conexão esperando: ${ACCESS_PATH_MAIN} para analisar uma a uma.`,
      );
    }
  }

  if (released.length > 0) {
    const chosen = released.filter((r) => r.my_decision === "interesse");
    const neutral = released.filter((r) => r.my_decision !== "interesse");

    if (chosen.length > 0) {
      blocks.push(
        `Vi também que você demonstrou interesse em ${formatPersonList(chosen)}. O contato ${
          chosen.length > 1 ? "deles" : "já"
        } ${chosen.length > 1 ? "já está" : "está"} liberado para você.`,
      );
    }
    if (neutral.length > 0) {
      blocks.push(
        `Você também já possui conexão liberada com ${formatPersonList(neutral)}.`,
      );
    }
    blocks.push(
      `Para falar com ${
        released.length > 1 ? "essas pessoas" : "essa pessoa"
      }, ${ACCESS_PATH_CONNECTIONS} e chame pelo WhatsApp para marcar um café.`,
    );
  }

  if (incoming.length === 0 && released.length === 0) {
    const suggestions = context.active_matches_count ?? 0;
    if (suggestions > 0) {
      blocks.push(
        `Já encontramos ${suggestions} sugest${
          suggestions > 1 ? "ões" : "ão"
        } de conexão para o seu perfil na SudoExpo Match e vale a pena dar uma olhada.`,
      );
      blocks.push(`Para ver, ${ACCESS_PATH_MAIN} e analise cada sugestão com calma.`);
    } else {
      blocks.push(
        "Ainda não temos sugestões de conexão para o seu perfil, mas assim que surgirem eu aviso você por aqui.",
      );
    }
  }

  return blocks.join(" ");
}
