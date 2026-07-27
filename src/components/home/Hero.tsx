import { Link } from "@tanstack/react-router";
import { ArrowRight, Clock, Star } from "lucide-react";
import { DotTexture, CornerLeaves } from "./decor";
import { HeroVisual } from "./HeroVisual";

function Highlight({
  children,
  bg,
}: {
  children: React.ReactNode;
  bg: string;
}) {
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
    <section className="relative overflow-hidden bg-[#0b1252] text-white">
      {/* Decor de fundo */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute right-0 top-0 h-full w-2/3 opacity-40">
          <DotTexture className="h-full w-full" />
        </div>
        <CornerLeaves className="absolute -right-6 -top-6 h-56 w-56 opacity-90" />
      </div>

      <div className="relative mx-auto grid max-w-[1480px] items-center gap-10 px-4 py-14 md:grid-cols-[42fr_58fr] md:gap-8 md:px-8 md:py-20">
        {/* Coluna esquerda */}
        <div className="max-w-xl">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-medium ring-1 ring-white/15 backdrop-blur">
            <Star className="h-3.5 w-3.5 fill-warning text-warning" />
            Ferramenta oficial de conexões da SudoExpo 2026
          </span>

          <h1 className="mt-5 font-display text-[42px] font-black leading-[1.02] tracking-tight sm:text-5xl md:text-[56px] lg:text-[60px]">
            Encontre{" "}
            <Highlight bg="var(--success)">clientes</Highlight>,{" "}
            <Highlight bg="var(--secondary)">fornecedores</Highlight> e{" "}
            <Highlight bg="var(--accent)">parceiros</Highlight> dentro da SudoExpo.
          </h1>

          <p className="mt-6 max-w-lg text-base leading-relaxed text-white/85 sm:text-lg">
            Informe o que você oferece e o que está procurando. O Matchmaker analisa
            os perfis dos participantes e recomenda as conexões profissionais que
            mais fazem sentido para você. Quando houver interesse dos dois lados,
            a equipe da ACIRV ajuda a aproximar vocês durante a feira.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link
              to="/participar"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-success px-6 py-3 font-semibold text-[#0b1252] shadow-lg transition-transform hover:scale-[1.02]"
            >
              Criar meu perfil <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/participante"
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-white/30 bg-transparent px-6 py-3 font-semibold text-white transition-colors hover:bg-white/10"
            >
              Ver minhas conexões
            </Link>
          </div>

          <p className="mt-4 flex items-center gap-2 text-xs text-white/70">
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
