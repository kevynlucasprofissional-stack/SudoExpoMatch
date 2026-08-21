import { createFileRoute } from "@tanstack/react-router";
import { HomeFooter } from "@/components/home/HomeFooter";
import { Hero } from "@/components/home/Hero";
import { ProcessPanel } from "@/components/home/ProcessPanel";
import { FinalCta } from "@/components/home/FinalCta";
import { DotTexture, PaperFragments } from "@/components/home/decor";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Matchmaker SudoExpo — Encontre clientes, fornecedores e parceiros" },
      {
        name: "description",
        content:
          "Ferramenta oficial de conexões da SudoExpo 2026. Encontre clientes, fornecedores e parceiros durante a feira, com curadoria da ACIRV.",
      },
      { property: "og:title", content: "Matchmaker SudoExpo — Conexões que fazem negócio" },
      {
        property: "og:description",
        content:
          "Cadastro em 3 minutos. O Matchmaker analisa os perfis e recomenda conexões profissionais reais.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="relative flex min-h-screen flex-col bg-[#0b1252] text-white">
      <main className="relative flex-1">
        {/* Fundo azul-marinho contínuo com textura pontilhada e fragmentos de papel */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <DotTexture className="absolute inset-0 h-full w-full opacity-25" />
          <PaperFragments className="absolute inset-0 h-full w-full opacity-70" />
        </div>

        <div className="relative">
          <Hero />
          <ProcessPanel />
          <FinalCta />
        </div>
      </main>
      <HomeFooter />
    </div>
  );
}
