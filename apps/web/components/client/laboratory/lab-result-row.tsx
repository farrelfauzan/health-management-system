'use client';

import { useState } from 'react';
import type { PatientLabResultView } from '@hms/shared-types';
import { Button, cn } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { LabResultFlagChip } from '#components/client/laboratory/lab-result-flag-chip';
import { LabResultTrend } from '#components/client/laboratory/lab-result-trend';
import { formatReferenceRange } from '#lib/laboratory/format-reference-range';
import { isCriticalLabFlag } from '#lib/laboratory/lab-result-flag-meta';
import { toResultReferenceRange } from '#lib/laboratory/to-result-reference-range';

type LabResultRowProps = {
  result: PatientLabResultView;
  patientId: string;
  /** False on the patient-history tab, where every row is already history. */
  isTrendEnabled?: boolean;
};

/**
 * One measured value, with the band it was judged against (`P18-T07`).
 *
 * The band comes off the result rather than the catalog, because the range
 * shown beside a number has to be the one that number was judged by — the
 * catalog's current band may be a different band entirely. A value with no
 * band says so in words instead of showing a dash, which would read as a
 * range of nothing rather than the absence of one.
 *
 * An amended value is marked: somebody may have acted on the number this one
 * replaced, and the reason is the sentence that tells them what changed.
 */
export function LabResultRow({ result, patientId, isTrendEnabled = true }: LabResultRowProps) {
  const t = useTranslations('clinical');
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const range = formatReferenceRange(toResultReferenceRange(result));
  const value = result.valueNumeric ?? result.valueCoded ?? result.valueText ?? '—';

  return (
    <li
      className={cn(
        'space-y-2 rounded-lg border px-3 py-2',
        isCriticalLabFlag(result.flag) ? 'border-red-200 bg-red-50' : 'border-slate-200',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-800">{result.testName}</p>
          <p className="text-xs text-slate-500">
            {range
              ? t('encounters.laboratory.result.range', { range, unit: result.unit ?? '' })
              : t('encounters.laboratory.result.noRange')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-900">
            {value}
            {result.unit ? <span className="ml-1 text-xs text-slate-500">{result.unit}</span> : null}
          </span>
          <LabResultFlagChip flag={result.flag} />
          {isTrendEnabled ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded((previous) => !previous)}
              aria-expanded={isExpanded}
            >
              {t(`encounters.laboratory.result.${isExpanded ? 'hideTrend' : 'showTrend'}`)}
            </Button>
          ) : null}
        </div>
      </div>
      {result.amendedFromId ? (
        <p className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">
          {t('encounters.laboratory.result.amended', {
            version: result.version,
            reason: result.amendReason ?? '',
          })}
        </p>
      ) : null}
      {isExpanded ? (
        <LabResultTrend
          patientId={patientId}
          testCode={result.testCode}
          testName={result.testName}
        />
      ) : null}
    </li>
  );
}
