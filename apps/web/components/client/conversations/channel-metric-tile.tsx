'use client';

import { cn } from '@hms/ui';

type ChannelMetricTileProps = {
  label: string;
  value: string;
  /**
   * The counts behind the value. Not optional by accident: a rate without its
   * denominator is the single most misleading thing a dashboard can show, and
   * this card's whole purpose is a go/no-go decision.
   */
  detail: string;
  tone?: 'neutral' | 'good' | 'warn';
};

const TONE_CLASS: Record<'neutral' | 'good' | 'warn', string> = {
  neutral: 'text-slate-900',
  good: 'text-emerald-800',
  warn: 'text-amber-800',
};

/**
 * One metric, its value, and the counts it was computed from.
 *
 * `tone` is advisory colour against the go/no-go thresholds, never a verdict:
 * the checklist is explicit that a metric outside its gate is a question to be
 * answered in writing, not an automatic refusal.
 */
export function ChannelMetricTile({ label, value, detail, tone = 'neutral' }: ChannelMetricTileProps) {
  return (
    <div className="space-y-1">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={cn('text-2xl font-semibold', TONE_CLASS[tone])}>{value}</p>
      <p className="text-xs text-slate-500">{detail}</p>
    </div>
  );
}
