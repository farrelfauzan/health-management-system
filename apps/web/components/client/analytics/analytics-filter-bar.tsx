'use client';

import { Card, CardContent } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { AnalyticsCompareToggle } from '#components/client/analytics/analytics-compare-toggle';
import { AnalyticsCustomRange } from '#components/client/analytics/analytics-custom-range';
import { AnalyticsDoctorSelect } from '#components/client/analytics/analytics-doctor-select';
import { AnalyticsPayerSelect } from '#components/client/analytics/analytics-payer-select';
import { AnalyticsPeriodPresets } from '#components/client/analytics/analytics-period-presets';
import { AnalyticsPeriodRangeChip } from '#components/client/analytics/analytics-period-range-chip';
import { AnalyticsPoliSelect } from '#components/client/analytics/analytics-poli-select';
import type {
  AnalyticsFilterState,
  AnalyticsPeriodPreset,
} from '#lib/analytics/analytics-filter-state';
import { resolveAnalyticsPresetRange } from '#lib/analytics/resolve-analytics-preset-range';
import type { AnalyticsRangeProblem } from '#lib/analytics/validate-analytics-filter-range';

type AnalyticsFilterBarProps = {
  state: AnalyticsFilterState;
  today: string;
  rangeProblem: AnalyticsRangeProblem | null;
  onChange: (next: AnalyticsFilterState) => void;
  /** Off for a page the filter cannot narrow by poli, clinician or payer, such as reporting status. */
  showNarrowing?: boolean;
  /** Off for a page with nothing to compare, such as reporting status. */
  showCompare?: boolean;
};

/**
 * The filter every analytics dashboard shares: period, comparison, poli,
 * clinician and payer.
 */
export function AnalyticsFilterBar({
  state,
  today,
  rangeProblem,
  onChange,
  showNarrowing = true,
  showCompare = true,
}: AnalyticsFilterBarProps) {
  const t = useTranslations('analytics.filter');
  function handlePresetSelect(preset: AnalyticsPeriodPreset): void {
    const range = resolveAnalyticsPresetRange(preset, today) ?? { from: state.from, to: state.to };
    onChange({ ...state, preset, ...range });
  }
  return (
    <Card className="rounded-[14px] border-slate-200 py-0 shadow-none">
      <CardContent className="p-0">
        <section aria-label={t('label')} className="flex flex-wrap items-end gap-5 px-5 py-4">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-500">{t('period')}</span>
            <div className="flex flex-wrap items-start gap-3">
              <AnalyticsPeriodPresets value={state.preset} onSelect={handlePresetSelect} />
              {state.preset === 'custom' ? (
                <AnalyticsCustomRange
                  range={{ from: state.from, to: state.to }}
                  problem={rangeProblem}
                  onChange={(range) => onChange({ ...state, ...range })}
                />
              ) : (
                <AnalyticsPeriodRangeChip range={{ from: state.from, to: state.to }} />
              )}
            </div>
          </div>
          {showCompare && rangeProblem === null ? (
            <AnalyticsCompareToggle
              range={{ from: state.from, to: state.to }}
              isChecked={state.compare}
              onCheckedChange={(compare) => onChange({ ...state, compare })}
            />
          ) : null}
          {showNarrowing ? (
            <>
              <div className="grow" />
              <AnalyticsPoliSelect
                value={state.specialtyId}
                onChange={(specialtyId) => onChange({ ...state, specialtyId, doctorId: undefined })}
              />
              <AnalyticsDoctorSelect
                value={state.doctorId}
                specialtyId={state.specialtyId}
                onChange={(doctorId) => onChange({ ...state, doctorId })}
              />
              <AnalyticsPayerSelect
                value={state.payerType}
                onChange={(payerType) => onChange({ ...state, payerType })}
              />
            </>
          ) : null}
        </section>
      </CardContent>
    </Card>
  );
}
