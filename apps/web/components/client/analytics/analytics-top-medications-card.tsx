'use client';

import type { AnalyticsPharmacyMedication } from '@hms/shared-types';
import { useFormatter, useTranslations } from 'next-intl';

import { AnalyticsCard } from '#components/client/analytics/analytics-card';
import { formatMedicationLabel } from '#lib/analytics/format-medication-label';
import { useMedicationUnitLabel } from '#lib/analytics/use-medication-unit-label';

type AnalyticsTopMedicationsCardProps = {
  medications: AnalyticsPharmacyMedication[];
};

const PERCENT = 100;
// The card shows the top ten; the CSV export carries all twenty.
const SHOWN_ROWS = 10;

/**
 * The ten medications with the most units handed over in the period, bars
 * scaled to the first. Units differ between rows (tablets, bottles), so the
 * bar compares a row with the top one, not with a common scale.
 */
export function AnalyticsTopMedicationsCard({ medications }: AnalyticsTopMedicationsCardProps) {
  const t = useTranslations('analytics.pharmacy.topMedications');
  const format = useFormatter();
  const unitLabel = useMedicationUnitLabel();
  const rows = medications.slice(0, SHOWN_ROWS);
  const largest = Math.max(0, ...rows.map((row) => row.quantity));
  return (
    <AnalyticsCard title={t('title')} subtitle={t('subtitle')} className="flex-[3_1_0]">
      {rows.length === 0 ? (
        <p className="text-[13px] text-slate-500">{t('empty')}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {rows.map((row) => (
            <li key={row.medicationId} className="flex h-7 items-center gap-3">
              <span className="w-[200px] shrink-0 truncate text-[13px] text-slate-900">
                {formatMedicationLabel(row.name, row.strength)}
              </span>
              <span
                aria-hidden="true"
                className="h-2.5 grow overflow-hidden rounded-full bg-surface-container-low"
              >
                <span
                  className="block h-full rounded-full bg-primary"
                  style={{ width: `${largest > 0 ? (row.quantity / largest) * PERCENT : 0}%` }}
                />
              </span>
              <span className="w-[112px] shrink-0 text-right text-[13px] font-semibold text-slate-900 tabular-nums">
                {t('quantity', {
                  quantity: format.number(row.quantity),
                  unit: unitLabel(row.unit),
                }).trim()}
              </span>
            </li>
          ))}
        </ul>
      )}
      {medications.length > rows.length ? (
        <p className="mt-auto text-xs text-slate-400">
          {t('moreInExport', {
            shown: format.number(rows.length),
            total: format.number(medications.length),
          })}
        </p>
      ) : null}
    </AnalyticsCard>
  );
}
