'use client';

import type { PatientDocumentView } from '@hms/shared-types';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { DocumentsTableRow } from '#components/client/patient-documents/documents-table-row';

type DocumentsTableProps = {
  patientId: string;
  documents: PatientDocumentView[];
  onResult: (message: string) => void;
  onError: (message: string) => void;
};

/** The patient's file as the API returns it: newest first by document date. */
export function DocumentsTable({ patientId, documents, onResult, onError }: DocumentsTableProps) {
  const t = useTranslations('clinical.patients.documents.columns');

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('title')}</TableHead>
          <TableHead>{t('category')}</TableHead>
          <TableHead>{t('documentDate')}</TableHead>
          <TableHead>{t('size')}</TableHead>
          <TableHead>{t('visit')}</TableHead>
          <TableHead>{t('released')}</TableHead>
          <TableHead>{t('uploader')}</TableHead>
          <TableHead className="text-right">{t('actions')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {documents.map((document) => (
          <DocumentsTableRow
            key={document.id}
            patientId={patientId}
            document={document}
            onResult={onResult}
            onError={onError}
          />
        ))}
      </TableBody>
    </Table>
  );
}
