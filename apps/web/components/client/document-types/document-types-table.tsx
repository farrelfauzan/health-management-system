'use client';

import type { DocumentTypeView } from '@hms/shared-types';
import { TableBody, TableHeader, TableRow } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { DocumentTypesTableRow } from '#components/client/document-types/document-types-table-row';
import { DataTable } from '#components/shared/data-table';
import { DataTableHeaderCell } from '#components/shared/data-table-header-cell';
import { EmptyState } from '#components/shared/empty-state';
import { TableSkeleton } from '#components/shared/table-skeleton';

const TABLE_COLUMN_COUNT = 7;

type DocumentTypesTableProps = {
  types: DocumentTypeView[];
  isPending: boolean;
  isError: boolean;
  canWrite: boolean;
  isMutating: boolean;
  onEdit: (type: DocumentTypeView) => void;
  onApprovers: (type: DocumentTypeView) => void;
  onToggleActive: (type: DocumentTypeView) => void;
  onDelete: (type: DocumentTypeView) => void;
};

export function DocumentTypesTable({
  types,
  isPending,
  isError,
  canWrite,
  isMutating,
  onEdit,
  onApprovers,
  onToggleActive,
  onDelete,
}: DocumentTypesTableProps) {
  const t = useTranslations('operations.documents.types');
  const showEmptyState = !isPending && types.length === 0;

  if (showEmptyState) {
    return (
      <EmptyState
        icon={isError ? 'error' : 'folder_managed'}
        title={isError ? t('loadError') : t('empty')}
        description={isError ? t('loadErrorDescription') : t('emptyDescription')}
        className="border-0"
      />
    );
  }

  return (
    <DataTable className="rounded-xl border-0" minWidthClassName="min-w-[64rem]">
      <TableHeader>
        <TableRow>
          <DataTableHeaderCell>{t('columns.name')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('columns.approval')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('columns.parties')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('columns.content')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('columns.documents')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('columns.status')}</DataTableHeaderCell>
          <DataTableHeaderCell className="text-right">{t('columns.actions')}</DataTableHeaderCell>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isPending ? (
          <TableSkeleton columns={TABLE_COLUMN_COUNT} />
        ) : (
          types.map((type) => (
            <DocumentTypesTableRow
              key={type.id}
              type={type}
              canWrite={canWrite}
              isMutating={isMutating}
              onEdit={onEdit}
              onApprovers={onApprovers}
              onToggleActive={onToggleActive}
              onDelete={onDelete}
            />
          ))
        )}
      </TableBody>
    </DataTable>
  );
}
