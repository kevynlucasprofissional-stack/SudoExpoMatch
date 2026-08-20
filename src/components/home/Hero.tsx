import { Link } from "@tanstack/react-router";
import { ArrowRight, Users, Package, Handshake } from "lucide-react";
import { HeroVisual } from "./HeroVisual";

function Highlight({ children, bg }: { children: React.ReactNode; bg: string }) {
  return (
    <span
      className="relative inline-block px-2 py-0.5 text-[#0b1252]"
      style={{
        background: bg,
        transform: "rotate(-1.5deg)",
        borderRadius: "6px",
        boxShadow: "0 6px 20px -8px rgba(0,0,0,0.35)",
      }}
    >
      {children}
    </span>
  );
}

const MOBILE_CATEGORIES = [
  { Icon: Users, label: "Clientes", tone: "var(--success)" },
  { Icon: Package, label: "Fornecedores", tone: "var(--secondary)" },
  { Icon: Handshake, label: "Parceiros", tone: "var(--accent)" },
] as const;

export function Hero() {
  return (
    <section className="relative text-white">
      <div className="relative mx-auto grid max-w-[1480px] grid-cols-[minmax(0,1fr)] items-center gap-6 px-8 py-6 md:px-32 md:py-10 lg:grid-cols-[minmax(0,44fr)_minmax(0,56fr)] lg:gap-6 lg:py-12">
        {/* Coluna esquerda — texto e CTAs */}
        <div className="mx-auto min-w-0 max-w-xl text-center md:max-w-none lg:mx-0 lg:max-w-xl lg:text-left">

          <h1
            className="mt-4 font-display font-black leading-[1.05] tracking-tight md:leading-[1.02]"
            style={{ fontSize: "clamp(1.45rem, 6.2vw, 3.25rem)" }}
          >
            Encontre{" "}
            <span className="whitespace-nowrap">
              <Highlight bg="var(--success)">clientes</Highlight>,
            </span>{" "}
            <span className="whitespace-nowrap">
              <Highlight bg="var(--secondary)">fornecedores</Highlight>
            </span>{" "}
            e{" "}
            <span className="whitespace-nowrap">
              <Highlight bg="var(--accent)">parceiros</Highlight>
            </span>{" "}
            dentro da SudoExpo.
          </h1>

          <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-white/85 sm:text-base lg:mx-0">
            Diga o que oferece e o que procura. O Matchmaker encontra as conexões mais relevantes
            para você durante a SudoExpo.
          </p>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-nowrap sm:items-center sm:justify-center lg:justify-start">

            <Link
              to="/participar"
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-success px-6 py-3 font-semibold text-[#0b1252] shadow-lg transition-transform hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b1252] sm:w-auto"
            >
              Criar meu perfil <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/participante"
              className="inline-flex min-h-12 w-full items-center justify-center rounded-md border border-white/30 bg-transparent px-6 py-3 font-semibold text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b1252] sm:w-auto"
            >
              Ver minhas conexões
            </Link>
          </div>



        </div>

        {/* Ilustração do matchmaker — mesma composição em todos os tamanhos */}
        <div
          className="relative mx-auto w-full max-w-[560px] lg:mx-0 lg:max-w-none"
          data-testid="hero-visual"
        >
          <HeroVisual />
        </div>
      </div>

    </section>
  );
}
