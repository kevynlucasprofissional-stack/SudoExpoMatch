import { Link } from "@tanstack/react-router";
import {
  UserPlus,
  Shuffle,
  Star,
  Handshake,
  ArrowRight,
  ChevronRight,
} from "lucide-react";

const STEPS = [
  { Icon: UserPlus, label: "Crie seu perfil" },
  { Icon: Shuffle, label: "O sistema cruza os interesses" },
  { Icon: Star, label: "Avalie suas conexões" },
  { Icon: Handshake, label: "A ACIRV ajuda na aproximação" },
] as const;

const AUDIENCE = [
  "Potenciais clientes",
  "Fornecedores",
  "Parceiros comerciais",
  "Distribuidores",
  "Prestadores de serviços",
  "Empresas com soluções complementares",
];

const PREVIEW_COMPANIES = [
  { name: "TechSolutions", tag: "Serviços", tone: "var(--secondary)" },
  { name: "Indústria Alfa", tag: "Fornecedor", tone: "var(--accent)" },
  { name: "Verde Log", tag: "Distribuidor", tone: "#6b57e0" },
];

export function ProcessPanel() {
  return (
    <section className="mx-auto max-w-[1480px] px-4 pb-10 md:px-8">
      <div className="relative overflow-hidden rounded-[18px] border border-secondary/40 bg-[#070d3a] p-6 text-white shadow-xl md:p-10">
        <div className="grid gap-10 lg:grid-cols-[46fr_30fr_24fr] lg:divide-x lg:divide-white/10">
          {/* Coluna 1: Como funciona */}
          <div className="lg:pr-8">
            <h2 className="font-display text-2xl font-black md:text-3xl">
              Como funciona
            </h2>
            <p className="mt-1 font-display text-lg font-semibold text-success">
              Conexões profissionais em quatro etapas
            </p>

            <ol className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {STEPS.map((s, i) => (
                <li key={s.label} className="relative">
                  <div className="flex flex-col items-center text-center">
                    <div className="relative">
                      <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-secondary font-display text-sm font-black text-[#0b1252]">
                        {i + 1}
                      </span>
                      {i < STEPS.length - 1 && (
                        <ChevronRight
                          aria-hidden
                          className="absolute -right-[26px] top-1/2 hidden h-5 w-5 -translate-y-1/2 text-white/40 sm:block"
                        />
                      )}
                    </div>
                    <s.Icon aria-hidden className="mt-3 h-5 w-5 text-white/70" />
                    <span className="mt-2 text-xs font-medium leading-snug text-white/85">
                      {s.label}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* Coluna 2: Chips */}
          <div className="lg:px-8">
            <h3 className="font-display text-lg font-bold">
              Quem você pode encontrar no Matchmaker?
            </h3>
            <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {AUDIENCE.map((label) => (
                <span
                  key={label}
                  className="inline-flex min-h-10 items-center rounded-md bg-white px-3 text-xs font-semibold text-[#0b1252] shadow-sm"
                >
                  {label}
                </span>
              ))}
            </div>
          </div>

          {/* Coluna 3: Preview */}
          <div className="lg:pl-8">
            <h3 className="font-display text-lg font-bold">
              Veja quem estará na SudoExpo
            </h3>
            <p className="mt-2 text-sm text-white/75">
              Explore os participantes já confirmados e comece a mapear
              oportunidades.
            </p>
            <Link
              to="/publico"
              className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-md bg-secondary px-4 font-semibold text-[#0b1252] transition-transform hover:scale-[1.02]"
            >
              Explorar participantes <ArrowRight className="h-4 w-4" />
            </Link>

            <div
              aria-hidden
              className="mt-5 overflow-hidden rounded-xl border border-white/10 bg-white/5"
            >
              <div className="flex items-center gap-1.5 border-b border-white/10 px-3 py-2">
                <span className="h-2 w-2 rounded-full bg-white/30" />
                <span className="h-2 w-2 rounded-full bg-white/30" />
                <span className="h-2 w-2 rounded-full bg-white/30" />
              </div>
              <ul className="space-y-2 p-3">
                {PREVIEW_COMPANIES.map((c) => (
                  <li
                    key={c.name}
                    className="flex items-center gap-3 rounded-md bg-white/95 p-2 text-[#0b1252]"
                  >
                    <span
                      className="inline-flex h-8 w-8 items-center justify-center rounded-md font-display text-xs font-black text-white"
                      style={{ background: c.tone }}
                    >
                      {c.name[0]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold">{c.name}</div>
                      <div className="text-[10px] font-semibold text-slate-500">
                        {c.tag}
                      </div>
                    </div>
                    <span className="h-2 w-2 rounded-full" style={{ background: c.tone }} />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
