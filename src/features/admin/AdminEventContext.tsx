import React, { createContext, useContext, useEffect, useState } from "react";
import { EVENT_ID } from "@/config/event";
import { useAdminEvents, type EventItem } from "./useAdminEvents";

interface AdminEventContextType {
  selectedEventId: string;
  setSelectedEventId: (id: string) => void;
  events: EventItem[];
  currentEvent: EventItem | undefined;
  isLoading: boolean;
}

const AdminEventContext = createContext<AdminEventContextType | undefined>(undefined);

const STORAGE_KEY = "sudoexpo_admin_selected_event";

export function AdminEventProvider({ children }: { children: React.ReactNode }) {
  const { data: events = [], isLoading } = useAdminEvents();
  const [selectedEventId, setSelectedEventIdState] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) return stored;
    }
    return EVENT_ID;
  });

  const setSelectedEventId = (id: string) => {
    setSelectedEventIdState(id);
    if (typeof window !== "undefined") {
      sessionStorage.setItem(STORAGE_KEY, id);
    }
  };

  // Se o evento selecionado não existir na lista após carregar, mantém o fallback seguro
  useEffect(() => {
    if (events.length > 0 && !events.some((e) => e.id === selectedEventId)) {
      const active = events.find((e) => e.is_active) ?? events[0];
      if (active) setSelectedEventId(active.id);
    }
  }, [events, selectedEventId]);

  const currentEvent = events.find((e) => e.id === selectedEventId);

  return (
    <AdminEventContext.Provider
      value={{
        selectedEventId,
        setSelectedEventId,
        events,
        currentEvent,
        isLoading,
      }}
    >
      {children}
    </AdminEventContext.Provider>
  );
}

export function useAdminEvent() {
  const ctx = useContext(AdminEventContext);
  if (!ctx) {
    // Fallback gracioso para componentes fora do provider
    return {
      selectedEventId: EVENT_ID,
      setSelectedEventId: () => {},
      events: [],
      currentEvent: undefined,
      isLoading: false,
    };
  }
  return ctx;
}
