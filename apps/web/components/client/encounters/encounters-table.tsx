'use client';

import type { EncounterListItem } from '@hms/shared-types';
import { TableBody, TableHeader, TableRow } from '@hms/ui';

import { EncountersTableRow } from '#components/client/encounters/encounters-table-row';
import { DataTable } from '#components/shared/data-table';
import { DataTableHeaderCell } from '#components/shared/data-table-header-cell';
import { EmptyState } from '#components/shared/empty-state';
import { TableSkeleton } from '#components/shared/table-skeleton';

const TABLE_COLUMN_COUNT = 8;

type EncountersTableProps = {
  encounters: EncounterListItem[];
  isPending: boolean;
  isError: boolean;
  basePath: string;
};

export function EncountersTable({
  encounters,
  isPending,
  isError,
  basePath,
}: EncountersTableProps) {
  const showEmptyState = !isPending && encounters.length === 0;

  if (showEmptyState) {
    return (
      <EmptyState
        icon={isError ? 'error' : 'clinical_notes'}
        title={isError ? 'Unable to load encounters' : 'No encounters found'}
        description={
          isError
            ? 'Something went wrong while fetching clinical encounters. It retries automatically.'
            : 'Encounters appear here once a doctor opens one from a checked-in registration.'
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
          <DataTableHeaderCell>Started</DataTableHeaderCell>
          <DataTableHeaderCell>Duration</DataTableHeaderCell>
          <DataTableHeaderCell>Doctor</DataTableHeaderCell>
          <DataTableHeaderCell>Record</DataTableHeaderCell>
          <DataTableHeaderCell>Status</DataTableHeaderCell>
          <DataTableHeaderCell className="text-right">Actions</DataTableHeaderCell>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isPending ? (
          <TableSkeleton columns={TABLE_COLUMN_COUNT} />
        ) : (
          encounters.map((encounter) => (
            <EncountersTableRow key={encounter.id} encounter={encounter} basePath={basePath} />
          ))
        )}
      </TableBody>
    </DataTable>
  );
}
