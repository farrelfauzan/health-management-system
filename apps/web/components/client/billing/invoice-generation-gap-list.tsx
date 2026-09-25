'use client';

import type { InvoiceGenerationGap } from '@hms/shared-types';
import { useTranslations } from 'next-intl';

type InvoiceGenerationGapListProps = {
  gaps: InvoiceGenerationGap[];
};

/**
 * What the generator found but could not price. It reports these instead of
 * dropping them, so the cashier is told before the invoice is issued; each
 * reason names the fix, because every gap is money the clinic would otherwise
 * not bill.
 */
export function InvoiceGenerationGapList({ gaps }: InvoiceGenerationGapListProps) {
  const t = useTranslations('operations.billing.gaps');
  if (gaps.length === 0) {
    return (
      <p className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-sm text-slate-700">
        {t('allPriced')}
      </p>
    );
  }
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
      <p className="mb-1 font-heading text-sm font-semibold text-amber-900">
        {t('title', { count: gaps.length })}
      </p>
      <ul className="space-y-1.5">
        {gaps.map((gap, index) => (
          <li key={`${gap.reason}-${gap.code ?? index}`} className="text-sm text-amber-900">
            <span className="font-medium">{gap.description}</span>
            {gap.code ? <span className="font-mono text-xs"> ({gap.code})</span> : null}
            <span className="block text-xs text-amber-800">{t(`reasons.${gap.reason}`)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
