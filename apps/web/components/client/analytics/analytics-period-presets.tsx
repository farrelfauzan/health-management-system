'use client';

import { cn } from '@hms/ui';
import { useTranslations } from 'next-intl';

import {
  ANALYTICS_PERIOD_PRESETS,
  type AnalyticsPeriodPreset,
} from '#lib/analytics/analytics-filter-state';

type AnalyticsPeriodPresetsProps = {
  value: AnalyticsPeriodPreset;
  onSelect: (preset: AnalyticsPeriodPreset) => void;
};

/** The period chips: one pressed at a time, announced as toggle buttons. */
export function AnalyticsPeriodPresets({ value, onSelect }: AnalyticsPeriodPresetsProps) {
  const t = useTranslations('analytics.filter');
  return (
    <div
      role="group"
      aria-label={t('presetsLabel')}
      className="flex flex-wrap gap-0.5 rounded-[10px] bg-surface-container-low p-[3px]"
    >
      {ANALYTICS_PERIOD_PRESETS.map((preset) => {
        const isActive = preset === value;
        return (
          <button
            key={preset}
            type="button"
            aria-pressed={isActive}
            onClick={() => onSelect(preset)}
            className={cn(
              'h-8 rounded-lg px-3 text-[13px] transition-colors',
              isActive
                ? 'bg-white font-semibold text-primary shadow-[0_1px_2px_rgba(11,28,48,0.12)]'
                : 'text-on-surface-variant hover:text-on-surface',
            )}
          >
            {t(`presets.${preset}`)}
          </button>
        );
      })}
    </div>
  );
}
