'use client';

import type { DoctorListItem } from '@hms/shared-types';
import { TableBody, TableHeader, TableRow } from '@hms/ui';

import { DoctorsTableRow } from '#components/client/doctors/doctors-table-row';
import { DataTable } from '#components/shared/data-table';
import { DataTableHeaderCell } from '#components/shared/data-table-header-cell';
import { EmptyState } from '#components/shared/empty-state';
import { TableSkeleton } from '#components/shared/table-skeleton';

const TABLE_COLUMN_COUNT = 6;

type DoctorsTableProps = {
  doctors: DoctorListItem[];
  isPending: boolean;
  isError: boolean;
  onView: (doctorId: string) => void;
  onEdit: (doctor: DoctorListItem) => void;
  onManageSchedule: (doctor: DoctorListItem) => void;
  onAssignPatient: (doctor: DoctorListItem) => void;
};

export function DoctorsTable({
  doctors,
  isPending,
  isError,
  onView,
  onEdit,
  onManageSchedule,
  onAssignPatient,
}: DoctorsTableProps) {
  const showEmptyState = !isPending && doctors.length === 0;

  if (showEmptyState) {
    return (
      <EmptyState
        icon={isError ? 'error' : 'stethoscope'}
        title={isError ? 'Unable to load doctors' : 'No doctors found'}
        description={
          isError
            ? 'Something went wrong while fetching the doctor directory. It retries automatically.'
            : 'Adjust the filters or add a new doctor to see records here.'
        }
      />
    );
  }

  return (
    <DataTable>
      <TableHeader>
        <TableRow>
          <DataTableHeaderCell>Doctor</DataTableHeaderCell>
          <DataTableHeaderCell>License No.</DataTableHeaderCell>
          <DataTableHeaderCell>Schedule</DataTableHeaderCell>
          <DataTableHeaderCell>Patients</DataTableHeaderCell>
          <DataTableHeaderCell>Status</DataTableHeaderCell>
          <DataTableHeaderCell className="text-right">Actions</DataTableHeaderCell>
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
