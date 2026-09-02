'use client';

import type { PatientDocumentView } from '@hms/shared-types';
import { Badge, TableCell, TableRow } from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import { DocumentRowActions } from '#components/client/patient-documents/document-row-actions';
import { formatDocumentSize } from '#lib/patient-documents/format-document-size';

type DocumentsTableRowProps = {
  patientId: string;
  document: PatientDocumentView;
  onResult: (message: string) => void;
  onError: (message: string) => void;
};

const SHORT_ID_LENGTH = 8;

/**
 * One document. The visit column says which episode the file arose from, or
 * "General" when none — the distinction the encounter workspace's "this
 * visit" panel is built on, so it has to be visible here too. The released
 * badge is the one fact a patient-facing consequence hangs on: a released
 * file is in the portal, and a clinician scanning the list must be able to
 * tell at a glance.
 */
export function DocumentsTableRow({
  patientId,
  document,
  onResult,
  onError,
}: DocumentsTableRowProps) {
  const t = useTranslations('clinical.patients.documents');
  const format = useFormatter();

  function formatDocumentDate(value: string | null): string {
    if (value === null) {
      return t('noDate');
    }
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? value : format.dateTime(date, { dateStyle: 'medium' });
  }

  function renderVisit(): string {
    if (document.encounterId) {
      return t('visit.encounterLinked');
    }
    if (document.admissionId) {
      return t('visit.admissionLinked');
    }
    return t('general');
  }

  const linkedId = document.encounterId ?? document.admissionId;

  return (
    <TableRow>
      <TableCell>
        <p className="font-medium text-slate-900">{document.title}</p>
        {document.notes ? (
          <p className="max-w-xs truncate text-xs text-slate-500" title={document.notes}>
            {document.notes}
          </p>
        ) : null}
      </TableCell>
      <TableCell>{t(`categories.${document.category}`)}</TableCell>
      <TableCell>{formatDocumentDate(document.documentDate)}</TableCell>
      <TableCell>{formatDocumentSize(document.sizeBytes)}</TableCell>
      <TableCell>
        <p>{renderVisit()}</p>
        {linkedId ? (
          <p className="font-mono text-xs text-slate-500" title={linkedId}>
            {linkedId.slice(0, SHORT_ID_LENGTH)}…
          </p>
        ) : null}
      </TableCell>
      <TableCell>
        {document.releasedToPatient ? (
          <Badge>{t('released')}</Badge>
        ) : (
          <Badge variant="outline">{t('notReleased')}</Badge>
        )}
      </TableCell>
      <TableCell>
        <span className="font-mono text-xs text-slate-500" title={document.uploadedById}>
          {document.uploadedById.slice(0, SHORT_ID_LENGTH)}…
        </span>
      </TableCell>
      <TableCell className="text-right">
        <DocumentRowActions
          patientId={patientId}
          document={document}
          onResult={onResult}
          onError={onError}
        />
      </TableCell>
    </TableRow>
  );
}
