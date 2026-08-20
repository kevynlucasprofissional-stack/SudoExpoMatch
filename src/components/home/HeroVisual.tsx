import heroIllustration from "@/assets/hero-matchmaker.png.asset.json";

export function HeroVisual() {
  return (
    <div
      className="relative mx-auto w-full max-w-[640px]"
      data-testid="hero-visual-desktop-root"
    >
      <img
        src={heroIllustration.url}
        alt="Três profissionais da SudoExpo conectados por um match de negócios entre TechSolutions e Indústria Alfa"
        className="block h-auto w-full select-none"
        loading="eager"
        decoding="async"
      />
    </div>
  );
}
