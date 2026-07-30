'use client';

import type { InvoiceItemResponse } from '@hms/shared-types';
import { useFormatter } from 'next-intl';
import { useTranslations } from 'next-intl';

import { formatStatusLabel } from '#lib/shared/status-label';

type InvoiceItemsListProps = {
  items: InvoiceItemResponse[];
  totalAmount: number;
};

export function InvoiceItemsList({ items, totalAmount }: InvoiceItemsListProps) {
  const format = useFormatter();
  const t = useTranslations('operations.common');
  const money = (amount: number) =>
    format.number(amount, { style: 'currency', currency: 'IDR', maximumFractionDigits: 2 });
  return (
    <div className="rounded-lg border border-slate-200">
      <ul className="divide-y divide-slate-100">
        {items.map((item) => (
          <li key={item.id} className="flex items-start justify-between gap-3 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm text-slate-800">{item.description}</p>
              <p className="text-xs text-slate-500">
                {formatStatusLabel(item.itemType)} · {item.quantity} × {money(item.unitPrice)}
              </p>
            </div>
            <p className="shrink-0 text-sm font-medium text-slate-900">{money(item.amount)}</p>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-3 py-2">
        <p className="font-heading text-sm font-semibold text-slate-700">{t('total')}</p>
        <p className="font-heading text-base font-semibold text-slate-900">{money(totalAmount)}</p>
      </div>
    </div>
  );
}
