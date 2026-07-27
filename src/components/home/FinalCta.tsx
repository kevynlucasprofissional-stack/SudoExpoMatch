import { Link } from "@tanstack/react-router";
import { UserCircle2, ArrowRight } from "lucide-react";

export function FinalCta() {
  return (
    <section className="mx-auto max-w-[1480px] px-4 pb-12 md:px-8">
      <div
        className="relative overflow-hidden rounded-2xl px-6 py-8 md:px-10 md:py-10"
        style={{
          background:
            "linear-gradient(120deg, #0b1252 0%, #1b26ae 55%, #129cdf 130%)",
        }}
      >
        {/* Ilustração à direita — silhuetas monocromáticas */}
        <svg
          aria-hidden
          viewBox="0 0 400 200"
          className="pointer-events-none absolute -right-6 top-0 hidden h-full opacity-60 md:block"
        >
          <g fill="rgba(255,255,255,0.14)">
            <circle cx="80" cy="80" r="26" />
            <path d="M40 200 C 40 130, 120 130, 120 200 Z" />
            <circle cx="170" cy="70" r="30" />
            <path d="M125 200 C 125 120, 215 120, 215 200 Z" />
            <circle cx="270" cy="80" r="26" />
            <path d="M230 200 C 230 130, 310 130, 310 200 Z" />
          </g>
        </svg>

        <div className="relative flex flex-col items-start gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/15 text-white">
              <UserCircle2 className="h-7 w-7" />
            </span>
            <div className="min-w-0">
              <h3 className="font-display text-xl font-black text-white md:text-2xl">
                Já criou seu perfil?
              </h3>
              <p className="mt-1 text-sm text-white/80">
                Acesse suas conexões, veja quem demonstrou interesse e responda.
              </p>
            </div>
          </div>

          <Link
            to="/participante"
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-success px-5 font-semibold text-[#0b1252] shadow-lg transition-transform hover:scale-[1.02] md:w-auto"
          >
            Acessar minhas conexões <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
