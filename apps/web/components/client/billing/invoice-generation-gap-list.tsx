'use client';

import type { InvoiceGenerationGap } from '@hms/shared-types';

import { INVOICE_GENERATION_GAP_MESSAGES } from '#lib/billing/invoice-generation-gap-meta';

type InvoiceGenerationGapListProps = {
  gaps: InvoiceGenerationGap[];
};

export function InvoiceGenerationGapList({ gaps }: InvoiceGenerationGapListProps) {
  if (gaps.length === 0) {
    return (
      <p className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-sm text-slate-700">
        Everything billable on this visit was priced.
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
      <p className="mb-1 font-heading text-sm font-semibold text-amber-900">
        {gaps.length} item{gaps.length === 1 ? '' : 's'} could not be priced
      </p>
      <ul className="space-y-1.5">
        {gaps.map((gap, index) => (
          <li key={`${gap.reason}-${gap.code ?? index}`} className="text-sm text-amber-900">
            <span className="font-medium">{gap.description}</span>
            {gap.code ? <span className="font-mono text-xs"> ({gap.code})</span> : null}
            <span className="block text-xs text-amber-800">
              {INVOICE_GENERATION_GAP_MESSAGES[gap.reason]}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
