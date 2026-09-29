'use client';

import { cn, Icon, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@hms/ui';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';

import { AnalyticsCard } from '#components/client/analytics/analytics-card';
import type { AnalyticsBookingChannelRow } from '@hms/shared-types';

type AnalyticsBookingChannelCardProps = {
  channels: AnalyticsBookingChannelRow[];
};

// Above this share of missed bookings a channel is flagged: roughly the rate
// at which a clinic starts overbooking to compensate.
const HIGH_NO_SHOW_PERCENT = 12;

/** Where visits come from, and how often each booking channel's patients fail to turn up. */
export function AnalyticsBookingChannelCard({ channels }: AnalyticsBookingChannelCardProps) {
  const t = useTranslations('analytics.operations.channels');
  const format = useFormatter();
  return (
    <AnalyticsCard
      title={t('title')}
      subtitle={t('subtitle')}
      className="flex-1"
      action={
        <Link
          href="/admin/appointments"
          className="flex shrink-0 items-center gap-1 text-[13px] font-semibold whitespace-nowrap text-primary"
        >
          {t('appointmentsLink')}
          <Icon name="arrow_forward" size={16} />
        </Link>
      }
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('channel')}</TableHead>
            <TableHead className="text-right">{t('visits')}</TableHead>
            <TableHead className="text-right">{t('noShow')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {channels.map((row) => {
            const rate = row.noShowRatePercent;
            return (
              <TableRow key={row.channel}>
                <TableCell>{t(row.channel)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {format.number(row.bookings)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {rate === null ? (
                    '—'
                  ) : (
                    <span
                      className={cn(
                        rate > HIGH_NO_SHOW_PERCENT &&
                          'rounded-full bg-warning-tint px-2 py-0.5 font-medium text-warning',
                      )}
                    >
                      {format.number(rate, { maximumFractionDigits: 1 })}%
                    </span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </AnalyticsCard>
  );
}
