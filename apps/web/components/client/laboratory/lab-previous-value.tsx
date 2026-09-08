'use client';

import { useTranslations } from 'next-intl';

import { usePatientLabResults } from '#lib/laboratory/use-patient-lab-results';

const PREVIOUS_LIMIT = 3;

type LabPreviousValueProps = {
  patientId: string;
  labOrderId: string;
  testCode: string;
};

/**
 * The last value this patient had released for the same test, from a
 * different order — the one comparison a verifier makes before signing a
 * number out. Newest first from the trend feed, skipping this order's own
 * rows, which are what is being validated.
 */
export function LabPreviousValue({ patientId, labOrderId, testCode }: LabPreviousValueProps) {
  const t = useTranslations('operations.laboratory.validation');
  const history = usePatientLabResults({ patientId, testCode, limit: PREVIOUS_LIMIT });
  const previous = history.labResults.find((result) => result.labOrderId !== labOrderId);

  if (history.isPending) {
    return <span className="text-xs text-slate-400">…</span>;
  }

  if (!previous) {
    return <span className="text-xs text-slate-500">{t('noPrevious')}</span>;
  }

  const value = previous.valueNumeric ?? previous.valueCoded ?? previous.valueText ?? '—';

  return (
    <span className="text-sm text-slate-700">
      {value}
      {previous.unit ? <span className="ml-1 text-xs text-slate-500">{previous.unit}</span> : null}
    </span>
  );
}
