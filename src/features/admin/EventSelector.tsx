import { Calendar, Check, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAdminEvent } from "./AdminEventContext";

export function EventSelector() {
  const { selectedEventId, setSelectedEventId, events, isLoading } = useAdminEvent();

  if (isLoading && events.length === 0) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Calendar className="h-4 w-4 animate-pulse" />
        <span>Carregando eventos…</span>
      </div>
    );
  }

  if (events.length <= 1) {
    return (
      <div className="flex items-center gap-2">
        <Calendar className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">{events[0]?.name ?? "SudoExpo 2026"}</span>
        <Badge variant="outline" className="text-[10px]">
          Ativo
        </Badge>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Calendar className="h-4 w-4 text-primary" />
      <Select value={selectedEventId} onValueChange={setSelectedEventId}>
        <SelectTrigger className="h-8 min-w-[220px] bg-background text-xs font-medium">
          <SelectValue placeholder="Selecione o evento" />
        </SelectTrigger>
        <SelectContent align="end">
          {events.map((e) => (
            <SelectItem key={e.id} value={e.id} className="text-xs">
              <div className="flex items-center gap-2">
                <span>{e.name}</span>
                {e.is_active ? (
                  <Badge variant="default" className="h-4 px-1 text-[9px]">
                    Ativo
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="h-4 px-1 text-[9px]">
                    Passado
                  </Badge>
                )}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
