import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Menu, X } from "lucide-react";

const NAV = [
  { to: "/como-funciona", label: "Como funciona" },
  { to: "/publico", label: "Quem participa" },
  { to: "/publico", label: "Painel público" },
] as const;

export function HomeHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0b1252]/95 text-white backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1480px] items-center justify-between gap-4 px-4 md:px-8">
        <Link to="/" className="flex items-center gap-2.5 shrink-0" aria-label="Matchmaker SudoExpo — Início">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white font-display text-lg font-black text-primary">
            M
          </span>
          <div className="leading-tight">
            <div className="font-display text-sm font-bold">Matchmaker</div>
            <div className="text-[10px] font-medium tracking-wide text-white/60">
              SudoExpo · ACIRV
            </div>
          </div>
        </Link>

        <nav
          className="hidden items-center gap-7 text-sm md:flex"
          aria-label="Navegação principal"
        >
          {NAV.map((item) => (
            <Link
              key={item.label}
              to={item.to}
              className="text-white/80 transition-colors hover:text-white"
            >
              {item.label}
            </Link>
          ))}
          <span aria-hidden className="h-5 w-px bg-white/20" />
          <Link
            to="/participante"
            className="text-white/80 transition-colors hover:text-white"
          >
            Entrar
          </Link>
          <Link
            to="/participar"
            className="inline-flex h-10 items-center rounded-md bg-success px-4 font-semibold text-[#0b1252] transition-transform hover:scale-[1.02]"
          >
            Criar perfil
          </Link>
        </nav>

        <button
          type="button"
          aria-label={open ? "Fechar menu" : "Abrir menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="inline-flex h-11 w-11 items-center justify-center rounded-md text-white md:hidden"
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-white/10 bg-[#0b1252] md:hidden">
          <nav
            className="mx-auto flex max-w-[1480px] flex-col gap-1 px-4 py-3"
            aria-label="Navegação móvel"
          >
            {NAV.map((item) => (
              <Link
                key={item.label}
                to={item.to}
                onClick={() => setOpen(false)}
                className="flex min-h-11 items-center rounded-md px-2 text-base text-white/85 hover:bg-white/5"
              >
                {item.label}
              </Link>
            ))}
            <Link
              to="/participante"
              onClick={() => setOpen(false)}
              className="flex min-h-11 items-center rounded-md px-2 text-base text-white/85 hover:bg-white/5"
            >
              Entrar
            </Link>
            <Link
              to="/participar"
              onClick={() => setOpen(false)}
              className="mt-1 inline-flex min-h-11 items-center justify-center rounded-md bg-success px-4 font-semibold text-[#0b1252]"
            >
              Criar perfil
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
