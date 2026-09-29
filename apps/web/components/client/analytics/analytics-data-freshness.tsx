'use client';

import { Button, Icon } from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import { resolveTimeZoneAbbreviation } from '#lib/analytics/resolve-time-zone-abbreviation';

type AnalyticsDataFreshnessProps = {
  generatedAt?: string;
  timeZone?: string;
  isFetching: boolean;
  onReload: () => void;
};

/**
 * "Data per 14.32 WIB" and "Muat ulang". The time is when the API read the
 * figures, not when the page loaded: a cached answer says how old it is.
 */
export function AnalyticsDataFreshness({
  generatedAt,
  timeZone,
  isFetching,
  onReload,
}: AnalyticsDataFreshnessProps) {
  const t = useTranslations('analytics.freshness');
  const format = useFormatter();
  return (
    <div className="flex items-center gap-2">
      {generatedAt && timeZone ? (
        <span className="flex items-center gap-1.5 text-[13px] text-slate-500">
          <Icon name="schedule" size={16} />
          {t('asOf', {
            time: format.dateTime(new Date(generatedAt), {
              hour: '2-digit',
              minute: '2-digit',
              timeZone,
            }),
            zone: resolveTimeZoneAbbreviation(timeZone),
          })}
        </span>
      ) : null}
      <Button type="button" variant="ghost" onClick={onReload} disabled={isFetching}>
        <Icon name="refresh" size={18} className={isFetching ? 'animate-spin' : undefined} />
        {isFetching ? t('reloading') : t('reload')}
      </Button>
    </div>
  );
}
