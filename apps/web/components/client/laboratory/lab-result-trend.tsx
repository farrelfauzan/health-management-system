'use client';

import { useFormatter, useTranslations } from 'next-intl';

import { LabResultFlagChip } from '#components/client/laboratory/lab-result-flag-chip';
import { LabResultTrendSparkline } from '#components/client/laboratory/lab-result-trend-sparkline';
import { usePatientLabResults } from '#lib/laboratory/use-patient-lab-results';

/** Five points is what fits, and what a clinician actually compares against. */
const TREND_LIMIT = 5;

type LabResultTrendProps = {
  patientId: string;
  testCode: string;
  testName: string;
};

/**
 * One test's recent history, fetched when the doctor asks for it (`P18-T07`).
 *
 * The API returns newest first because that is what a list wants; a trend is
 * read oldest to newest, so the order is reversed here rather than in the
 * endpoint. Every point carries the band it was judged against, which may
 * differ between rows — a range edited between two visits is exactly the case
 * the snapshot exists for, and the table shows both rather than pretending
 * they were measured against the same thing.
 */
export function LabResultTrend({ patientId, testCode, testName }: LabResultTrendProps) {
  const t = useTranslations('clinical');
  const format = useFormatter();
  const trendQuery = usePatientLabResults({ patientId, testCode, limit: TREND_LIMIT });

  if (trendQuery.isPending) {
    return <p className="text-xs text-slate-500">{t('encounters.laboratory.trend.loading')}</p>;
  }

  const points = [...trendQuery.labResults].reverse();

  if (points.length === 0) {
    return <p className="text-xs text-slate-500">{t('encounters.laboratory.trend.empty')}</p>;
  }

  const numericValues = points
    .map((point) => point.valueNumeric)
    .filter((value): value is number => value !== undefined);

  return (
    <div className="space-y-2 rounded-lg bg-slate-50 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-slate-600">
          {t('encounters.laboratory.trend.title', { test: testName })}
        </p>
        {numericValues.length === points.length ? (
          <LabResultTrendSparkline
            values={numericValues}
            label={t('encounters.laboratory.trend.sparkline', { test: testName })}
          />
        ) : null}
      </div>
      <ul className="space-y-1">
        {points.map((point) => (
          <li key={point.id} className="flex items-center justify-between gap-3 text-xs">
            <span className="text-slate-500">
              {point.releasedAt
                ? format.dateTime(new Date(point.releasedAt), { dateStyle: 'medium' })
                : t('encounters.laboratory.trend.undated')}
            </span>
            <span className="flex items-center gap-2 text-slate-700">
              {point.valueNumeric ?? point.valueCoded ?? point.valueText}
              {point.unit ? <span className="text-slate-400">{point.unit}</span> : null}
              <LabResultFlagChip flag={point.flag} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
