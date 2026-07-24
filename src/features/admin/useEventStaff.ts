import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "staff";

export interface StaffMember {
  userId: string;
  email: string;
  role: AppRole;
  createdAt: string;
}

const staffKey = (eventId: string) => ["admin", "staff", eventId] as const;

export function useEventStaffMembers(eventId: string, enabled: boolean) {
  return useQuery({
    queryKey: staffKey(eventId),
    enabled,
    staleTime: 10_000,
    queryFn: async (): Promise<StaffMember[]> => {
      const { data, error } = await supabase.rpc("admin_list_event_staff", {
        _event_id: eventId,
      });
      if (error) throw error;
      return (data ?? []).map((r) => ({
        userId: r.user_id,
        email: r.email,
        role: r.role as AppRole,
        createdAt: r.created_at,
      }));
    },
  });
}

export const addMemberSchema = z.object({
  email: z.string().trim().email("E-mail inválido"),
  role: z.enum(["staff", "admin"]),
});
export type AddMemberInput = z.infer<typeof addMemberSchema>;

export function useAddStaffMember(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: AddMemberInput) => {
      const parsed = addMemberSchema.parse(input);
      const { data, error } = await supabase.rpc("admin_add_event_staff_by_email", {
        _event_id: eventId,
        _email: parsed.email,
        _role: parsed.role,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: staffKey(eventId) }),
  });
}

export function useChangeStaffRole(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { userId: string; role: AppRole }) => {
      const { error } = await supabase.rpc("admin_change_event_staff_role", {
        _event_id: eventId,
        _user_id: input.userId,
        _role: input.role,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: staffKey(eventId) }),
  });
}

export function useRemoveStaffMember(eventId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.rpc("admin_remove_event_staff", {
        _event_id: eventId,
        _user_id: userId,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: staffKey(eventId) }),
  });
}

/** Traduz códigos de erro pgsql em mensagens amigáveis. */
export function translateStaffError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  if (msg.includes("last_admin")) return "Não é possível remover ou rebaixar o último administrador do evento.";
  if (msg.includes("user_not_found")) return "Não encontramos uma conta com esse e-mail. Peça para a pessoa criar a conta primeiro.";
  if (msg.includes("forbidden")) return "Acesso negado. Apenas administradores do evento podem executar esta ação.";
  if (msg.includes("invalid_role")) return "Papel inválido.";
  if (msg.includes("not_a_member")) return "Essa pessoa não faz parte da equipe.";
  return msg || "Erro inesperado.";
}
