'use client';

import type { ClinicDocumentView } from '@hms/shared-types';
import { Checkbox, TableCell, TableRow } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { ClinicDocumentApprovalBadge } from '#components/client/clinic-documents/clinic-document-approval-badge';
import { ClinicDocumentIngestBadge } from '#components/client/clinic-documents/clinic-document-ingest-badge';
import { ClinicDocumentRowActions } from '#components/client/clinic-documents/clinic-document-row-actions';
import { ClinicDocumentVisibilityBadge } from '#components/client/clinic-documents/clinic-document-visibility-badge';
import { formatDocumentSize } from '#lib/clinic-documents/format-document-size';

type ClinicDocumentsTableRowProps = {
  document: ClinicDocumentView;
  /** Absent for a document nothing can be submitted on, so no box is drawn. */
  isSelectable: boolean;
  isSelected: boolean;
  currentUserId: string | null;
  onSelectedChange: (isSelected: boolean) => void;
  onResult: (message: string) => void;
  onError: (message: string) => void;
};

/**
 * One corpus document (`P19` split this out of the table).
 *
 * The checkbox appears only on a row a submission could actually cover — no
 * registry row, or a draft. A box on an issued document would let an admin
 * build a selection that the batch then reports as failures, one line per
 * row, for an action they never meant to take.
 */
export function ClinicDocumentsTableRow({
  document,
  isSelectable,
  isSelected,
  currentUserId,
  onSelectedChange,
  onResult,
  onError,
}: ClinicDocumentsTableRowProps) {
  const t = useTranslations('clinicCorpus.table');

  return (
    <TableRow>
      <TableCell className="w-10">
        {isSelectable ? (
          <Checkbox
            checked={isSelected}
            aria-label={t('selectRow', { title: document.title })}
            onCheckedChange={(checked) => onSelectedChange(checked === true)}
          />
        ) : null}
      </TableCell>
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
          Without the count that reads identically to a working one, and on a
          shared corpus it is the difference between the bot having an answer
          and confidently having none. */}
      <TableCell>{document.chunkCount}</TableCell>
      <TableCell>{formatDocumentSize(document.sizeBytes)}</TableCell>
      <TableCell className="text-right">
        <ClinicDocumentRowActions
          document={document}
          currentUserId={currentUserId}
          onResult={onResult}
          onError={onError}
        />
      </TableCell>
    </TableRow>
  );
}
