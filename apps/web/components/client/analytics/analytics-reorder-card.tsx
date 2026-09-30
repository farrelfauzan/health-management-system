'use client';

import type { AnalyticsPharmacyStockHealth } from '@hms/shared-types';
import { Icon, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@hms/ui';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';

import { AnalyticsCard } from '#components/client/analytics/analytics-card';
import { formatMedicationLabel } from '#lib/analytics/format-medication-label';

type AnalyticsReorderCardProps = {
  stock: AnalyticsPharmacyStockHealth;
  asOfLabel: string;
};

// The card shows the most urgent few; the stock page lists every one.
const SHOWN_ROWS = 6;
const REORDER_HREF = '/admin/pharmacy?tab=inventory&reorder=true';

/**
 * Medications at or below their reorder level now, fewest days of cover
 * first, whatever the period on screen. The link opens the stock page on
 * exactly this list.
 */
export function AnalyticsReorderCard({ stock, asOfLabel }: AnalyticsReorderCardProps) {
  const t = useTranslations('analytics.pharmacy.reorder');
  const format = useFormatter();
  const rows = stock.reorder.slice(0, SHOWN_ROWS);
  return (
    <AnalyticsCard
      title={t('title')}
      subtitle={t('subtitle')}
      className="flex-[2_1_0]"
      action={
        <Link
          href={REORDER_HREF}
          className="flex shrink-0 items-center gap-1 text-[13px] font-semibold whitespace-nowrap text-primary"
        >
          {t('link')}
          <Icon name="arrow_forward" size={16} />
        </Link>
      }
    >
      {rows.length === 0 ? (
        <p className="text-[13px] text-slate-500">{t('empty')}</p>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('medication')}</TableHead>
                <TableHead className="text-right">{t('stock')}</TableHead>
                <TableHead className="text-right">{t('level')}</TableHead>
                <TableHead className="text-right">{t('cover')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.medicationId}>
                  <TableCell className="max-w-[180px] truncate">
                    {formatMedicationLabel(row.name, row.strength)}
                  </TableCell>
                  <TableCell className="text-right font-semibold text-danger tabular-nums">
                    {format.number(row.stock)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {format.number(row.reorderLevel)}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap text-slate-500 tabular-nums">
                    {row.daysOfCover === null || row.daysOfCover === undefined ? (
                      <span title={t('unusedHint')}>{t('unused')}</span>
                    ) : (
                      t('coverDays', {
                        days: format.number(row.daysOfCover, { maximumFractionDigits: 0 }),
                      })
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-xs text-slate-500">
            {t('total', { count: format.number(stock.reorderCount) })}
            {stock.reorderCount > rows.length
              ? ` · ${t('shown', { shown: format.number(rows.length) })}`
              : null}
          </p>
        </>
      )}
      <p className="mt-auto text-xs text-slate-400">{asOfLabel}</p>
    </AnalyticsCard>
  );
}
