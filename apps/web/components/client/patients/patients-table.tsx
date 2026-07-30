'use client';

import type { PatientListItem } from '@hms/shared-types';
import { useTranslations } from 'next-intl';
import { TableBody, TableHeader, TableRow } from '@hms/ui';

import { PatientsTableRow } from '#components/client/patients/patients-table-row';
import { DataTable } from '#components/shared/data-table';
import { DataTableHeaderCell } from '#components/shared/data-table-header-cell';
import { EmptyState } from '#components/shared/empty-state';
import { TableSkeleton } from '#components/shared/table-skeleton';

const TABLE_COLUMN_COUNT = 4;

type PatientsTableProps = {
  patients: PatientListItem[];
  isPending: boolean;
  isError: boolean;
  onView: (patientId: string) => void;
  onAssignDoctor: (patient: PatientListItem) => void;
};

export function PatientsTable({
  patients,
  isPending,
  isError,
  onView,
  onAssignDoctor,
}: PatientsTableProps) {
  const t = useTranslations('clinical');
  const showEmptyState = !isPending && patients.length === 0;

  if (showEmptyState) {
    return (
      <EmptyState
        icon={isError ? 'error' : 'group_off'}
        title={isError ? t('patients.errorTitle') : t('patients.emptyTitle')}
        description={isError ? t('patients.errorDescription') : t('patients.emptyDescription')}
      />
    );
  }

  return (
    <DataTable>
      <TableHeader>
        <TableRow>
          <DataTableHeaderCell>{t('patients.columns.name')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('patients.columns.doctor')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('common.status')}</DataTableHeaderCell>
          <DataTableHeaderCell className="text-right">{t('common.actions')}</DataTableHeaderCell>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isPending ? (
          <TableSkeleton columns={TABLE_COLUMN_COUNT} />
        ) : (
          patients.map((patient) => (
            <PatientsTableRow
              key={patient.id}
              patient={patient}
              onView={onView}
              onAssignDoctor={onAssignDoctor}
            />
          ))
        )}
      </TableBody>
    </DataTable>
  );
}
