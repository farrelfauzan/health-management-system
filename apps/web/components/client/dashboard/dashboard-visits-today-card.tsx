'use client';

import { Card, CardContent, CardHeader, CardTitle, Icon, Skeleton } from '@hms/ui';
import Link from 'next/link';
import { useFormatter, useTranslations } from 'next-intl';

import { AnalyticsDeltaLine } from '#components/client/analytics/analytics-delta-line';
import { resolveAnalyticsDelta } from '#lib/analytics/resolve-analytics-delta';
import { useVisitsToday } from '#lib/dashboard/use-visits-today';

const ANALYTICS_HREF = '/admin/analytics/operations?preset=today';

/**
 * Visits so far today against the same weekday last week at the same clock
 * time (P29-T16, PRD FR-FDN-09), in the place of the invented activity feed
 * the pilot mistook for real. The change is a whole percent here; the
 * dashboards keep one decimal.
 */
export function DashboardVisitsTodayCard() {
  const t = useTranslations('dashboard.visitsToday');
  const format = useFormatter();
  const query = useVisitsToday();
  const visitsToday = query.data;
  const weekday = visitsToday
    ? format.dateTime(new Date(`${visitsToday.comparisonDate}T00:00:00Z`), {
        weekday: 'long',
        timeZone: 'UTC',
      })
    : '';
  const delta = visitsToday
    ? resolveAnalyticsDelta({
        current: visitsToday.visits,
        previous: visitsToday.comparisonVisits,
        kind: 'percent',
        higherIsBetter: true,
      })
    : null;
  function renderBody() {
    if (query.isPending) {
      return <Skeleton data-testid="visits-today-skeleton" className="h-16 rounded-lg" />;
    }
    if (!visitsToday) {
      return <p className="text-[13px] text-slate-500">{t('unableToLoad')}</p>;
    }
    return (
      <div className="flex flex-col gap-1.5">
        <p className="text-xs text-slate-500">{t('subtitle', { weekday })}</p>
        <span className="text-[30px] font-bold tracking-tight text-slate-900 tabular-nums">
          {format.number(visitsToday.visits)}
        </span>
        {delta ? (
          <AnalyticsDeltaLine
            delta={{ ...delta, value: Math.round(delta.value) }}
            previousLabel={t('previous', {
              previous: format.number(visitsToday.comparisonVisits),
              weekday,
            })}
          />
        ) : (
          <p className="text-[13px] text-slate-500">{t('noComparison', { weekday })}</p>
        )}
      </div>
    );
  }
  return (
    <Card className="rounded-xl border-slate-200 shadow-none">
      <CardHeader className="flex flex-row items-center gap-2">
        <span className="text-primary">
          <Icon name="monitoring" size={20} />
        </span>
        <CardTitle className="font-heading text-base font-semibold text-slate-900">
          {t('title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {renderBody()}
        <Link
          href={ANALYTICS_HREF}
          className="flex items-center gap-1 self-start text-[13px] font-semibold text-primary"
        >
          {t('link')}
          <Icon name="arrow_forward" size={16} />
        </Link>
      </CardContent>
    </Card>
  );
}
