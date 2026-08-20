import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Session, User } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";

export const sessionKey = ["auth", "session"] as const;

async function fetchSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session ?? null;
}

export function useSession() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: sessionKey,
    queryFn: fetchSession,
    staleTime: Infinity,
  });

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      qc.setQueryData(sessionKey, session ?? null);
      qc.invalidateQueries({ queryKey: ["auth"] });
      qc.invalidateQueries({ queryKey: ["staff"] });
      qc.invalidateQueries({ queryKey: ["admin"] });
    });
    return () => data.subscription.unsubscribe();
  }, [qc]);

  const session = query.data ?? null;
  const user: User | null = session?.user ?? null;
  const isAnonymous = Boolean(user?.is_anonymous);
  const isAuthenticated = Boolean(user) && !isAnonymous;

  return {
    session,
    user,
    isAnonymous,
    isAuthenticated,
    isLoading: query.isLoading,
  };
}
