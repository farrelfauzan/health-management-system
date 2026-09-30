'use client';

import type { AnalyticsRevenueByItemType } from '@hms/shared-types';
import { useLocale, useTranslations } from 'next-intl';

import { AnalyticsCard } from '#components/client/analytics/analytics-card';
import { formatRupiah } from '#lib/analytics/format-rupiah';

type AnalyticsRevenueByServiceCardProps = {
  itemTypes: AnalyticsRevenueByItemType[];
};

const PERCENT = 100;

/**
 * What the period's invoices charged for, before tax: each line type's
 * amount less the PPN inside it, the tax itself noted once underneath.
 */
export function AnalyticsRevenueByServiceCard({ itemTypes }: AnalyticsRevenueByServiceCardProps) {
  const t = useTranslations('analytics.finance.services');
  const locale = useLocale();
  const rows = itemTypes
    .map((row) => ({ itemType: row.itemType, net: row.amount - row.taxAmount }))
    .sort((left, right) => right.net - left.net);
  const largest = rows[0]?.net ?? 0;
  const taxTotal = itemTypes.reduce((sum, row) => sum + row.taxAmount, 0);
  return (
    <AnalyticsCard title={t('title')} subtitle={t('subtitle')} className="flex-1">
      {rows.length === 0 ? (
        <p className="text-[13px] text-slate-500">{t('empty')}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {rows.map((row) => (
            <li key={row.itemType} className="flex h-7 items-center gap-3">
              <span className="w-[110px] shrink-0 truncate text-[13px] text-slate-900">
                {t(`names.${row.itemType}`)}
              </span>
              <span
                aria-hidden="true"
                className="h-2.5 grow overflow-hidden rounded-full bg-surface-container-low"
              >
                <span
                  className="block h-full rounded-full bg-primary"
                  style={{ width: `${largest > 0 ? (row.net / largest) * PERCENT : 0}%` }}
                />
              </span>
              <span className="w-[92px] shrink-0 text-right text-[13px] font-semibold text-slate-900 tabular-nums">
                {formatRupiah(row.net, locale, { isCompact: true })}
              </span>
            </li>
          ))}
        </ul>
      )}
      {taxTotal > 0 ? (
        <p className="text-xs text-slate-500">
          {t('taxNote', { amount: formatRupiah(taxTotal, locale, { isCompact: true }) })}
        </p>
      ) : null}
    </AnalyticsCard>
  );
}
