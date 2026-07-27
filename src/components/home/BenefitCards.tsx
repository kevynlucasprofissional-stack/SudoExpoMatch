import { Store, Search, Users } from "lucide-react";

const CARDS = [
  {
    Icon: Store,
    color: "var(--success)",
    fg: "#0b1252",
    title: "Apresente o seu negócio",
    body: "Descreva os produtos e serviços que você oferece e o tipo de público que gostaria de atender na feira.",
  },
  {
    Icon: Search,
    color: "var(--secondary)",
    fg: "#0b1252",
    title: "Informe o que você procura",
    body: "Diga se busca fornecedores, clientes, parceiros ou soluções específicas para o seu negócio.",
  },
  {
    Icon: Users,
    color: "var(--accent)",
    fg: "#0b1252",
    title: "Receba conexões recomendadas",
    body: "O Matchmaker cruza as informações e destaca oportunidades reais entre os participantes.",
  },
] as const;

export function BenefitCards() {
  return (
    <section className="mx-auto max-w-[1480px] px-4 pt-2 pb-4 md:px-8 md:pt-3 md:pb-5">
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 md:gap-4">
        {CARDS.map(({ Icon, color, fg, title, body }) => (
          <article
            key={title}
            className="relative flex min-h-[128px] items-start gap-3 rounded-[14px] bg-white p-4 shadow-sm transition-shadow hover:shadow-md md:min-h-[132px]"
          >
            <span
              aria-hidden
              className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
              style={{ background: color, color: fg }}
            >
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h3 className="font-display text-[15px] font-bold text-[#0b1252]">{title}</h3>
              <p className="mt-1 text-[13px] leading-snug text-slate-600">{body}</p>
            </div>
            <span
              aria-hidden
              className="absolute bottom-3 left-4 h-[3px] w-10 rounded-full"
              style={{ background: color }}
            />
          </article>
        ))}
      </div>
    </section>
  );
}
