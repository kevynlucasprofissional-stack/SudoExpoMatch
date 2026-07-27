import { Link } from "@tanstack/react-router";
import { ArrowRight, Clock, Star } from "lucide-react";
import { HeroVisual } from "./HeroVisual";

function Highlight({ children, bg }: { children: React.ReactNode; bg: string }) {
  return (
    <span
      className="relative inline-block whitespace-nowrap px-2 py-0.5 text-[#0b1252]"
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

export function Hero() {
  return (
    <section className="relative text-white">
      <div className="relative mx-auto grid max-w-[1480px] items-center gap-8 px-4 py-8 md:grid-cols-[44fr_56fr] md:gap-6 md:px-8 md:py-10 lg:py-12">
        {/* Coluna esquerda */}
        <div className="max-w-xl">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-medium ring-1 ring-white/15 backdrop-blur">
            <Star className="h-3.5 w-3.5 fill-warning text-warning" />
            Ferramenta oficial de conexões da SudoExpo 2026
          </span>

          <h1 className="mt-4 font-display text-[36px] font-black leading-[1.02] tracking-tight sm:text-[44px] md:text-[48px] lg:text-[52px]">
            Encontre <Highlight bg="var(--success)">clientes</Highlight>,{" "}
            <Highlight bg="var(--secondary)">fornecedores</Highlight> e{" "}
            <Highlight bg="var(--accent)">parceiros</Highlight> dentro da SudoExpo.
          </h1>

          <p className="mt-4 max-w-lg text-sm leading-relaxed text-white/85 sm:text-base">
            Informe o que você oferece e o que está procurando. O Matchmaker analisa os perfis dos
            participantes e recomenda as conexões profissionais que mais fazem sentido para você.
            Quando houver interesse dos dois lados, a equipe da ACIRV ajuda a aproximar vocês
            durante a feira.
          </p>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link
              to="/participar"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-success px-6 py-3 font-semibold text-[#0b1252] shadow-lg transition-transform hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b1252]"
            >
              Criar meu perfil <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/participante"
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-white/30 bg-transparent px-6 py-3 font-semibold text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b1252]"
            >
              Ver minhas conexões
            </Link>
          </div>

          <p className="mt-3 flex items-center gap-2 text-xs text-white/70">
            <Clock className="h-3.5 w-3.5" /> Cadastro gratuito · Leva cerca de 3 minutos
          </p>
        </div>

        {/* Coluna direita — visual */}
        <div className="relative">
          <HeroVisual />
        </div>
      </div>
    </section>
  );
}
