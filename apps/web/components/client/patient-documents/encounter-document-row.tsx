'use client';

import { useMutation } from '@tanstack/react-query';
import type { PatientDocumentView } from '@hms/shared-types';
import { Button, Icon } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { openPatientDocument } from '#lib/patient-documents/open-patient-document';

type EncounterDocumentRowProps = {
  document: PatientDocumentView;
  /** The encounter this row is being read from — recorded in the audit row. */
  encounterId: string;
  onError: (message: string) => void;
};

/**
 * One document in the encounter panel: title, category, document date,
 * uploader, and a download.
 *
 * Deliberately a different row from the patient tab's `DocumentsTableRow`.
 * That one carries edit, delete and release; this one carries a download and
 * nothing else, because the encounter workspace is where a clinician *reads*
 * the file mid-consultation. Sharing a row and hiding three of its four
 * actions would put the release control one prop away from a surface P16-T15
 * puts it on deliberately.
 */
export function EncounterDocumentRow({
  document,
  encounterId,
  onError,
}: EncounterDocumentRowProps) {
  const t = useTranslations('clinical.patients.documents');

  const downloadMutation = useMutation({
    mutationFn: () =>
      openPatientDocument({
        documentId: document.id,
        readFromEncounterId: encounterId,
        errorMessage: t('actions.downloadError'),
      }),
    onError: () => onError(t('actions.downloadError')),
  });

  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-900">{document.title}</p>
        <p className="truncate text-xs text-slate-500">
          {t(`categories.${document.category}`)}
          {' · '}
          {document.documentDate ?? t('noDate')}
          {document.uploadedByEmail ? ` · ${document.uploadedByEmail}` : ''}
        </p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={t('actions.download')}
        title={t('actions.download')}
        disabled={downloadMutation.isPending}
        onClick={() => downloadMutation.mutate()}
      >
        <Icon name="download" size={18} />
      </Button>
    </li>
  );
}
