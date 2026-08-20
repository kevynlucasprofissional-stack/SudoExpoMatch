import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";

const NAV = [
  { to: "/como-funciona", label: "Como funciona" },
  { to: "/publico", label: "Quem participa" },
  { to: "/publico", label: "Painel público" },
] as const;

export function HomeHeader() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0b1252]/95 text-white backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1480px] items-center justify-between gap-3 px-8 md:px-32">
        <Link
          to="/"
          className="flex min-w-0 items-center gap-2.5 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b1252]"
          aria-label="Matchmaker SudoExpo — Início"
        >
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white font-display text-lg font-black text-primary">
            M
          </span>
          <div className="min-w-0 leading-tight">
            <div className="truncate font-display text-sm font-bold">Matchmaker</div>
            <div className="truncate text-[10px] font-medium tracking-wide text-white/60">
              SudoExpo · ACIRV
            </div>
          </div>
        </Link>

        <nav className="hidden items-center gap-7 text-sm md:flex" aria-label="Navegação principal">
          {NAV.map((item) => (
            <Link
              key={item.label}
              to={item.to}
              className="rounded-sm text-white/80 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b1252]"
            >
              {item.label}
            </Link>
          ))}
          <span aria-hidden className="h-5 w-px bg-white/20" />
          <Link
            to="/participante"
            className="rounded-sm text-white/80 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b1252]"
          >
            Entrar
          </Link>
          <Link
            to="/participar"
            className="inline-flex h-10 items-center rounded-md bg-success px-4 font-semibold text-[#0b1252] transition-transform hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b1252]"
          >
            Criar perfil
          </Link>
        </nav>

        <button
          type="button"
          aria-label={open ? "Fechar menu" : "Abrir menu"}
          aria-expanded={open}
          aria-controls="home-mobile-menu"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b1252] md:hidden"
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {open && (
        <div id="home-mobile-menu" className="border-t border-white/10 bg-[#0b1252] md:hidden">
          <nav
            className="mx-auto flex max-w-[1480px] flex-col gap-1 px-8 py-3"
            aria-label="Navegação móvel"
          >
            {NAV.map((item) => (
              <Link
                key={item.label}
                to={item.to}
                onClick={() => setOpen(false)}
                className="flex min-h-12 items-center rounded-md px-2 text-base text-white/90 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                {item.label}
              </Link>
            ))}
            <Link
              to="/participante"
              onClick={() => setOpen(false)}
              className="flex min-h-12 items-center rounded-md px-2 text-base text-white/90 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              Entrar
            </Link>
            <Link
              to="/participar"
              onClick={() => setOpen(false)}
              className="mt-1 inline-flex min-h-12 items-center justify-center rounded-md bg-success px-4 font-semibold text-[#0b1252] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b1252]"
            >
              Criar perfil
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
