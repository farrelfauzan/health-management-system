'use client';

import type { ChannelArrivalView } from '@hms/shared-types';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { ChannelArrivalsTableRow } from '#components/client/channel-arrivals/channel-arrivals-table-row';

type ChannelArrivalsTableProps = {
  arrivals: ChannelArrivalView[];
  onResult: (message: string) => void;
  onFailed: (message: string) => void;
};

export function ChannelArrivalsTable({
  arrivals,
  onResult,
  onFailed,
}: ChannelArrivalsTableProps) {
  const t = useTranslations('channelArrivals.table');

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('columns.reference')}</TableHead>
          <TableHead>{t('columns.patient')}</TableHead>
          <TableHead>{t('columns.record')}</TableHead>
          <TableHead>{t('columns.missing')}</TableHead>
          <TableHead>{t('columns.doctor')}</TableHead>
          <TableHead>{t('columns.scheduled')}</TableHead>
          <TableHead className="text-right">{t('columns.actions')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {arrivals.map((arrival) => (
          <ChannelArrivalsTableRow
            key={arrival.appointmentId}
            arrival={arrival}
            onResult={onResult}
            onFailed={onFailed}
          />
        ))}
      </TableBody>
    </Table>
  );
}
