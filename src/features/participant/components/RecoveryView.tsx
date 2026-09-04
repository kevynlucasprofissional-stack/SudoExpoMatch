import { PageShell } from "@/components/brand/BrandShell";
import { Card } from "@/components/ui/card";

import { PhoneLoginCard } from "@/features/access/PhoneLoginCard";

/**
 * Tela de acesso — política de dados sensíveis.
 *
 * O acesso é passwordless pelo número de WhatsApp: o número vive APENAS em
 * `useState` do `PhoneLoginCard`. Nunca URL, localStorage, sessionStorage,
 * cookies ou logs. Não existe código pessoal de recuperação em nenhum ponto
 * do app. O fluxo antigo com OTP (`WhatsappAccessCard`) permanece no projeto,
 * pronto para voltar caso o provedor de telefone seja habilitado.
 */
export function RecoveryView() {
  return (
    <PageShell>
      <section className="mx-auto max-w-md px-4 py-12">
        <Card className="p-6">
          <h1 className="font-display text-2xl font-bold">Acessar meu perfil</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Informe seu WhatsApp para entrar. Sem senha, sem código.
          </p>

          <div className="mt-6">
            <PhoneLoginCard />
          </div>
        </Card>
      </section>
    </PageShell>
  );
}
