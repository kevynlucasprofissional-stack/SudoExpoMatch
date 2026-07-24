import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { PageShell } from "@/components/brand/BrandShell";
import { NetworkGraphic } from "@/components/brand/NetworkGraphic";
import { ArrowRight, Sparkles, Users, Handshake } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Matchmaker SudoExpo — Encontre suas conexões" },
      {
        name: "description",
        content:
          "Boas-vindas ao Matchmaker SudoExpo. Encontre parceiros de negócio na feira em minutos.",
      },
      { property: "og:title", content: "Matchmaker SudoExpo" },
      {
        property: "og:description",
        content: "Aqui, ninguém cresce isolado. A gente cresce conectado.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <PageShell>
      <section className="relative overflow-hidden bg-hero-gradient text-primary-foreground">
        <div className="absolute inset-0 opacity-40">
          <NetworkGraphic className="h-full w-full" />
        </div>
        <div className="relative mx-auto max-w-6xl px-4 py-20 md:py-28">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" /> SudoExpo 2026 · realização ACIRV
            </span>
            <h1 className="mt-5 font-display text-4xl font-bold leading-tight md:text-6xl">
              Aqui, ninguém cresce isolado.{" "}
              <span className="text-gradient-brand">A gente cresce conectado.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-white/85">
              O Matchmaker da SudoExpo cruza o que você oferece com o que outros visitantes
              procuram — e mostra, em segundos, com quem vale conversar hoje.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" asChild className="bg-accent text-accent-foreground hover:bg-accent/90">
                <Link to="/participar">
                  Encontrar conexões <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                asChild
                className="border-white/30 bg-white/10 text-white hover:bg-white/20"
              >
                <Link to="/participante">Já participei</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <div className="grid gap-6 md:grid-cols-3">
          {[
            {
              icon: Users,
              title: "Preencha seu perfil em 3 minutos",
              body: "Diga o que você faz e o que procura. Nossa sugestão inteligente acelera — você só confirma.",
            },
            {
              icon: Sparkles,
              title: "Veja matches explicáveis",
              body: "Nada de percentuais frios. Cada match vem com o motivo real — direto, inverso ou complementar.",
            },
            {
              icon: Handshake,
              title: "Interesse mútuo? A equipe faz a ponte",
              body: "Quando os dois topam, a equipe da ACIRV apresenta pessoalmente no espaço da feira.",
            },
          ].map((item) => (
            <div
              key={item.title}
              className="rounded-2xl border bg-card p-6 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <item.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 font-display text-lg font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{item.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 text-center">
          <Link
            to="/como-funciona"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            Saiba como funciona <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </PageShell>
  );
}
