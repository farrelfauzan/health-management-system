'use client';

import type { DocumentApprovalQueueItemView } from '@hms/shared-types';
import { TableBody, TableHeader, TableRow } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { DocumentApprovalQueueRow } from '#components/client/document-approvals/document-approval-queue-row';
import { DataTable } from '#components/shared/data-table';
import { DataTableHeaderCell } from '#components/shared/data-table-header-cell';
import { EmptyState } from '#components/shared/empty-state';
import { TableSkeleton } from '#components/shared/table-skeleton';

const TABLE_COLUMN_COUNT = 5;

type DocumentApprovalQueueTableProps = {
  items: DocumentApprovalQueueItemView[];
  isPending: boolean;
  isError: boolean;
};

/** The queue, deadline-first: the most pressing decision is the top row. */
export function DocumentApprovalQueueTable({
  items,
  isPending,
  isError,
}: DocumentApprovalQueueTableProps) {
  const t = useTranslations('operations.documents.approvals.queue');

  if (!isPending && items.length === 0) {
    return (
      <EmptyState
        icon={isError ? 'error' : 'how_to_reg'}
        title={isError ? t('loadError') : t('empty')}
        description={isError ? t('loadErrorDescription') : t('emptyDescription')}
        className="border-0"
      />
    );
  }

  return (
    <DataTable className="rounded-xl border-0" minWidthClassName="min-w-[56rem]">
      <TableHeader>
        <TableRow>
          <DataTableHeaderCell>{t('columns.document')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('columns.type')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('columns.drafter')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('columns.dueAt')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('columns.age')}</DataTableHeaderCell>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isPending ? (
          <TableSkeleton columns={TABLE_COLUMN_COUNT} />
        ) : (
          items.map((item) => <DocumentApprovalQueueRow key={item.round.id} item={item} />)
        )}
      </TableBody>
    </DataTable>
  );
}
