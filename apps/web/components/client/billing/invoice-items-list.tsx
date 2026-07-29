'use client';

import type { InvoiceItemResponse } from '@hms/shared-types';

import { formatRupiah } from '#lib/billing/format-rupiah';
import { formatStatusLabel } from '#lib/shared/status-label';

type InvoiceItemsListProps = {
  items: InvoiceItemResponse[];
  totalAmount: number;
};

export function InvoiceItemsList({ items, totalAmount }: InvoiceItemsListProps) {
  return (
    <div className="rounded-lg border border-slate-200">
      <ul className="divide-y divide-slate-100">
        {items.map((item) => (
          <li key={item.id} className="flex items-start justify-between gap-3 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm text-slate-800">{item.description}</p>
              <p className="text-xs text-slate-500">
                {formatStatusLabel(item.itemType)} · {item.quantity} ×{' '}
                {formatRupiah(item.unitPrice)}
              </p>
            </div>
            <p className="shrink-0 text-sm font-medium text-slate-900">
              {formatRupiah(item.amount)}
            </p>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-3 py-2">
        <p className="font-heading text-sm font-semibold text-slate-700">Total</p>
        <p className="font-heading text-base font-semibold text-slate-900">
          {formatRupiah(totalAmount)}
        </p>
      </div>
    </div>
  );
}
