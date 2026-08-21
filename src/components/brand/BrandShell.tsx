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
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0b1252]/85 text-white backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-center px-4">
        <nav className="flex items-center justify-center gap-4 text-sm sm:gap-6">
          <Link
            to="/participar"
            className="text-white/70 transition-colors hover:text-white"
            activeProps={{ className: "text-white font-semibold" }}
          >
            Participar
          </Link>
          <button
            type="button"
            onClick={goHome}
            className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-white/20"
          >
            <Home className="h-4 w-4" aria-hidden />
            Início
          </button>
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
