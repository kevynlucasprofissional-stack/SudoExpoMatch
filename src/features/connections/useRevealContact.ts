import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface RevealedContact {
  name: string;
  company: string;
  phone: string;
  email: string | null;
}

export type RevealError =
  | "not_mutual"
  | "not_yet_introduced"
  | "contact_sharing_disabled"
  | "network"
  | "unknown";

/** Estado local (não persistido) para o contato revelado de um match. */
export function useRevealContact() {
  const [contact, setContact] = useState<RevealedContact | null>(null);
  const [error, setError] = useState<RevealError | null>(null);
  const [loading, setLoading] = useState(false);

  async function reveal(matchId: string) {
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcErr } = await supabase.rpc("reveal_contact_for_match", {
        _match_id: matchId,
      });
      if (rpcErr) {
        const m = rpcErr.message ?? "";
        if (m.includes("not_mutual")) setError("not_mutual");
        else if (m.includes("not_yet_introduced")) setError("not_yet_introduced");
        else if (m.includes("contact_sharing_disabled")) setError("contact_sharing_disabled");
        else setError("unknown");
        return;
      }
      const row = data?.[0];
      if (!row) {
        setError("unknown");
        return;
      }
      setContact({
        name: row.name,
        company: row.company,
        phone: row.phone_e164 ?? "",
        email: row.email ?? null,
      });
    } catch {
      setError("network");
    } finally {
      setLoading(false);
    }
  }

  function clear() {
    setContact(null);
    setError(null);
  }

  return { contact, error, loading, reveal, clear };
}

export function translateRevealError(e: RevealError): string {
  switch (e) {
    case "not_mutual": return "Ainda não houve interesse mútuo.";
    case "not_yet_introduced": return "A equipe da ACIRV ainda vai apresentar vocês. Aguarde no estande.";
    case "contact_sharing_disabled": return "Esta pessoa desativou o compartilhamento de contato.";
    case "network": return "Sem conexão. Tente novamente.";
    default: return "Não foi possível carregar o contato. Tente novamente.";
  }
}
