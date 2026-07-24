import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

export function BrandHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
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
            <div className="font-display text-sm font-bold">Matchmaker</div>
            <div className="text-[10px] font-medium tracking-wide text-muted-foreground">
              SudoExpo · ACIRV
            </div>
          </div>
        </Link>
        <nav className="hidden gap-6 text-sm md:flex">
          <Link
            to="/como-funciona"
            className="text-muted-foreground transition-colors hover:text-foreground"
            activeProps={{ className: "text-foreground font-medium" }}
          >
            Como funciona
          </Link>
          <Link
            to="/participar"
            className="text-muted-foreground transition-colors hover:text-foreground"
            activeProps={{ className: "text-foreground font-medium" }}
          >
            Participar
          </Link>
          <Link
            to="/publico"
            className="text-muted-foreground transition-colors hover:text-foreground"
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
    <footer className="mt-16 border-t border-border/60 bg-muted/30 py-8">
      <div className="mx-auto max-w-6xl px-4 text-center text-sm text-muted-foreground">
        <p className="font-display text-base font-semibold text-foreground">
          Aqui, ninguém cresce isolado. A gente cresce conectado.
        </p>
        <p className="mt-2">
          SudoExpo · realização{" "}
          <span className="font-medium text-foreground">ACIRV</span>
        </p>
      </div>
    </footer>
  );
}

export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <BrandHeader />
      <main className="flex-1">{children}</main>
      <BrandFooter />
    </div>
  );
}
