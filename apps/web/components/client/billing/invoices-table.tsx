'use client';

import type { InvoiceListItem } from '@hms/shared-types';
import { TableBody, TableHeader, TableRow } from '@hms/ui';

import { InvoicesTableRow } from '#components/client/billing/invoices-table-row';
import { DataTable } from '#components/shared/data-table';
import { DataTableHeaderCell } from '#components/shared/data-table-header-cell';
import { EmptyState } from '#components/shared/empty-state';
import { TableSkeleton } from '#components/shared/table-skeleton';

const TABLE_COLUMN_COUNT = 7;

type InvoicesTableProps = {
  invoices: InvoiceListItem[];
  isPending: boolean;
  isError: boolean;
  onOpen: (invoice: InvoiceListItem) => void;
};

export function InvoicesTable({ invoices, isPending, isError, onOpen }: InvoicesTableProps) {
  const showEmptyState = !isPending && invoices.length === 0;

  if (showEmptyState) {
    return (
      <EmptyState
        icon={isError ? 'error' : 'receipt_long'}
        title={isError ? 'Unable to load invoices' : 'No invoices found'}
        description={
          isError
            ? 'Something went wrong while fetching invoices. It retries automatically.'
            : 'Invoices appear here once one is generated from a finished encounter.'
        }
      />
    );
  }

  return (
    <DataTable>
      <TableHeader>
        <TableRow>
          <DataTableHeaderCell>Invoice No.</DataTableHeaderCell>
          <DataTableHeaderCell>Patient</DataTableHeaderCell>
          <DataTableHeaderCell>Created</DataTableHeaderCell>
          <DataTableHeaderCell>Items</DataTableHeaderCell>
          <DataTableHeaderCell>Total</DataTableHeaderCell>
          <DataTableHeaderCell>Status</DataTableHeaderCell>
          <DataTableHeaderCell className="text-right">Actions</DataTableHeaderCell>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isPending ? (
          <TableSkeleton columns={TABLE_COLUMN_COUNT} />
        ) : (
          invoices.map((invoice) => (
            <InvoicesTableRow key={invoice.id} invoice={invoice} onOpen={onOpen} />
          ))
        )}
      </TableBody>
    </DataTable>
  );
}
