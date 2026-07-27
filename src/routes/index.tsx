import { createFileRoute } from "@tanstack/react-router";
import { HomeHeader } from "@/components/home/HomeHeader";
import { HomeFooter } from "@/components/home/HomeFooter";
import { Hero } from "@/components/home/Hero";
import { BenefitCards } from "@/components/home/BenefitCards";
import { ProcessPanel } from "@/components/home/ProcessPanel";
import { FinalCta } from "@/components/home/FinalCta";
import { CornerLines, CornerLeaves, DotTexture, PaperFragments } from "@/components/home/decor";

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
      <HomeHeader />
      <main className="relative flex-1">
        {/* Fundo azul-marinho contínuo com textura pontilhada e fragmentos de papel */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <DotTexture className="absolute inset-0 h-full w-full opacity-25" />
          <PaperFragments className="absolute inset-0 h-full w-full opacity-70" />
          <CornerLeaves className="absolute -bottom-4 -right-6 h-64 w-64 opacity-90 hidden md:block" />
          <CornerLines className="absolute -left-6 bottom-6 hidden h-40 w-40 opacity-70 md:block" />
        </div>

        <div className="relative">
          <Hero />
          <BenefitCards />
          <ProcessPanel />
          <FinalCta />
        </div>
      </main>
      <HomeFooter />
    </div>
  );
}
