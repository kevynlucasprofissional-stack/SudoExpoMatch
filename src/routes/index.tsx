import { createFileRoute } from "@tanstack/react-router";
import { HomeHeader } from "@/components/home/HomeHeader";
import { HomeFooter } from "@/components/home/HomeFooter";
import { Hero } from "@/components/home/Hero";
import { BenefitCards } from "@/components/home/BenefitCards";
import { ProcessPanel } from "@/components/home/ProcessPanel";
import { FinalCta } from "@/components/home/FinalCta";
import { CornerLines } from "@/components/home/decor";

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
    <div className="relative flex min-h-screen flex-col bg-background">
      <HomeHeader />
      <main className="flex-1">
        <Hero />
        <div className="relative">
          <CornerLines
            aria-hidden
            className="pointer-events-none absolute -left-8 bottom-0 hidden h-48 w-48 opacity-70 md:block"
          />
          <BenefitCards />
          <ProcessPanel />
          <FinalCta />
        </div>
      </main>
      <HomeFooter />
    </div>
  );
}
