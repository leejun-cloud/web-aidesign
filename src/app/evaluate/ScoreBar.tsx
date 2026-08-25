const METRIC_LABELS: Record<string, string> = {
  visualDesign: "Visual Design",
  visualHierarchy: "Visual Hierarchy",
  typography: "Typography",
  brandConsistency: "Brand Consistency",
  navigation: "Navigation",
  contentClarity: "Content Clarity",
  conversion: "Conversion",
  mobileUx: "Mobile UX",
  accessibility: "Accessibility",
  performance: "Performance",
  motionQuality: "Motion Quality",
  trust: "Trust / Credibility",
};

export const metricLabel = (k: string) => METRIC_LABELS[k] ?? k;

export function tone(score: number) {
  if (score >= 85) return "bg-emerald-500";
  if (score >= 70) return "bg-amber-500";
  return "bg-rose-500";
}

export function ScoreBar({ label, score, hint }: { label: string; score: number; hint?: string }) {
  return (
    <div className="grid grid-cols-[10rem_1fr_2.5rem] items-center gap-3 py-1.5">
      <span className="truncate text-xs text-zinc-600 dark:text-zinc-400" title={hint ?? label}>
        {label}
      </span>
      <span className="h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <span className={`block h-full rounded-full ${tone(score)}`} style={{ width: `${score}%` }} />
      </span>
      <span className="text-right text-xs tabular-nums text-zinc-700 dark:text-zinc-300">{score}</span>
    </div>
  );
}

export function TotalScore({ score, caption }: { score: number; caption: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-5xl font-semibold tabular-nums tracking-tight">{score}</span>
      <span className="text-sm text-zinc-500 dark:text-zinc-400">/ 100 · {caption}</span>
    </div>
  );
}
