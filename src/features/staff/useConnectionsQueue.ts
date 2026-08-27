import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Revelação de contatos para a equipe.
 *
 * Modelagem como mutação (e não query) por três razões:
 *  1. A operação é sensível (audit log server-side) — não deve ser refeita
 *     automaticamente pelo TanStack Query, nem ficar em cache.
 *  2. `reset()` limpa os dados imediatamente ao fechar o diálogo, evitando
 *     que telefones/e-mails permaneçam em memória do cliente.
 *  3. Admin override exige um motivo textual por chamada.
 */
export interface StaffContactPair {
  profileId: string;
  name: string;
  company: string;
  phone: string;
  email: string | null;
}

export interface RevealInput {
  matchId: string;
  overrideReason?: string;
}

export function useRevealStaffContact() {
  return useMutation<StaffContactPair[], Error, RevealInput>({
    mutationFn: async ({ matchId, overrideReason }) => {
      const { data, error } = await supabase.rpc("staff_reveal_contact_for_match", {
        _match_id: matchId,
        _override_reason: overrideReason ?? undefined,
      });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        profileId: r.profile_id,
        name: r.name,
        company: r.company ?? "",
        phone: r.phone_e164 ?? "",
        email: r.email,
      }));
    },
  });
}

export interface ReleaseWhatsAppInput {
  matchId: string;
  reason?: string;
}

/**
 * Liberação administrativa de WhatsApp para as duas partes de um match.
 *
 * A RPC `admin_release_contact_for_match` cria a conexão quando necessário,
 * marca o contato como liberado (participantes passam a ver o telefone um do
 * outro no painel) e devolve os contatos para a equipe acionar na hora.
 */
export function useReleaseWhatsApp() {
  return useMutation<StaffContactPair[], Error, ReleaseWhatsAppInput>({
    mutationFn: async ({ matchId, reason }) => {
      const { data, error } = await supabase.rpc("admin_release_contact_for_match", {
        _match_id: matchId,
        _reason: reason ?? undefined,
      });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        profileId: r.profile_id,
        name: r.name,
        company: r.company ?? "",
        phone: r.phone_e164 ?? "",
        email: r.email,
      }));
    },
  });
}
