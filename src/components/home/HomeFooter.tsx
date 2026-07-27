export function HomeFooter() {
  return (
    <footer className="border-t border-white/10 bg-[#0b1252] text-white">
      <div className="mx-auto grid max-w-[1480px] gap-3 px-4 py-5 text-sm md:grid-cols-3 md:items-center md:px-8">
        <div className="flex items-center justify-center gap-2.5 md:justify-start">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-white font-display text-base font-black text-primary">
            M
          </span>
          <span className="font-display text-base font-bold">Matchmaker</span>
        </div>

        <p className="text-center font-display text-sm font-semibold">
          Aqui, ninguém cresce isolado. A gente cresce{" "}
          <span className="text-success">conectado</span>.
        </p>

        <div className="flex flex-col items-center gap-2 md:flex-row md:justify-end md:gap-3">
          <span className="text-xs text-white/75">SudoExpo 2026 · Uma realização</span>
          <span
            aria-label="ACIRV"
            className="inline-flex items-center rounded-md border border-white/25 bg-white/5 px-2.5 py-1 font-display text-xs font-black tracking-widest"
          >
            ACIRV
          </span>
        </div>
      </div>
    </footer>
  );
}
