import { Link, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Home } from "lucide-react";
import { DotTexture, PaperFragments } from "@/components/home/decor";
import { clearWizardDraft, purgeLegacyDraft } from "@/features/onboarding/draft";

export function BrandHeader() {
  const navigate = useNavigate();

  function goHome() {
    clearWizardDraft();
    purgeLegacyDraft();
    void navigate({ to: "/" });
  }

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0b1252]/90 text-white backdrop-blur-md">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-center px-3 sm:px-4">
        <nav className="flex flex-nowrap items-center justify-center gap-4 sm:gap-8 text-sm">
          <Link
            to="/participante"
            className="inline-flex shrink-0 items-center gap-2 truncate rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-white/20"
            activeProps={{ className: "bg-white/20" }}
          >
            Participante
          </Link>
          <button
            type="button"
            onClick={goHome}
            className="inline-flex shrink-0 items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-white/20 cursor-pointer"
          >
            <Home className="h-4 w-4" aria-hidden />
            Início
          </button>
          <Link
            to="/publico"
            className="inline-flex shrink-0 items-center gap-2 truncate rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-white/20"
            activeProps={{ className: "bg-white/20" }}
          >
            Painel público
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function BrandFooter() {
  return (
    <footer className="border-t border-white/10 py-6 text-white">
      <div className="mx-auto max-w-[1480px] px-6 text-center">
        <p className="font-display text-sm font-semibold">
          Aqui, ninguém cresce <span className="text-[#00c8ff]">isolado</span>. A gente cresce{" "}
          <span className="text-[#a3e635]">conectado</span>.
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
