'use client';

import type { ChannelArrivalView } from '@hms/shared-types';
import { Badge, TableCell, TableRow } from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import { ChannelArrivalMissingFields } from '#components/client/channel-arrivals/channel-arrival-missing-fields';
import { ChannelArrivalRowActions } from '#components/client/channel-arrivals/channel-arrival-row-actions';

type ChannelArrivalsTableRowProps = {
  arrival: ChannelArrivalView;
  onResult: (message: string) => void;
  onFailed: (message: string) => void;
};

/**
 * One chat booking at the counter.
 *
 * The reference code leads the row because it is what the customer reads out:
 * they were told it in the confirmation reply, and it is the only handle they
 * have before anyone has identified them.
 */
export function ChannelArrivalsTableRow({
  arrival,
  onResult,
  onFailed,
}: ChannelArrivalsTableRowProps) {
  const t = useTranslations('channelArrivals.table');
  const format = useFormatter();

  return (
    <TableRow>
      <TableCell>
        <p className="font-mono text-sm font-medium text-slate-900">
          {arrival.bookingReferenceCode ?? '—'}
        </p>
        <p className="text-xs text-slate-500">{arrival.channel}</p>
      </TableCell>
      <TableCell>
        <p className="font-medium text-slate-900">{arrival.patientFullName}</p>
        <p className="text-xs text-slate-500">
          {arrival.patientMrn} · {arrival.patientPhoneNumber}
        </p>
      </TableCell>
      <TableCell>
        {arrival.patientIsDraft ? (
          <Badge className="bg-amber-100 text-amber-900">{t('draft')}</Badge>
        ) : (
          <Badge className="bg-slate-100 text-slate-700">{t('linked')}</Badge>
        )}
      </TableCell>
      <TableCell>
        <ChannelArrivalMissingFields
          missingFields={arrival.missingFields}
          isDraft={arrival.patientIsDraft}
        />
      </TableCell>
      <TableCell>
        <p className="text-sm text-slate-800">{arrival.doctorName}</p>
        <p className="text-xs text-slate-500">{arrival.specialty ?? '—'}</p>
      </TableCell>
      <TableCell className="text-sm text-slate-600">
        {format.dateTime(new Date(arrival.scheduledAt), {
          dateStyle: 'short',
          timeStyle: 'short',
        })}
      </TableCell>
      <TableCell className="text-right">
        <ChannelArrivalRowActions
          arrival={arrival}
          onResult={onResult}
          onFailed={onFailed}
        />
      </TableCell>
    </TableRow>
  );
}
