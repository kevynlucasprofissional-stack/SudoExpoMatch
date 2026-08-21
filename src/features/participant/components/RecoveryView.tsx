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
            {capability.isLoading ? (
              <div
                aria-busy="true"
                className="space-y-3"
                aria-label="Verificando disponibilidade do acesso por WhatsApp"
              >
                <div className="h-10 animate-pulse rounded-md bg-muted" />
                <div className="h-10 animate-pulse rounded-md bg-muted" />
              </div>
            ) : capability.otpEnabled ? (
              <WhatsappAccessCard capability={capability} />
            ) : (
              <div
                role="status"
                className="rounded-md border border-border bg-muted/40 p-4 text-sm text-muted-foreground"
              >
                <p className="font-medium text-foreground">
                  {capability.isError
                    ? "Não conseguimos verificar o acesso por WhatsApp agora."
                    : "O acesso por WhatsApp está temporariamente indisponível."}
                </p>
                <p className="mt-1">
                  Tente novamente em alguns instantes ou fale com a equipe da ACIRV no evento — eles
                  localizam seu perfil pelo seu número.
                </p>
                <button
                  type="button"
                  onClick={capability.refetch}
                  className="mt-3 inline-flex items-center rounded-full border border-border px-3 py-1.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
                >
                  Tentar novamente
                </button>
              </div>
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
