'use client';

import type { AnalyticsPharmacyExpiryBucket } from '@hms/shared-types';
import { cn, Icon } from '@hms/ui';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';

import { AnalyticsCard } from '#components/client/analytics/analytics-card';

type AnalyticsExpiringBatchesCardProps = {
  expiring: AnalyticsPharmacyExpiryBucket[];
  asOfLabel: string;
};

const EXPIRY_REPORT_HREF = '/admin/pharmacy?tab=inventory#expiry-report';

/**
 * Batches with stock left by how soon they expire, by the expiry report's
 * rule. Expired stock still on the shelf is shown only when there is some,
 * in red: it is the one row that needs acting on today.
 */
export function AnalyticsExpiringBatchesCard({
  expiring,
  asOfLabel,
}: AnalyticsExpiringBatchesCardProps) {
  const t = useTranslations('analytics.pharmacy.expiring');
  const format = useFormatter();
  const rows = expiring.filter((row) => row.window !== 'EXPIRED' || row.batches > 0);
  return (
    <AnalyticsCard
      title={t('title')}
      subtitle={t('subtitle')}
      className="flex-1"
      action={
        <Link
          href={EXPIRY_REPORT_HREF}
          className="flex shrink-0 items-center gap-1 text-[13px] font-semibold whitespace-nowrap text-primary"
        >
          {t('link')}
          <Icon name="arrow_forward" size={16} />
        </Link>
      }
    >
      <ul className="flex flex-col gap-2.5">
        {rows.map((row) => (
          <li
            key={row.window}
            className={cn(
              'flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-[13px]',
              row.window === 'EXPIRED' ? 'bg-danger-tint text-danger' : 'bg-surface-container-low',
            )}
          >
            <span className="font-medium">{t(`windows.${row.window}`)}</span>
            <span className="flex flex-col items-end">
              <strong className="font-semibold tabular-nums">
                {t('batches', { count: format.number(row.batches) })}
              </strong>
              <span className="text-xs text-slate-500 tabular-nums">
                {t('units', { count: format.number(row.units) })}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-auto text-xs text-slate-400">{asOfLabel}</p>
    </AnalyticsCard>
  );
}
