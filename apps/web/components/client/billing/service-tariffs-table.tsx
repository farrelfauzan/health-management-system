'use client';

import type { ServiceTariffResponse } from '@hms/shared-types';
import { TableBody, TableHeader, TableRow } from '@hms/ui';

import { ServiceTariffsTableRow } from '#components/client/billing/service-tariffs-table-row';
import { DataTable } from '#components/shared/data-table';
import { DataTableHeaderCell } from '#components/shared/data-table-header-cell';
import { EmptyState } from '#components/shared/empty-state';
import { TableSkeleton } from '#components/shared/table-skeleton';

const TABLE_COLUMN_COUNT = 7;

type ServiceTariffsTableProps = {
  tariffs: ServiceTariffResponse[];
  isPending: boolean;
  isError: boolean;
  canManage: boolean;
  onEdit: (tariff: ServiceTariffResponse) => void;
};

export function ServiceTariffsTable({
  tariffs,
  isPending,
  isError,
  canManage,
  onEdit,
}: ServiceTariffsTableProps) {
  const showEmptyState = !isPending && tariffs.length === 0;

  if (showEmptyState) {
    return (
      <EmptyState
        icon={isError ? 'error' : 'price_change'}
        title={isError ? 'Unable to load tariffs' : 'No tariffs yet'}
        description={
          isError
            ? 'Something went wrong while fetching the price list. It retries automatically.'
            : 'Add a consultation tariff first — without one, generated invoices report a gap instead of billing the visit.'
        }
      />
    );
  }

  return (
    <DataTable>
      <TableHeader>
        <TableRow>
          <DataTableHeaderCell>Code</DataTableHeaderCell>
          <DataTableHeaderCell>Name</DataTableHeaderCell>
          <DataTableHeaderCell>Category</DataTableHeaderCell>
          <DataTableHeaderCell>ICD-9-CM</DataTableHeaderCell>
          <DataTableHeaderCell>Price</DataTableHeaderCell>
          <DataTableHeaderCell>Status</DataTableHeaderCell>
          <DataTableHeaderCell className="text-right">Actions</DataTableHeaderCell>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isPending ? (
          <TableSkeleton columns={TABLE_COLUMN_COUNT} />
        ) : (
          tariffs.map((tariff) => (
            <ServiceTariffsTableRow
              key={tariff.id}
              tariff={tariff}
              canManage={canManage}
              onEdit={onEdit}
            />
          ))
        )}
      </TableBody>
    </DataTable>
  );
}
