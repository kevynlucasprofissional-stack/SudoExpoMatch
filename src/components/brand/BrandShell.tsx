import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { DotTexture, PaperFragments } from "@/components/home/decor";

export function BrandHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0b1252]/85 text-white backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white ring-1 ring-white/15">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden>
              <circle cx="6" cy="6" r="2.5" fill="currentColor" />
              <circle cx="18" cy="6" r="2.5" fill="currentColor" />
              <circle cx="12" cy="18" r="2.5" fill="currentColor" />
              <path
                d="M6 6L18 6M6 6L12 18M18 6L12 18"
                stroke="currentColor"
                strokeWidth="1.2"
                opacity="0.6"
              />
            </svg>
          </span>
          <div className="leading-tight">
            <div className="font-display text-sm font-black">Matchmaker</div>
            <div className="text-[10px] font-medium tracking-wide text-white/60">
              SudoExpo · ACIRV
            </div>
          </div>
        </Link>
        <nav className="hidden gap-6 text-sm md:flex">
          <Link
            to="/participar"
            className="text-white/70 transition-colors hover:text-white"
            activeProps={{ className: "text-white font-semibold" }}
          >
            Participar
          </Link>
          <Link to="/publico" className="text-white/70 transition-colors hover:text-white">
            Painel público
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function BrandFooter() {
  return (
    <footer className="border-t border-white/10 text-white">
      <div className="mx-auto max-w-[1480px] px-8 py-6 md:px-32">
        <p className="text-center font-display text-sm font-semibold">
          Aqui, ninguém cresce <span className="text-[#039de3]">isolado</span>. A gente cresce{" "}
          <span className="text-success">conectado</span>.
        </p>
        <p className="mt-1 text-center text-xs text-white/60">
          SudoExpo · realização <span className="font-semibold text-white/85">ACIRV</span>
        </p>
      </div>
    </footer>
  );
}

export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="brand-navy relative flex min-h-screen flex-col bg-[#0b1252] text-white">
      {/* Mesmo fundo da homepage: marinho contínuo com textura e fragmentos de papel */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <DotTexture className="absolute inset-0 h-full w-full opacity-25" />
        <PaperFragments className="absolute inset-0 h-full w-full opacity-70" />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col">
        <BrandHeader />
        <main className="flex-1">{children}</main>
        <BrandFooter />
      </div>
    </div>
  );
}
