'use client';

import { useState } from 'react';
import { Card, CardContent } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { ChannelArrivalsTable } from '#components/client/channel-arrivals/channel-arrivals-table';
import { useChannelArrivals } from '#lib/channel-arrivals/use-channel-arrivals';

/**
 * The check-in desk's chat-booking worklist (`PCS-T08`, strategy §5.2).
 *
 * Rendered on the registration screen rather than as a route of its own,
 * because it is not a destination: it is the thing the desk needs *while*
 * checking someone in, and a worklist on a separate page is a worklist people
 * remember to open after the queue has already moved.
 *
 * Rows whose record is still a draft are shown first. That ordering is the
 * whole point of the panel — a booking whose patient has a complete record
 * needs nothing from anyone, and it is listed only so the desk knows the
 * person booked from a phone rather than at the counter.
 */
export function ChannelArrivalsPanel() {
  const t = useTranslations('channelArrivals');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const arrivalsQuery = useChannelArrivals({});
  const rows = [...arrivalsQuery.arrivals].sort((left, right) => {
    if (left.patientIsDraft === right.patientIsDraft) {
      return left.scheduledAt.localeCompare(right.scheduledAt);
    }
    return left.patientIsDraft ? -1 : 1;
  });
  const draftCount = rows.filter((arrival) => arrival.patientIsDraft).length;

  function handleResult(message: string): void {
    setError(null);
    setNotice(message);
  }

  function handleError(message: string): void {
    setNotice(null);
    setError(message);
  }

  // A quiet day is the normal case on a pilot channel, and an empty card on a
  // busy registration screen is noise. Nothing to do means nothing to render.
  if (!arrivalsQuery.isLoading && rows.length === 0) {
    return null;
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-heading text-lg font-semibold text-slate-900">{t('title')}</h2>
        <p className="text-sm text-slate-500">
          {draftCount === 0 ? t('allComplete') : t('draftCount', { count: draftCount })}
        </p>
      </div>
      {notice ? (
        <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</p>
      ) : null}
      {error ? (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-900">{error}</p>
      ) : null}
      <Card>
        <CardContent className="p-0">
          {arrivalsQuery.isLoading ? (
            <p className="p-6 text-sm text-slate-500">{t('states.loading')}</p>
          ) : arrivalsQuery.isError ? (
            <p className="p-6 text-sm text-red-700">{t('states.error')}</p>
          ) : (
            <ChannelArrivalsTable
              arrivals={rows}
              onResult={handleResult}
              onFailed={handleError}
            />
          )}
        </CardContent>
      </Card>
    </section>
  );
}
