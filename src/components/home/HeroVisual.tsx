import { useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import heroIllustration from "@/assets/hero-matchmaker.png.asset.json";

export function HeroVisual() {
  const navigate = useNavigate();
  const clicks = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSecretClick = () => {
    clicks.current += 1;
    if (timer.current) clearTimeout(timer.current);
    if (clicks.current >= 3) {
      clicks.current = 0;
      navigate({ to: "/admin" });
      return;
    }
    timer.current = setTimeout(() => {
      clicks.current = 0;
    }, 800);
  };

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
      {/* Atalho oculto: 3 cliques no rosto central levam ao painel admin */}
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        onClick={handleSecretClick}
        className="absolute left-1/2 top-[32%] h-[12%] w-[10%] -translate-x-1/2 cursor-default opacity-0"
      />
    </div>
  );
}
