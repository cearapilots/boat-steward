import { StatusLevel } from "@/types/fleet";
import { cn } from "@/lib/utils";

const statusConfig: Record<StatusLevel, { bg: string; dot: string; label: string }> = {
  ok: { bg: "bg-status-ok-bg", dot: "bg-status-ok", label: "OK" },
  warn: { bg: "bg-status-warn-bg", dot: "bg-status-warn", label: "Atenção" },
  danger: { bg: "bg-status-danger-bg", dot: "bg-status-danger animate-pulse-soft", label: "Crítico" },
};

export function StatusIndicator({ status, showLabel = false }: { status: StatusLevel; showLabel?: boolean }) {
  const config = statusConfig[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium", config.bg)}>
      <span className={cn("h-2 w-2 rounded-full", config.dot)} />
      {showLabel && <span className="text-foreground">{config.label}</span>}
    </span>
  );
}
