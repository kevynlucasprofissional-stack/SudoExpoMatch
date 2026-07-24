import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell } from "@/components/brand/BrandShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Lock, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/equipe")({
  head: () => ({
    meta: [
      { title: "Área da equipe — Matchmaker SudoExpo" },
      {
        name: "description",
        content:
          "Acesso restrito para a equipe ACIRV do Matchmaker SudoExpo.",
      },
    ],
  }),
  component: StaffPlaceholder,
});

function StaffPlaceholder() {
  return (
    <PageShell>
      <section className="mx-auto max-w-lg px-4 py-16">
        <Card className="p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Lock className="h-7 w-7" />
          </div>
          <h1 className="mt-4 font-display text-2xl font-bold">
            Área da equipe ACIRV
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Dashboard, fila de atendimento, tela de registro e painel
            administrativo ficam disponíveis assim que o backend Supabase
            (Lovable Cloud) for ativado neste projeto.
          </p>
          <div className="mt-4 flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-left text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p>
              Enquanto isso, todo o fluxo do visitante — perfil, matches
              explicáveis, interesses e conexões mútuas — está funcional em
              modo demonstração usando armazenamento local.
            </p>
          </div>
          <Button asChild className="mt-6" size="lg">
            <Link to="/participar">Testar como visitante</Link>
          </Button>
        </Card>
      </section>
    </PageShell>
  );
}
