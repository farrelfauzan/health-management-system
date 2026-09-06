'use client';

import type { InvoiceItemResponse } from '@hms/shared-types';
import { Button } from '@hms/ui';
import { useFormatter } from 'next-intl';
import { useTranslations } from 'next-intl';

import { formatStatusLabel } from '#lib/shared/status-label';

type InvoiceItemsListProps = {
  items: InvoiceItemResponse[];
  totalAmount: number;
  /** Present only while the invoice is DRAFT and the viewer may edit it. */
  onRemoveItem?: (itemId: string) => void;
  removingItemId?: string | null;
};

export function InvoiceItemsList({
  items,
  totalAmount,
  onRemoveItem,
  removingItemId = null,
}: InvoiceItemsListProps) {
  const format = useFormatter();
  const t = useTranslations('operations');
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
            <div className="flex shrink-0 items-center gap-2">
              <p className="text-sm font-medium text-slate-900">{money(item.amount)}</p>
              {onRemoveItem ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs text-rose-700 hover:text-rose-800"
                  aria-label={t('billing.lines.removeFor', { description: item.description })}
                  disabled={removingItemId !== null}
                  onClick={() => onRemoveItem(item.id)}
                >
                  {removingItemId === item.id
                    ? t('billing.lines.removing')
                    : t('billing.lines.remove')}
                </Button>
              ) : null}
            </div>
          </li>
        ))}
        {items.length === 0 ? (
          <li className="px-3 py-2 text-sm text-slate-500">{t('billing.lines.empty')}</li>
        ) : null}
      </ul>
      <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-3 py-2">
        <p className="font-heading text-sm font-semibold text-slate-700">{t('common.total')}</p>
        <p className="font-heading text-base font-semibold text-slate-900">{money(totalAmount)}</p>
      </div>
    </div>
  );
}
