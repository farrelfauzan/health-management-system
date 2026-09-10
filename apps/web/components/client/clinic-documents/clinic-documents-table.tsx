'use client';

import type { ClinicDocumentView } from '@hms/shared-types';
import { Checkbox, Table, TableBody, TableHead, TableHeader, TableRow } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { ClinicDocumentsTableRow } from '#components/client/clinic-documents/clinic-documents-table-row';
import { canSubmitClinicDocument } from '#lib/clinic-documents/can-submit-clinic-document';

type ClinicDocumentsTableProps = {
  documents: ClinicDocumentView[];
  selectedIds: ReadonlySet<string>;
  currentUserId: string | null;
  onSelectedChange: (documentId: string, isSelected: boolean) => void;
  onSelectAllChange: (isSelected: boolean) => void;
  onResult: (message: string) => void;
  onError: (message: string) => void;
};

export function ClinicDocumentsTable({
  documents,
  selectedIds,
  currentUserId,
  onSelectedChange,
  onSelectAllChange,
  onResult,
  onError,
}: ClinicDocumentsTableProps) {
  const t = useTranslations('clinicCorpus.table');
  const selectable = documents.filter((document) => canSubmitClinicDocument(document.approval));
  const areAllSelected =
    selectable.length > 0 && selectable.every((document) => selectedIds.has(document.id));

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">
            {/* Selects only the rows something can be done to, and only the
                ones on this page — a selection that survived a page turn
                would submit documents the admin is no longer looking at. */}
            {selectable.length === 0 ? (
              <span className="sr-only">{t('columns.select')}</span>
            ) : (
              <Checkbox
                checked={areAllSelected}
                aria-label={t('selectAll')}
                onCheckedChange={(checked) => onSelectAllChange(checked === true)}
              />
            )}
          </TableHead>
          <TableHead>{t('columns.title')}</TableHead>
          <TableHead>{t('columns.visibility')}</TableHead>
          <TableHead>{t('columns.status')}</TableHead>
          <TableHead>{t('columns.approval')}</TableHead>
          <TableHead>{t('columns.chunks')}</TableHead>
          <TableHead>{t('columns.size')}</TableHead>
          <TableHead className="text-right">{t('columns.actions')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {documents.map((document) => (
          <ClinicDocumentsTableRow
            key={document.id}
            document={document}
            isSelectable={canSubmitClinicDocument(document.approval)}
            isSelected={selectedIds.has(document.id)}
            currentUserId={currentUserId}
            onSelectedChange={(isSelected) => onSelectedChange(document.id, isSelected)}
            onResult={onResult}
            onError={onError}
          />
        ))}
      </TableBody>
    </Table>
  );
}
