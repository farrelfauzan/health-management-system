'use client';

import type { DocumentTemplateView } from '@hms/shared-types';
import { TableBody, TableHeader, TableRow } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { DocumentTemplatesTableRow } from '#components/client/document-templates/document-templates-table-row';
import { DataTable } from '#components/shared/data-table';
import { DataTableHeaderCell } from '#components/shared/data-table-header-cell';
import { EmptyState } from '#components/shared/empty-state';
import { TableSkeleton } from '#components/shared/table-skeleton';

const TABLE_COLUMN_COUNT = 6;

type DocumentTemplatesTableProps = {
  templates: DocumentTemplateView[];
  isPending: boolean;
  isError: boolean;
  canWrite: boolean;
  isMutating: boolean;
  onEdit: (template: DocumentTemplateView) => void;
  onSetDefault: (template: DocumentTemplateView) => void;
  onArchive: (template: DocumentTemplateView) => void;
};

export function DocumentTemplatesTable({
  templates,
  isPending,
  isError,
  canWrite,
  isMutating,
  onEdit,
  onSetDefault,
  onArchive,
}: DocumentTemplatesTableProps) {
  const t = useTranslations('operations.billing.templates');
  const showEmptyState = !isPending && templates.length === 0;

  if (showEmptyState) {
    return (
      <EmptyState
        icon={isError ? 'error' : 'description'}
        title={isError ? t('loadError') : t('empty')}
        description={isError ? t('loadErrorDescription') : t('emptyDescription')}
        className="border-0"
      />
    );
  }

  return (
    <DataTable className="rounded-xl border-0" minWidthClassName="min-w-[48rem]">
      <TableHeader>
        <TableRow>
          <DataTableHeaderCell>{t('columns.name')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('columns.status')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('columns.default')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('columns.version')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('columns.updated')}</DataTableHeaderCell>
          <DataTableHeaderCell className="text-right">{t('columns.actions')}</DataTableHeaderCell>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isPending ? (
          <TableSkeleton columns={TABLE_COLUMN_COUNT} />
        ) : (
          templates.map((template) => (
            <DocumentTemplatesTableRow
              key={template.id}
              template={template}
              canWrite={canWrite}
              isMutating={isMutating}
              onEdit={onEdit}
              onSetDefault={onSetDefault}
              onArchive={onArchive}
            />
          ))
        )}
      </TableBody>
    </DataTable>
  );
}
