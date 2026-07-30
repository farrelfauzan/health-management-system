'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

import {
  DASHBOARD_REFRESH_INTERVAL_MS,
  formatRefreshCountdown,
} from '#lib/dashboard/dashboard-refresh';

type RefreshCountdownProps = {
  dataUpdatedAt: number;
  intervalMs?: number;
};

export function RefreshCountdown({
  dataUpdatedAt,
  intervalMs = DASHBOARD_REFRESH_INTERVAL_MS,
}: RefreshCountdownProps) {
  const t = useTranslations('dashboard.appointments');
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    const timerId = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timerId);
  }, []);
  const anchorMs = dataUpdatedAt > 0 ? dataUpdatedAt : nowMs;
  const remainingMs = intervalMs - (nowMs - anchorMs);
  return (
    <p className="w-full text-center text-xs text-slate-400">
      {t.rich('nextRefresh', {
        countdown: () => (
          <span className="font-mono text-slate-500">{formatRefreshCountdown(remainingMs)}</span>
        ),
      })}
    </p>
  );
}
