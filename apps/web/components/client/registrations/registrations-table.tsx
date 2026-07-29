'use client';

import type { RegistrationListItem } from '@hms/shared-types';
import { TableBody, TableHeader, TableRow } from '@hms/ui';

import { RegistrationsTableRow } from '#components/client/registrations/registrations-table-row';
import { DataTable } from '#components/shared/data-table';
import { DataTableHeaderCell } from '#components/shared/data-table-header-cell';
import { EmptyState } from '#components/shared/empty-state';
import { TableSkeleton } from '#components/shared/table-skeleton';
import type { RegistrationTransitionTarget } from '#lib/registrations/registration-transition-meta';
import type { RegistrationsViewVariant } from '#lib/registrations/registrations-view-variant';

const TABLE_COLUMN_COUNT = 8;

type RegistrationsTableProps = {
  registrations: RegistrationListItem[];
  variant: RegistrationsViewVariant;
  isPending: boolean;
  isError: boolean;
  onTransition: (registration: RegistrationListItem, target: RegistrationTransitionTarget) => void;
};

export function RegistrationsTable({
  registrations,
  variant,
  isPending,
  isError,
  onTransition,
}: RegistrationsTableProps) {
  const showEmptyState = !isPending && registrations.length === 0;

  if (showEmptyState) {
    return (
      <EmptyState
        icon={isError ? 'error' : 'how_to_reg'}
        title={isError ? 'Unable to load registrations' : 'No registrations found'}
        description={
          isError
            ? 'Something went wrong while fetching the registration queue. It retries automatically.'
            : 'Adjust the filters or create a new registration to see records here.'
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
          <DataTableHeaderCell>Registered</DataTableHeaderCell>
          <DataTableHeaderCell>Linked Appointment</DataTableHeaderCell>
          <DataTableHeaderCell>Doctor</DataTableHeaderCell>
          <DataTableHeaderCell>Status</DataTableHeaderCell>
          <DataTableHeaderCell>BPJS</DataTableHeaderCell>
          <DataTableHeaderCell className="text-right">Actions</DataTableHeaderCell>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isPending ? (
          <TableSkeleton columns={TABLE_COLUMN_COUNT} />
        ) : (
          registrations.map((registration) => (
            <RegistrationsTableRow
              key={registration.id}
              registration={registration}
              variant={variant}
              onTransition={onTransition}
            />
          ))
        )}
      </TableBody>
    </DataTable>
  );
}
