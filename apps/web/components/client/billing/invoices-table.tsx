'use client';

import type { InvoiceListItem } from '@hms/shared-types';
import { TableBody, TableHeader, TableRow } from '@hms/ui';
import { useTranslations } from 'next-intl';

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
  const t = useTranslations('operations');
  const showEmptyState = !isPending && invoices.length === 0;

  if (showEmptyState) {
    return (
      <EmptyState
        icon={isError ? 'error' : 'receipt_long'}
        title={isError ? t('billing.invoiceError') : t('billing.emptyInvoices')}
        description={
          isError ? t('billing.invoiceErrorDescription') : t('billing.emptyInvoicesDescription')
        }
      />
    );
  }

  return (
    <DataTable>
      <TableHeader>
        <TableRow>
          <DataTableHeaderCell>{t('common.invoiceNumber')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('common.patient')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('common.created')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('common.items')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('common.total')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('common.status')}</DataTableHeaderCell>
          <DataTableHeaderCell className="text-right">{t('common.actions')}</DataTableHeaderCell>
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
