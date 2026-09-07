'use client';

import type { ClinicalRequestSummary } from '@hms/shared-types';
import { useFormatter, useTranslations } from 'next-intl';

type ClinicalRequestRowProps = {
  request: ClinicalRequestSummary;
};

/**
 * One lab order or prescription on the visit, and whether this bill covers it
 * (P18-T11). The state is what the cashier reads out loud when a patient asks
 * why the blood test is not on the receipt.
 */
export function ClinicalRequestRow({ request }: ClinicalRequestRowProps) {
  const format = useFormatter();
  const t = useTranslations('operations');
  const money = (amount: number) =>
    format.number(amount, { style: 'currency', currency: 'IDR', maximumFractionDigits: 2 });
  const isBilled = request.state === 'BILLED';

  return (
    <li className="flex items-start justify-between gap-3 px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm text-slate-800">
          {request.kind === 'LAB_ORDER'
            ? t('billing.clinicalRequests.labOrder')
            : t('billing.clinicalRequests.prescription')}
          {request.reference ? <span className="font-mono text-xs"> {request.reference}</span> : null}
        </p>
        <p className="text-xs text-slate-500">
          {request.description}
          {request.externalFacilityName ? ` · ${request.externalFacilityName}` : ''}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p
          className={
            isBilled
              ? 'text-sm font-medium text-slate-900'
              : 'text-sm font-medium text-slate-500'
          }
        >
          {isBilled ? money(request.billedAmount) : t('billing.clinicalRequests.notOnThisBill')}
        </p>
        <p className="text-xs text-slate-500">
          {t(`billing.clinicalRequests.state.${request.state}`)}
        </p>
      </div>
    </li>
  );
}
