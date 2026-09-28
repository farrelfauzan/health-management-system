'use client';

import { cn, Icon } from '@hms/ui';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { AnalyticsCard } from '#components/client/analytics/analytics-card';
import type { AnalyticsPeriodRange } from '#lib/analytics/analytics-filter-state';
import { useAnalyticsReportingHealth } from '#lib/analytics/use-analytics-reporting-health';

type AnalyticsReportingSummaryCardProps = {
  range: AnalyticsPeriodRange;
  href: string;
};

type SummaryLine = {
  key: string;
  icon: string;
  label: string;
  failed: number;
  pending: number;
};

/**
 * The Operasional page's small reporting card: failed and pending counts per
 * integration, and the way into the full status page. Stays out of the way
 * while it loads or when it cannot load; the full page says why.
 */
export function AnalyticsReportingSummaryCard({ range, href }: AnalyticsReportingSummaryCardProps) {
  const t = useTranslations('analytics.reporting');
  const { reportingHealth } = useAnalyticsReportingHealth(range, true);
  if (!reportingHealth) {
    return null;
  }
  const lines: SummaryLine[] = [
    {
      key: 'satusehat',
      icon: 'cloud_upload',
      label: t('satusehat.title'),
      failed: reportingHealth.satusehat.reduce((total, row) => total + row.failed, 0),
      pending: reportingHealth.satusehat.reduce((total, row) => total + row.pending, 0),
    },
    ...(reportingHealth.bpjs
      ? [
          {
            key: 'bpjs',
            icon: 'verified_user',
            label: 'BPJS',
            failed: reportingHealth.bpjs.reduce((total, row) => total + row.failed, 0),
            pending: reportingHealth.bpjs.reduce((total, row) => total + row.pending, 0),
          },
        ]
      : []),
  ];
  return (
    <AnalyticsCard
      title={t('summary.title')}
      subtitle={t('summary.subtitle')}
      className="flex-[2_1_0] xl:max-w-[40%]"
    >
      <ul className="flex flex-col gap-3">
        {lines.map((line) => (
          <li key={line.key} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 text-slate-900">
              <Icon name={line.icon} size={20} className="text-on-surface-variant" />
              {line.label}
            </span>
            <span className="flex gap-1.5 text-xs font-medium">
              <span
                className={cn(
                  'rounded-full px-2 py-0.5',
                  line.failed > 0
                    ? 'bg-danger-tint text-danger'
                    : 'bg-surface-container-low text-slate-500',
                )}
              >
                {t('summary.failed', { count: line.failed })}
              </span>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5',
                  line.pending > 0
                    ? 'bg-warning-tint text-warning'
                    : 'bg-surface-container-low text-slate-500',
                )}
              >
                {t('summary.pending', { count: line.pending })}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <Link href={href} className="flex items-center gap-1 text-[13px] font-semibold text-primary">
        {t('summary.open')}
        <Icon name="arrow_forward" size={16} />
      </Link>
    </AnalyticsCard>
  );
}
