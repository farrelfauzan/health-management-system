'use client';

import type { AnalyticsOutstandingInvoices } from '@hms/shared-types';
import {
  Icon,
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@hms/ui';
import Link from 'next/link';
import { useFormatter, useLocale, useTranslations } from 'next-intl';

import { AnalyticsCard } from '#components/client/analytics/analytics-card';
import { formatRupiah } from '#lib/analytics/format-rupiah';
import { buildInvoicesSearchParams, INVOICES_PAGE_SIZE } from '#lib/billing/search-params';

type AnalyticsOutstandingCardProps = {
  outstanding: AnalyticsOutstandingInvoices;
};

const UNPAID_INVOICES_HREF = `/admin/billing?${buildInvoicesSearchParams({
  page: 1,
  limit: INVOICES_PAGE_SIZE,
  status: 'ISSUED',
}).toString()}`;

/**
 * Every invoice unpaid now, by clinic days since it was issued, whatever
 * the period on screen: a bill from last month is still owed this month.
 * Over thirty days is flagged, and the link opens the unpaid invoices.
 */
export function AnalyticsOutstandingCard({ outstanding }: AnalyticsOutstandingCardProps) {
  const t = useTranslations('analytics.finance.outstanding');
  const format = useFormatter();
  const locale = useLocale();
  return (
    <AnalyticsCard
      title={t('title')}
      subtitle={t('subtitle')}
      className="flex-1"
      action={
        <Link
          href={UNPAID_INVOICES_HREF}
          className="flex shrink-0 items-center gap-1 text-[13px] font-semibold whitespace-nowrap text-primary"
        >
          {t('link')}
          <Icon name="arrow_forward" size={16} />
        </Link>
      }
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('age')}</TableHead>
            <TableHead className="text-right">{t('invoices')}</TableHead>
            <TableHead className="text-right">{t('amount')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {outstanding.aging.map((row) => (
            <TableRow key={row.bucket}>
              <TableCell>
                {row.bucket === 'over-30' && row.invoices > 0 ? (
                  <span className="inline-flex h-[22px] items-center rounded-full bg-danger-tint px-2 text-xs font-semibold whitespace-nowrap text-danger">
                    {t(`buckets.${row.bucket}`)}
                  </span>
                ) : (
                  t(`buckets.${row.bucket}`)
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {format.number(row.invoices)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatRupiah(row.amount, locale)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell className="font-semibold">{t('total')}</TableCell>
            <TableCell className="text-right font-semibold tabular-nums">
              {format.number(outstanding.invoices)}
            </TableCell>
            <TableCell className="text-right font-semibold tabular-nums">
              {formatRupiah(outstanding.amount, locale)}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </AnalyticsCard>
  );
}
