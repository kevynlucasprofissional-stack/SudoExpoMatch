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
  /** Decisão da CONTRAPARTE — preserva o fato do interesse dela. */
  other_decision: z
    .string()
    .nullish()
    .transform((v) => v ?? "sem_decisao"),
  other_has_interest: z
    .boolean()
    .nullish()
    .transform((v) => v ?? false),
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
  /**
   * Sugestões ativas que NÃO estão cobertas por interesse recebido nem por
   * conexão liberada ativa. Vem exata do backend; nunca subtraia às cegas.
   */
  other_suggestions_count: z.coerce.number().int().nonnegative().nullish(),
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
  'acesse o SudoExpo Match, vá até o final da página principal e clique em "Acessar Minhas Conexões", faça o login usando seu número do whatsapp';
const ACCESS_PATH_CONNECTIONS =
  'entre no SudoExpo Match e clique em "Acessar Minhas Conexões", depois usando o seu número de WhatsApp faça o login, por fim abra a aba "Conexões", clique em "Ver contato"';
const REPLY_CTA =
  "Se fizer sentido para você, é só me responder por aqui que coloco vocês em contato.";

/**
 * Lista numerada, uma pessoa por linha:
 * "1- Ana, da Ana Doces,\n2- Bia e\n3- Caio."
 */
export function formatNumberedPersonList(
  people: Array<{ name: string; company?: string | null }>,
): string {
  return people
    .map((p, i) => {
      const suffix = i === people.length - 1 ? "." : i === people.length - 2 ? " e" : ",";
      return `${i + 1}- ${describePerson(p)}${suffix}`;
    })
    .join("\n");
}


export interface GenerateParticipantOutreachOptions {
  senderName?: string;
}

/**
 * `true` quando existe QUALQUER contexto real de matchmaking para compor a
 * mensagem. `false` significa: não há nada honesto a dizer além da saudação.
 */
export function hasOutreachContext(context: ParticipantOutreachContext): boolean {
  return (
    (context.incoming_interests?.length ?? 0) > 0 ||
    (context.released_connections?.length ?? 0) > 0 ||
    (context.active_matches_count ?? 0) > 0
  );
}

/** Sugestões restantes: valor exato do backend quando disponível. */
export function resolveOtherSuggestionsCount(
  context: ParticipantOutreachContext,
  incomingCount: number,
  releasedCount: number,
): number {
  if (typeof context.other_suggestions_count === "number") {
    return Math.max(0, context.other_suggestions_count);
  }
  return Math.max(0, (context.active_matches_count ?? 0) - incomingCount - releasedCount);
}

/**
 * Monta a mensagem de reativação/abordagem do participante em PARÁGRAFOS.
 * Sem contexto real de matchmaking, devolve apenas a saudação — nunca promete
 * aviso futuro nem inventa intenção.
 */
export function generateParticipantReactivationMessage(
  context: ParticipantOutreachContext,
  options?: GenerateParticipantOutreachOptions,
): string {
  const firstName = (context.name.trim().split(/\s+/)[0] || "tudo bem").trim();
  const sender = options?.senderName?.trim() || PARTICIPANT_SENDER_NAME;

  const released = dedupeByProfile(context.released_connections ?? []);
  const releasedProfileIds = new Set(released.map((r) => r.profile_id));
  // Interesse recebido de quem JÁ tem conexão liberada é tratado no bloco de
  // conexões liberadas, para não duplicar a mesma pessoa na mensagem.
  const incoming = dedupeByProfile(context.incoming_interests ?? []).filter(
    (p) => !releasedProfileIds.has(p.profile_id),
  );

  const blocks: string[] = [`Olá, ${firstName}, tudo bem? Aqui é o ${sender}.`];

  if (incoming.length > 0) {
    if (incoming.length === 1) {
      blocks.push(
        `Estou entrando em contato porque ${describePerson(
          incoming[0],
        )} demonstrou interesse em conversar com você e gostaria de marcar um café. ${REPLY_CTA}`,
      );
    } else {
      blocks.push(
        "Estou entrando em contato porque as seguintes pessoas demonstraram interesse em conversar com você e gostariam de marcar um café:\n\n" +
          `${formatNumberedPersonList(incoming)}\n\n${REPLY_CTA}`,
      );
    }
  }

  if (released.length > 0) {
    const chosen = released.filter((r) => r.my_decision === "interesse");
    const interestedInMe = released.filter(
      (r) => r.my_decision !== "interesse" && r.other_has_interest,
    );
    const neutral = released.filter((r) => r.my_decision !== "interesse" && !r.other_has_interest);

    if (chosen.length === 1) {
      blocks.push(
        `Vi também que você demonstrou interesse em ${describePerson(
          chosen[0],
        )}. O contato já está liberado para você.`,
      );
    } else if (chosen.length > 1) {
      blocks.push(
        `Vi também que você demonstrou interesse em marcar um café com ${chosen.length} usuários. Os contatos já estão liberados para você.`,
      );
    }
    if (interestedInMe.length === 1) {
      blocks.push(
        `${describePerson(
          interestedInMe[0],
        )} demonstrou interesse em conversar com você. ${REPLY_CTA}`,
      );
    } else if (interestedInMe.length > 1) {
      blocks.push(
        "Os seguintes usuários demonstraram interesse em conversar com você:\n\n" +
          `${formatNumberedPersonList(interestedInMe)}\n\n${REPLY_CTA}`,
      );
    }
    if (neutral.length > 0) {
      blocks.push(`Você também já possui conexão liberada com ${formatPersonList(neutral)}.`);
    }
    blocks.push(
      `Para falar com ${
        released.length > 1 ? "essas pessoas" : "essa pessoa"
      }, ${ACCESS_PATH_CONNECTIONS} e chame pelo WhatsApp para marcar um café.`,
    );
  }

  const others = resolveOtherSuggestionsCount(context, incoming.length, released.length);

  if (incoming.length > 0 || released.length > 0) {
    if (others > 0) {
      blocks.push(
        `Você também tem outras sugestões de conexão esperando: ${ACCESS_PATH_MAIN} para analisar uma a uma.`,
      );
    }
  } else if (others > 0) {
    blocks.push(
      `Já encontramos ${others} sugest${
        others > 1 ? "ões" : "ão"
      } de conexão para o seu perfil na SudoExpo Match e vale a pena dar uma olhada. ` +
        `Para ver, ${ACCESS_PATH_MAIN} e analise ${
          others > 1 ? "cada sugestão" : "a sugestão"
        } com calma.`,
    );
  }


  return blocks.join("\n\n");
}
