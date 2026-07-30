'use client';

import type { AppointmentListItem } from '@hms/shared-types';
import { TableBody, TableHeader, TableRow } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { AppointmentsTableRow } from '#components/client/appointments/appointments-table-row';
import { DataTable } from '#components/shared/data-table';
import { DataTableHeaderCell } from '#components/shared/data-table-header-cell';
import { EmptyState } from '#components/shared/empty-state';
import { TableSkeleton } from '#components/shared/table-skeleton';

const TABLE_COLUMN_COUNT = 6;

type AppointmentsTableProps = {
  appointments: AppointmentListItem[];
  isPending: boolean;
  isError: boolean;
  onView: (appointment: AppointmentListItem) => void;
  onReschedule: (appointment: AppointmentListItem) => void;
  onCancel: (appointment: AppointmentListItem) => void;
};

export function AppointmentsTable({
  appointments,
  isPending,
  isError,
  onView,
  onReschedule,
  onCancel,
}: AppointmentsTableProps) {
  const t = useTranslations('operations');
  const showEmptyState = !isPending && appointments.length === 0;

  if (showEmptyState) {
    return (
      <EmptyState
        icon={isError ? 'error' : 'event_busy'}
        title={isError ? t('appointments.errorTitle') : t('appointments.emptyTitle')}
        description={
          isError ? t('appointments.errorDescription') : t('appointments.emptyDescription')
        }
        className="rounded-none border-0"
      />
    );
  }

  return (
    <DataTable className="rounded-none border-0">
      <TableHeader>
        <TableRow>
          <DataTableHeaderCell>{t('common.time')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('common.patient')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('common.doctor')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('common.reason')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('common.status')}</DataTableHeaderCell>
          <DataTableHeaderCell className="text-right">{t('common.actions')}</DataTableHeaderCell>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isPending ? (
          <TableSkeleton columns={TABLE_COLUMN_COUNT} />
        ) : (
          appointments.map((appointment) => (
            <AppointmentsTableRow
              key={appointment.id}
              appointment={appointment}
              onView={onView}
              onReschedule={onReschedule}
              onCancel={onCancel}
            />
          ))
        )}
      </TableBody>
    </DataTable>
  );
}
