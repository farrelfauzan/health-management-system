'use client';

import type { ClinicDocumentView } from '@hms/shared-types';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { ClinicDocumentApprovalBadge } from '#components/client/clinic-documents/clinic-document-approval-badge';
import { ClinicDocumentIngestBadge } from '#components/client/clinic-documents/clinic-document-ingest-badge';
import { ClinicDocumentRowActions } from '#components/client/clinic-documents/clinic-document-row-actions';
import { ClinicDocumentVisibilityBadge } from '#components/client/clinic-documents/clinic-document-visibility-badge';

type ClinicDocumentsTableProps = {
  documents: ClinicDocumentView[];
  onResult: (message: string) => void;
  onError: (message: string) => void;
};

function formatSize(sizeBytes: number): string {
  const kilobytes = sizeBytes / 1024;
  return kilobytes < 1024
    ? `${Math.max(1, Math.round(kilobytes))} KB`
    : `${(kilobytes / 1024).toFixed(1)} MB`;
}

export function ClinicDocumentsTable({
  documents,
  onResult,
  onError,
}: ClinicDocumentsTableProps) {
  const t = useTranslations('clinicCorpus.table');

  return (
    <Table>
      <TableHeader>
        <TableRow>
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
          <TableRow key={document.id}>
            <TableCell>
              <p className="font-medium text-slate-900">{document.title}</p>
              <p className="text-xs text-slate-500">{document.language}</p>
            </TableCell>
            <TableCell>
              <ClinicDocumentVisibilityBadge visibility={document.visibility} />
            </TableCell>
            <TableCell>
              <ClinicDocumentIngestBadge
                status={document.ingestStatus}
                ingestError={document.ingestError}
              />
            </TableCell>
            <TableCell>
              <ClinicDocumentApprovalBadge approval={document.approval} />
            </TableCell>
            {/* READY with zero chunks is a document that extracted to nothing.
                Without the count that reads identically to a working one, and
                on a shared corpus it is the difference between the bot having
                an answer and confidently having none. */}
            <TableCell>{document.chunkCount}</TableCell>
            <TableCell>{formatSize(document.sizeBytes)}</TableCell>
            <TableCell className="text-right">
              <ClinicDocumentRowActions
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
