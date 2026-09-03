'use client';

import type { DoctorListItem } from '@hms/shared-types';
import { TableBody, TableHeader, TableRow } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { DoctorsTableRow } from '#components/client/doctors/doctors-table-row';
import { DataTable } from '#components/shared/data-table';
import { DataTableHeaderCell } from '#components/shared/data-table-header-cell';
import { EmptyState } from '#components/shared/empty-state';
import { TableSkeleton } from '#components/shared/table-skeleton';

const TABLE_COLUMN_COUNT = 6;

type DoctorsTableProps = {
  doctors: DoctorListItem[];
  /**
   * Doctor id to the date of their soonest-expiring lapsed licence
   * (US-E3-08). Empty for a viewer who cannot read the expiry roster, so the
   * flag is absent rather than wrong.
   */
  expiredLicensesByDoctorId: Map<string, string>;
  isPending: boolean;
  isError: boolean;
  onView: (doctorId: string) => void;
  onEdit: (doctor: DoctorListItem) => void;
  onManageSchedule: (doctor: DoctorListItem) => void;
  onAssignPatient: (doctor: DoctorListItem) => void;
};

export function DoctorsTable({
  doctors,
  expiredLicensesByDoctorId,
  isPending,
  isError,
  onView,
  onEdit,
  onManageSchedule,
  onAssignPatient,
}: DoctorsTableProps) {
  const t = useTranslations('clinical');
  const showEmptyState = !isPending && doctors.length === 0;

  if (showEmptyState) {
    return (
      <EmptyState
        icon={isError ? 'error' : 'stethoscope'}
        title={isError ? t('doctors.errorTitle') : t('doctors.emptyTitle')}
        description={isError ? t('doctors.errorDescription') : t('doctors.emptyDescription')}
      />
    );
  }

  return (
    <DataTable>
      <TableHeader>
        <TableRow>
          <DataTableHeaderCell>{t('doctors.columns.name')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('doctors.columns.license')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('doctors.columns.schedule')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('doctors.columns.patients')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('common.status')}</DataTableHeaderCell>
          <DataTableHeaderCell className="text-right">{t('common.actions')}</DataTableHeaderCell>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isPending ? (
          <TableSkeleton columns={TABLE_COLUMN_COUNT} />
        ) : (
          doctors.map((doctor) => (
            <DoctorsTableRow
              key={doctor.id}
              doctor={doctor}
              expiredLicenseAt={expiredLicensesByDoctorId.get(doctor.id)}
              onView={onView}
              onEdit={onEdit}
              onManageSchedule={onManageSchedule}
              onAssignPatient={onAssignPatient}
            />
          ))
        )}
      </TableBody>
    </DataTable>
  );
}
