import type { LucideIcon } from "lucide-react";

export function StatCard({
  icon: Icon,
  label,
  value,
  tint,
}: {
  icon: LucideIcon;
  label: string;
  value: number | string;
  tint: "series-1" | "good" | "warning" | "critical" | "neutral";
}) {
  const tints: Record<typeof tint, string> = {
    "series-1": "bg-series-1/10 text-series-1",
    good: "bg-status-good-bg text-status-good",
    warning: "bg-status-warning-bg text-status-warning",
    critical: "bg-status-critical-bg text-status-critical",
    neutral: "bg-status-neutral-bg text-status-neutral",
  };

  return (
    <div className="flex items-center gap-3 rounded-xl border border-black/5 bg-surface p-4 shadow-card">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tints[tint]}`}>
        <Icon size={18} strokeWidth={2.25} />
      </div>
      <div className="min-w-0">
        <p className="tabular text-xl font-semibold leading-tight text-ink-primary">{value}</p>
        <p className="truncate text-xs text-ink-muted">{label}</p>
      </div>
    </div>
  );
}
