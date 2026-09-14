import { useCallback, useEffect, useState } from "react";

import {
  DEFAULT_GRAPH_SETTINGS,
  loadGraphSettings,
  nextReheatToken,
  saveGraphSettings,
  type GraphSettings,
} from "@/features/admin/graphSettings";

/**
 * Estado das preferências visuais do Mapa de conexões.
 * SSR-safe: começa nos defaults e só lê localStorage depois da hidratação.
 * Mudar uma preferência nunca toca filtros, seleção ou payload de dados.
 */
export function useGraphSettings() {
  const [settings, setSettings] = useState<GraphSettings>(DEFAULT_GRAPH_SETTINGS);
  const [hydrated, setHydrated] = useState(false);
  const [reheatToken, setReheatToken] = useState(0);

  useEffect(() => {
    setSettings(loadGraphSettings());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) saveGraphSettings(settings);
  }, [hydrated, settings]);

  const update = useCallback((patch: Partial<GraphSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const reset = useCallback(() => setSettings(DEFAULT_GRAPH_SETTINGS), []);
  const animate = useCallback(() => setReheatToken((t) => nextReheatToken(t)), []);

  return { settings, update, reset, animate, reheatToken };
}
