import { Link } from "@tanstack/react-router";
import { UserCircle2, ArrowRight } from "lucide-react";

export function FinalCta() {
  return (
    <section className="mx-auto max-w-[1480px] px-4 pb-6 md:px-8 md:pb-6">
      <div
        className="relative overflow-hidden rounded-2xl px-4 py-4 md:px-6 md:py-4"
        style={{
          background: "linear-gradient(120deg, #0b1252 0%, #1b26ae 55%, #129cdf 130%)",
        }}
      >
        {/* Ilustração monocromática no extremo direito */}
        <svg
          aria-hidden
          viewBox="0 0 260 120"
          className="pointer-events-none absolute right-0 top-0 hidden h-full w-[240px] opacity-45 md:block"
          preserveAspectRatio="xMaxYMid slice"
        >
          <g fill="rgba(255,255,255,0.16)">
            <circle cx="70" cy="45" r="18" />
            <path d="M42 120 C 42 78, 98 78, 98 120 Z" />
            <circle cx="140" cy="38" r="20" />
            <path d="M108 120 C 108 72, 172 72, 172 120 Z" />
            <circle cx="210" cy="46" r="17" />
            <path d="M182 120 C 182 80, 238 80, 238 120 Z" />
          </g>
        </svg>

        <div className="relative flex flex-col items-start gap-3 md:flex-row md:items-center md:justify-between md:pr-[260px]">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 text-white">
              <UserCircle2 className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <h3 className="font-display text-lg font-black text-white md:text-xl">
                Já criou seu perfil?
              </h3>
              <p className="mt-0.5 text-xs text-white/80 md:text-sm">
                Acesse suas conexões, veja quem demonstrou interesse e responda.
              </p>
            </div>
          </div>

          <Link
            to="/participante"
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-success px-5 font-semibold text-[#0b1252] shadow-lg transition-transform hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b1252] md:w-auto"
          >
            Acessar minhas conexões <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
