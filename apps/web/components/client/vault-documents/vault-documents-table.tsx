'use client';

import type { VaultDocumentView } from '@hms/shared-types';
import { TableBody, TableHeader, TableRow } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { VaultDocumentsTableRow } from '#components/client/vault-documents/vault-documents-table-row';
import { DataTable } from '#components/shared/data-table';
import { DataTableHeaderCell } from '#components/shared/data-table-header-cell';

type VaultDocumentsTableProps = {
  documents: VaultDocumentView[];
  onResult: (message: string) => void;
  onError: (message: string) => void;
};

export function VaultDocumentsTable({ documents, onResult, onError }: VaultDocumentsTableProps) {
  const t = useTranslations('vault.table');

  return (
    <DataTable>
      <TableHeader>
        <TableRow>
          <DataTableHeaderCell>{t('columns.document')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('columns.category')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('columns.issuedAt')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('columns.expiresAt')}</DataTableHeaderCell>
          <DataTableHeaderCell>{t('columns.size')}</DataTableHeaderCell>
          <DataTableHeaderCell className="text-right">{t('columns.actions')}</DataTableHeaderCell>
        </TableRow>
      </TableHeader>
      <TableBody>
        {documents.map((document) => (
          <VaultDocumentsTableRow
            key={document.id}
            document={document}
            onResult={onResult}
            onError={onError}
          />
        ))}
      </TableBody>
    </DataTable>
  );
}
