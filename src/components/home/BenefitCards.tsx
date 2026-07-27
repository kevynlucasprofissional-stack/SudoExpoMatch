import { Store, Search, Users } from "lucide-react";

const CARDS = [
  {
    Icon: Store,
    color: "var(--success)",
    fg: "#0b1252",
    title: "Apresente o seu negócio",
    body:
      "Descreva os produtos e serviços que você oferece e o tipo de público que gostaria de atender na feira.",
  },
  {
    Icon: Search,
    color: "var(--secondary)",
    fg: "#0b1252",
    title: "Informe o que você procura",
    body:
      "Diga se busca fornecedores, clientes, parceiros ou soluções específicas para o seu negócio.",
  },
  {
    Icon: Users,
    color: "var(--accent)",
    fg: "#0b1252",
    title: "Receba conexões recomendadas",
    body:
      "O Matchmaker cruza as informações e destaca oportunidades reais entre os participantes.",
  },
] as const;

export function BenefitCards() {
  return (
    <section className="mx-auto max-w-[1480px] px-4 py-10 md:px-8 md:py-14">
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 md:gap-6">
        {CARDS.map(({ Icon, color, fg, title, body }) => (
          <article
            key={title}
            className="relative overflow-hidden rounded-2xl border border-border/60 bg-card p-5 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="flex items-start gap-4">
              <span
                aria-hidden
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
                style={{ background: color, color: fg }}
              >
                <Icon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h3 className="font-display text-base font-bold text-foreground">
                  {title}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {body}
                </p>
              </div>
            </div>
            <span
              aria-hidden
              className="absolute inset-x-5 bottom-0 h-[3px] rounded-full"
              style={{ background: color }}
            />
          </article>
        ))}
      </div>
    </section>
  );
}
