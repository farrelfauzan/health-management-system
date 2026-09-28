'use client';

type AnalyticsStatLineProps = {
  label: string;
  value: string;
  comparison?: string;
};

/** A small figure with its label and, when comparing, the comparison value. */
export function AnalyticsStatLine({ label, value, comparison }: AnalyticsStatLineProps) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-xl font-bold text-slate-900 tabular-nums">{value}</span>
      {comparison ? <span className="text-xs text-slate-500">{comparison}</span> : null}
    </div>
  );
}
