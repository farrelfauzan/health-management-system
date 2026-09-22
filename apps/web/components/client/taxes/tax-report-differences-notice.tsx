'use client';

import type { TaxReportView } from '@hms/shared-types';
import { useTranslations } from 'next-intl';

import { InlineNotice } from '#components/client/shared/inline-notice';
import { formatRupiah } from '#lib/billing/format-rupiah';

const TOTAL_FIELDS = [
  'grossOmzet',
  'taxableOmzet',
  'taxDue',
  'taxableAmount',
  'taxBase',
  'taxAmount',
  'grossFee',
] as const;

type TaxReportDifferencesNoticeProps = {
  report: TaxReportView;
};

/**
 * What changed in the books since this report was computed (P27-T05). For a
 * finalized report this is the reason to amend what was filed; for a draft it
 * is a reminder to recompute. The stored figures themselves never move.
 */
export function TaxReportDifferencesNotice({ report }: TaxReportDifferencesNoticeProps) {
  const t = useTranslations('operations.taxes.reports');

  function labelOf(field: string): string {
    const known = TOTAL_FIELDS.find((candidate) => candidate === field);
    return known ? t(`totals.${known}`) : field;
  }

  if (!report.isOutOfDate) {
    return null;
  }
  return (
    <InlineNotice tone={report.status === 'FINALIZED' ? 'error' : 'warning'}>
      <p>{t(report.status === 'FINALIZED' ? 'outOfDateFinalized' : 'outOfDateDraft')}</p>
      <ul className="mt-1 list-disc pl-5">
        {report.differences.map((difference) => (
          <li key={difference.field}>
            {t('difference', {
              field: labelOf(difference.field),
              stored: formatRupiah(difference.stored),
              live: formatRupiah(difference.live),
            })}
          </li>
        ))}
      </ul>
    </InlineNotice>
  );
}
