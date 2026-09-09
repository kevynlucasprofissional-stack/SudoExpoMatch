import { LogOut, Loader2, MessageCircle, RefreshCw, Sparkles } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const ADMIN_SUPPORT_WHATSAPP_URL = "https://wa.me/5564992470988";

interface Props {
  firstName: string;
  onRecompute: () => void;
  onRefresh: () => void;
  recomputing: boolean;
  refreshing: boolean;
  hasProfile: boolean;
  lastUpdatedLabel: string;
}

export function ParticipantHeader({
  firstName,
  onRecompute,
  onRefresh,
  recomputing,
  refreshing,
  hasProfile,
  lastUpdatedLabel,
}: Props) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = useCallback(async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await qc.cancelQueries();
      const { error } = await supabase.auth.signOut();
      if (error) {
        toast.error("Falha ao sair. Tente novamente.");
        setSigningOut(false);
        return;
      }
      qc.clear();
      navigate({ to: "/", replace: true });
    } catch {
      toast.error("Falha ao sair. Tente novamente.");
      setSigningOut(false);
    }
  }, [signingOut, qc, navigate]);

  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-xs uppercase tracking-wide text-primary">Área do participante</p>
        <h1 className="font-display text-2xl font-bold md:text-3xl">Olá, {firstName}!</h1>
        <p
          className="mt-1 text-xs text-muted-foreground"
          aria-live="polite"
          data-testid="matches-updated-label"
        >
          {lastUpdatedLabel}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={onRecompute}
          disabled={recomputing || !hasProfile}
          aria-label="Procurar novos matches"
          aria-busy={recomputing}
          data-testid="btn-recompute-matches"
        >
          {recomputing ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-1 h-4 w-4" />
          )}
          Procurar novos matches
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={refreshing}
          aria-label="Atualizar lista de matches"
          aria-busy={refreshing}
          data-testid="btn-refresh-matches"
        >
          {refreshing ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-1 h-4 w-4" />
          )}
          Atualizar
        </Button>
        <Button
          asChild
          variant="outline"
          size="sm"
          className="border-emerald-600/30 text-emerald-700 hover:bg-emerald-500/10 hover:text-emerald-800 dark:border-emerald-500/40 dark:text-emerald-400 dark:hover:text-emerald-300"
        >
          <a
            href={ADMIN_SUPPORT_WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Falar com o administrador e suporte pelo WhatsApp"
            data-testid="btn-participant-support"
          >
            <MessageCircle className="mr-1 h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            Suporte
          </a>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void handleSignOut()}
          disabled={signingOut}
          aria-busy={signingOut}
        >
          {signingOut ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <LogOut className="mr-1 h-4 w-4" />
          )}
          Sair
        </Button>
      </div>
    </header>
  );
}
