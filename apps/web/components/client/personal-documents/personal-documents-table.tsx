'use client';

import type { PersonalDocumentView } from '@hms/shared-types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { PersonalDocumentIngestBadge } from '#components/client/personal-documents/personal-document-ingest-badge';
import { PersonalDocumentRowActions } from '#components/client/personal-documents/personal-document-row-actions';

type PersonalDocumentsTableProps = {
  documents: PersonalDocumentView[];
  onResult: (message: string) => void;
  onError: (message: string) => void;
};

function formatSize(sizeBytes: number): string {
  const kilobytes = sizeBytes / 1024;
  return kilobytes < 1024
    ? `${Math.max(1, Math.round(kilobytes))} KB`
    : `${(kilobytes / 1024).toFixed(1)} MB`;
}

export function PersonalDocumentsTable({
  documents,
  onResult,
  onError,
}: PersonalDocumentsTableProps) {
  const t = useTranslations('personalKnowledgeBase.table');

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('columns.title')}</TableHead>
          <TableHead>{t('columns.status')}</TableHead>
          <TableHead>{t('columns.chunks')}</TableHead>
          <TableHead>{t('columns.size')}</TableHead>
          <TableHead className="text-right">{t('columns.actions')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {documents.map((document) => (
          <TableRow key={document.id}>
            <TableCell>
              <p className="font-medium text-slate-900">{document.title}</p>
              <p className="text-xs text-slate-500">{document.language}</p>
            </TableCell>
            <TableCell>
              <PersonalDocumentIngestBadge
                status={document.ingestStatus}
                ingestError={document.ingestError}
              />
            </TableCell>
            {/* Zero chunks and a READY status cannot co-occur, but showing the
                count keeps the "is it actually retrievable" question answerable
                without opening the row. */}
            <TableCell>{document.chunkCount}</TableCell>
            <TableCell>{formatSize(document.sizeBytes)}</TableCell>
            <TableCell className="text-right">
              <PersonalDocumentRowActions
                document={document}
                onResult={onResult}
                onError={onError}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
