import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import heroIllustration from "@/assets/hero-matchmaker.png.asset.json";

const CLICK_WINDOW_MS = 1000;

export function HeroVisual() {
  const navigate = useNavigate();
  const clicks = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const handleSecretClick = () => {
    clicks.current += 1;
    if (timer.current) clearTimeout(timer.current);

    if (clicks.current >= 3) {
      clicks.current = 0;
      navigate({ to: "/equipe" });
      return;
    }

    timer.current = setTimeout(() => {
      clicks.current = 0;
    }, CLICK_WINDOW_MS);
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
      {/* Atalho oculto: 3 cliques rápidos no rosto central abrem o acesso da equipe */}
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        data-testid="hero-secret-hotspot"
        onClick={handleSecretClick}
        className="absolute left-[44%] top-[14%] z-10 h-[16%] w-[12%] cursor-default bg-transparent opacity-0"
      />
    </div>
  );
}
