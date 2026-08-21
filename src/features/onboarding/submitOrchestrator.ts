import type { WizardDraft, WizardMode } from "./types";
import { validateWizardForSubmit } from "./validate";
import { mapWizardToSaveProfileInput, normalizePhoneE164 } from "./mappers";
import { buildSocialLinkPayload, type SocialLinkPayload } from "@/features/social/socialProfile";
import type { SocialBusinessContext } from "@/lib/social-context";

export interface SubmitOrchestratorDeps {
  saveOwnProfile: (input: ReturnType<typeof mapWizardToSaveProfileInput>) => Promise<unknown>;
  setOwnContact: (input: { phone_e164: string; sharing: boolean }) => Promise<unknown>;
  /**
   * Persistência do @Instagram + contexto social. Opcional e NUNCA bloqueante:
   * qualquer falha vira um evento informativo e o cadastro continua.
   */
  linkSocialProfile?: (payload: SocialLinkPayload) => Promise<unknown>;
  // NOTA: recomputeOwnMatches removido — `save_own_profile_v2` já dispara
  // `_recompute_matches_for_profile` transacionalmente no banco.
}


export type PreSubmitResult =
  | { ok: true; phoneE164: string | null; withContact: boolean }
  | { ok: false; reason: "profile" | "phone" | "priority"; message: string };

/**
 * Etapa pura anterior a qualquer chamada de rede.
 * Se retornar `ok:false`, o chamador NÃO deve executar RPC alguma.
 */
export function preSubmit(args: {
  draft: WizardDraft;
  mode: WizardMode;
  phone: string;
}): PreSubmitResult {
  const v = validateWizardForSubmit(args);
  if (!v.ok) return { ok: false, reason: v.reason, message: v.message };
  const phoneE164 = args.phone.trim() ? normalizePhoneE164(args.phone) : null;
  const withContact = args.mode === "create" ? true : !!phoneE164;
  return { ok: true, phoneE164, withContact };
}

export type SubmitEvent =
  | { type: "PRE_FAIL"; reason: "profile" | "phone" | "priority"; message: string }
  | { type: "PROFILE_OK" }
  | { type: "PROFILE_FAIL"; error: unknown }
  | { type: "CONTACT_OK" }
  | { type: "CONTACT_FAIL"; error: unknown }
  | { type: "MATCH_OK" }
  | { type: "MATCH_FAIL"; error: unknown }
  | { type: "SOCIAL_OK"; status: string; handle: string | null }
  | { type: "SOCIAL_FAIL"; error: unknown };


/**
 * Executa o pipeline até o ponto em que uma confirmação manual do usuário é
 * necessária (verificação do WhatsApp) ou até completar (edição). Retorna a
 * lista de eventos emitidos, para o chamador aplicar no reducer/UI.
 * Injetável para testes — sem tocar em toast/navegação.
 */
export async function runWizardSubmit(args: {
  draft: WizardDraft;
  mode: WizardMode;
  phone: string;
  eventId: string;
  /** Contexto social já saneado na sessão do wizard, quando existir. */
  socialContext?: SocialBusinessContext | null;
  deps: SubmitOrchestratorDeps;
}): Promise<SubmitEvent[]> {

  const events: SubmitEvent[] = [];
  const pre = preSubmit(args);
  if (!pre.ok) {
    events.push({ type: "PRE_FAIL", reason: pre.reason, message: pre.message });
    return events;
  }

  try {
    const input = mapWizardToSaveProfileInput(args.draft, args.eventId);
    await args.deps.saveOwnProfile(input);
    events.push({ type: "PROFILE_OK" });
  } catch (error) {
    events.push({ type: "PROFILE_FAIL", error });
    return events;
  }

  if (pre.withContact && pre.phoneE164) {
    try {
      await args.deps.setOwnContact({ phone_e164: pre.phoneE164, sharing: true });
      events.push({ type: "CONTACT_OK" });
    } catch (error) {
      events.push({ type: "CONTACT_FAIL", error });
      return events;
    }
  }

  // Instagram/contexto social — sempre depois do perfil (precisa do profile_id
  // resolvido pela RPC) e sempre tolerante a falha.
  if (args.deps.linkSocialProfile) {
    const payload = buildSocialLinkPayload({
      eventId: args.eventId,
      instagram: args.draft.instagram,
      context: args.socialContext ?? null,
    });
    try {
      await args.deps.linkSocialProfile(payload);
      events.push({
        type: "SOCIAL_OK",
        status: payload.handle ? payload.last_status : "unlinked",
        handle: payload.handle,
      });
    } catch (error) {
      events.push({ type: "SOCIAL_FAIL", error });
    }
  }



  // Descoberta automática: save_own_profile_v2 já dispara o recálculo
  // transacional no banco (_recompute_matches_for_profile). Não chamamos
  // recomputeOwnMatches aqui para evitar RPC redundante — o MATCH_OK é
  // emitido como sinal de "matches prontos" para o reducer/UI.
  events.push({ type: "MATCH_OK" });
  return events;
}
