import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/features/auth/useSession";

export type EventRole = "admin" | "staff" | null;

/** Descobre o maior papel do usuário logado para um evento. */
export function useEventRole(eventId: string) {
  const { user, isAuthenticated, isLoading: sessionLoading } = useSession();

  return useQuery({
    queryKey: ["staff", "role", eventId, user?.id ?? "anon"],
    enabled: isAuthenticated && !!user,
    staleTime: 30_000,
    queryFn: async (): Promise<EventRole> => {
      const { data, error } = await supabase
        .from("event_staff")
        .select("role")
        .eq("event_id", eventId)
        .eq("user_id", user!.id);
      if (error) throw error;
      const roles = (data ?? []).map((r) => r.role);
      if (roles.includes("admin")) return "admin";
      if (roles.includes("staff")) return "staff";
      return null;
    },
    // Enquanto a sessão carrega, evita mostrar "acesso negado".
    placeholderData: sessionLoading ? undefined : undefined,
  });
}
