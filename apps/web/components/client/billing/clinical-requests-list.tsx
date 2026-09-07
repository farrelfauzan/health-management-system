'use client';

import type { ClinicalRequestSummary } from '@hms/shared-types';
import { useTranslations } from 'next-intl';

import { ClinicalRequestRow } from './clinical-request-row';

type ClinicalRequestsListProps = {
  requests: ClinicalRequestSummary[];
};

/**
 * Everything the doctor asked for on this visit, billed here or not (P18-T11).
 *
 * Rendered even when every request is billed, because its absence is what the
 * cashier would otherwise have to interpret: a bill with no lab line reads
 * identically whether the test went to an outside lab, a payer covers it, or
 * the line was quietly dropped.
 */
export function ClinicalRequestsList({ requests }: ClinicalRequestsListProps) {
  const t = useTranslations('operations');

  if (requests.length === 0) {
    return null;
  }

  return (
    <div className="rounded-lg border border-slate-200">
      <p className="border-b border-slate-200 bg-slate-50 px-3 py-2 font-heading text-sm font-semibold text-slate-700">
        {t('billing.clinicalRequests.title')}
      </p>
      <ul className="divide-y divide-slate-100">
        {requests.map((request) => (
          <ClinicalRequestRow key={`${request.kind}-${request.id}`} request={request} />
        ))}
      </ul>
    </div>
  );
}
