'use client';

import type { ManagedDocumentView } from '@hms/shared-types';
import { TableBody, TableHeader, TableRow } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { ManagedDocumentsTableRow } from '#components/client/managed-documents/managed-documents-table-row';
import { DataTable } from '#components/shared/data-table';
import { DataTableHeaderCell } from '#components/shared/data-table-header-cell';
import { EmptyState } from '#components/shared/empty-state';
import { TableSkeleton } from '#components/shared/table-skeleton';

const TABLE_COLUMN_COUNT = 7;

type ManagedDocumentsTableProps = {
  documents: ManagedDocumentView[];
  isPending: boolean;
  isError: boolean;
  isFiltered: boolean;
  onError: (message: string) => void;
};

export function ManagedDocumentsTable({
  documents,
  isPending,
  isError,
  isFiltered,
  onError,
}: ManagedDocumentsTableProps) {
  const t = useTranslations('operations.documents.registry');
  const showEmptyState = !isPending && documents.length === 0;

  if (showEmptyState) {
    return (
      <EmptyState
        icon={isError ? 'error' : 'folder_managed'}
        title={isError ? t('loadError') : isFiltered ? t('emptyFiltered') : t('empty')}
        description={
          isError ? t('loadErrorDescription') : isFiltered ? undefined : t('emptyDescription')
        }
        className="border-0"
      />
    );
  }

  return (
    <DataTable className="rounded-xl border-0" minWidthClassName="min-w-[64rem]">
      <TableHeader>
        <TableRow>
          <DataTableHeaderCell>{t('columns.title')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('columns.type')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('columns.parties')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('columns.status')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('columns.draftedBy')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('columns.created')}</DataTableHeaderCell>
          <DataTableHeaderCell className="text-right">{t('columns.actions')}</DataTableHeaderCell>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isPending ? (
          <TableSkeleton columns={TABLE_COLUMN_COUNT} />
        ) : (
          documents.map((document) => (
            <ManagedDocumentsTableRow key={document.id} document={document} onError={onError} />
          ))
        )}
      </TableBody>
    </DataTable>
  );
}
