import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell } from "@/components/brand/BrandShell";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

export const Route = createFileRoute("/como-funciona")({
  head: () => ({
    meta: [
      { title: "Como funciona — Matchmaker SudoExpo" },
      {
        name: "description",
        content:
          "Passo a passo do Matchmaker SudoExpo: perfil, matches explicáveis, interesse mútuo e ponte feita pela equipe da ACIRV.",
      },
      { property: "og:title", content: "Como funciona — Matchmaker SudoExpo" },
      {
        property: "og:description",
        content: "Do QR code ao aperto de mão: como conectamos empresas na SudoExpo.",
      },
    ],
  }),
  component: HowItWorks,
});

const STEPS = [
  {
    n: 1,
    title: "Você escaneia o QR na feira",
    body: "Abre no celular. Sem app, sem cadastro longo.",
  },
  {
    n: 2,
    title: "Diz o que oferece e o que procura",
    body: "Um wizard curto com sugestões inteligentes. Você confirma cada item.",
  },
  {
    n: 3,
    title: "Vê matches com o motivo real",
    body: "‘Você procura X, ela oferece X.’ Sem percentual, com explicação.",
  },
  {
    n: 4,
    title: "Marca interesse nos que fazem sentido",
    body: "Interesse unilateral fica registrado, mas não libera contato.",
  },
  {
    n: 5,
    title: "Quando é mútuo, dá match",
    body: "A equipe da ACIRV entra em cena e apresenta os dois pessoalmente.",
  },
  {
    n: 6,
    title: "A conexão vira negócio",
    body: "Reuniões, propostas e negócios fechados são acompanhados por nossa equipe.",
  },
];

function HowItWorks() {
  return (
    <PageShell>
      <section className="mx-auto max-w-4xl px-4 py-12 md:py-16">
        <p className="text-sm font-medium uppercase tracking-wide text-primary">
          Passo a passo
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold md:text-4xl">
          Como o Matchmaker SudoExpo funciona
        </h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Uma experiência rápida no celular, feita para transformar visita em
          negócio real. Cada match tem motivo objetivo.
        </p>

        <ol className="mt-10 space-y-4">
          {STEPS.map((s) => (
            <li
              key={s.n}
              className="flex gap-4 rounded-xl border bg-card p-5 shadow-sm"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground font-display font-bold">
                {s.n}
              </div>
              <div>
                <h2 className="font-display text-lg font-semibold">{s.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-10 rounded-2xl bg-brand-mesh border p-6">
          <h3 className="font-display text-lg font-semibold">O que a equipe registra</h3>
          <ul className="mt-3 grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
            {[
              "Participantes chamados",
              "Apresentação realizada",
              "Contatos trocados",
              "Interesse comercial confirmado",
              "Reuniões marcadas",
              "Propostas enviadas",
              "Negócios fechados",
              "Foto e pin no mapa físico",
            ].map((i) => (
              <li key={i} className="flex items-center gap-2">
                <Check className="h-4 w-4 text-success" /> {i}
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-10 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link to="/participar">Começar meu perfil</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/">Voltar</Link>
          </Button>
        </div>
      </section>
    </PageShell>
  );
}
