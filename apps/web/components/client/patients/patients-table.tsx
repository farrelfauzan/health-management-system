'use client';

import type { PatientListItem } from '@hms/shared-types';
import {
  TableBody,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@hms/ui';

import { PatientsTableRow } from '#components/client/patients/patients-table-row';
import { DataTable } from '#components/shared/data-table';
import { DataTableHeaderCell } from '#components/shared/data-table-header-cell';
import { EmptyState } from '#components/shared/empty-state';
import { TableSkeleton } from '#components/shared/table-skeleton';

const TABLE_COLUMN_COUNT = 6;

type PatientsTableProps = {
  patients: PatientListItem[];
  isPending: boolean;
  isError: boolean;
  onView: (patientId: string) => void;
  onEdit: (patient: PatientListItem) => void;
  onAssignDoctor: (patient: PatientListItem) => void;
};

export function PatientsTable({
  patients,
  isPending,
  isError,
  onView,
  onEdit,
  onAssignDoctor,
}: PatientsTableProps) {
  const showEmptyState = !isPending && patients.length === 0;

  if (showEmptyState) {
    return (
      <EmptyState
        icon={isError ? 'error' : 'group_off'}
        title={isError ? 'Unable to load patients' : 'No patients found'}
        description={
          isError
            ? 'Something went wrong while fetching the patient directory. It retries automatically.'
            : 'Adjust the filters or register a new patient to see records here.'
        }
      />
    );
  }

  return (
    <DataTable>
      <TableHeader>
        <TableRow>
          <DataTableHeaderCell>Patient Name</DataTableHeaderCell>
          <DataTableHeaderCell>Patient ID</DataTableHeaderCell>
          <DataTableHeaderCell>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger className="cursor-help underline decoration-dotted underline-offset-4">
                  Last Visit
                </TooltipTrigger>
                <TooltipContent>
                  Shows the latest record update until encounter data exists.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </DataTableHeaderCell>
          <DataTableHeaderCell>Assigned Doctor</DataTableHeaderCell>
          <DataTableHeaderCell>Status</DataTableHeaderCell>
          <DataTableHeaderCell className="text-right">Actions</DataTableHeaderCell>
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
              onEdit={onEdit}
              onAssignDoctor={onAssignDoctor}
            />
          ))
        )}
      </TableBody>
    </DataTable>
  );
}
