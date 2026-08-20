import { clearWizardDraft, createEmptyDraft } from "./draft";
import type { WizardDraft } from "./types";

/**
 * Reset do formulário do wizard ("outra pessoa vai usar este dispositivo").
 *
 * O que o reset FAZ:
 *  - apaga o rascunho do localStorage;
 *  - devolve o estado React aos valores iniciais (Etapa 1 — Identificação);
 *  - descarta contexto social em memória, estados temporários da IA,
 *    mensagens de erro/sucesso e caches de query da sessão;
 *  - encerra a sessão anônima atual para que o perfil já salvo pela pessoa
 *    anterior não reapareça em um reload.
 *
 * O que o reset NUNCA faz:
 *  - apagar o perfil já persistido no backend;
 *  - apagar o cache social global (`private.social_profile_cache`), que
 *    pertence ao `normalized_handle` e existe para reuso futuro.
 */
export interface WizardResetDeps {
  clearDraft?: () => void;
  setDraft: (draft: WizardDraft) => void;
  setPhone: (v: string) => void;
  resetSocial: () => void;
  resetAi: () => void;
  resetSubmit: () => void;
  clearQueryCache: () => void;
  resetSession: () => Promise<void>;
}

export async function runWizardReset(deps: WizardResetDeps): Promise<WizardDraft> {
  const empty = createEmptyDraft();
  (deps.clearDraft ?? clearWizardDraft)();
  deps.setDraft(empty);
  deps.setPhone("");
  deps.resetSocial();
  deps.resetAi();
  deps.resetSubmit();
  deps.clearQueryCache();
  await deps.resetSession();
  return empty;
}

export const WIZARD_RESET_COPY = {
  trigger: "Resetar formulário",
  title: "Limpar este cadastro?",
  description:
    "Todo o preenchimento atual deste dispositivo será apagado e o formulário voltará ao início. Use esta opção se outra pessoa for começar um novo cadastro.",
  cancel: "Cancelar",
  confirm: "Limpar e começar novo cadastro",
} as const;
