import { Link } from "@tanstack/react-router";

import { PageShell } from "@/components/brand/BrandShell";
import { Card } from "@/components/ui/card";

import { WhatsappAccessCard } from "@/features/access/WhatsappAccessCard";
import { usePhoneAuthCapability } from "@/features/access/usePhoneAuthCapability";

/**
 * Tela de acesso — política de dados sensíveis.
 *
 * O acesso é exclusivamente passwordless por WhatsApp: número e código de uso
 * único vivem APENAS em `useState` do `WhatsappAccessCard`. Nunca URL,
 * localStorage, sessionStorage, cookies ou logs. Não existe mais código
 * pessoal de recuperação em nenhum ponto do app.
 */
export function RecoveryView() {
  const capability = usePhoneAuthCapability();

  return (
    <PageShell>
      <section className="mx-auto max-w-md px-4 py-12">
        <Card className="p-6">
          <h1 className="font-display text-2xl font-bold">Acessar meu perfil</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Use seu WhatsApp para entrar sem senha.
          </p>

          <div className="mt-6">
            {capability.otpEnabled ? (
              <WhatsappAccessCard capability={capability} />
            ) : (
              <p
                role="alert"
                className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
              >
                O acesso por WhatsApp está temporariamente indisponível. Tente novamente em alguns
                minutos ou procure a equipe da ACIRV no evento.
              </p>
            )}
          </div>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            Primeiro acesso?{" "}
            <Link to="/participar" className="font-medium text-primary hover:underline">
              Criar meu perfil
            </Link>
          </div>
        </Card>
      </section>
    </PageShell>
  );
}
