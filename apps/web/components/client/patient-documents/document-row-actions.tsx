'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { PatientDocumentDownloadView, PatientDocumentView } from '@hms/shared-types';
import { Button, useAbility } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { DeleteDocumentDialog } from '#components/client/patient-documents/delete-document-dialog';
import { EditDocumentDialog } from '#components/client/patient-documents/edit-document-dialog';
import { patientDocumentDetailControllerGetDownloadUrlV1 } from '#lib/api/generated/document-management/document-management';
import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';
import { parseApiSuccess } from '#lib/api/response';

type DocumentRowActionsProps = {
  patientId: string;
  document: PatientDocumentView;
  onResult: (message: string) => void;
  onError: (message: string) => void;
};

/**
 * Download, edit, delete — each gated on the matching frontend grant, which
 * hides the control and nothing more; the API guard is what refuses.
 *
 * Download mints a fresh signed URL on every click and opens it, never
 * storing it: the URL expires in minutes and is audited per mint, so a
 * cached one would be both dead and a lie in the audit log. The dialogs are
 * mounted only while open, so each opens on the document's current values
 * and the visit list is fetched once per opening rather than once per row.
 */
export function DocumentRowActions({
  patientId,
  document,
  onResult,
  onError,
}: DocumentRowActionsProps) {
  const t = useTranslations('clinical.patients.documents.actions');
  const ability = useAbility();
  const canWrite = ability.can('write', 'PatientDocument');
  const canDelete = ability.can('delete', 'PatientDocument');
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  const downloadMutation = useMutation({
    mutationFn: async () => {
      const response = parseApiSuccess<PatientDocumentDownloadView>(
        await patientDocumentDetailControllerGetDownloadUrlV1(document.id),
        t('downloadError'),
      );
      window.open(response.data.url, '_blank', 'noopener,noreferrer');
    },
    onError: (err: unknown) => onError(resolveApiErrorMessage(err, t('downloadError'))),
  });

  return (
    <div className="flex justify-end gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={downloadMutation.isPending}
        onClick={() => downloadMutation.mutate()}
      >
        {t('download')}
      </Button>
      {canWrite ? (
        <Button type="button" variant="ghost" size="sm" onClick={() => setIsEditOpen(true)}>
          {t('edit')}
        </Button>
      ) : null}
      {canDelete ? (
        <Button type="button" variant="ghost" size="sm" onClick={() => setIsDeleteOpen(true)}>
          {t('delete')}
        </Button>
      ) : null}
      {isEditOpen ? (
        <EditDocumentDialog
          open={isEditOpen}
          onOpenChange={setIsEditOpen}
          patientId={patientId}
          document={document}
          onSaved={onResult}
          onFailed={onError}
        />
      ) : null}
      {isDeleteOpen ? (
        <DeleteDocumentDialog
          open={isDeleteOpen}
          onOpenChange={setIsDeleteOpen}
          patientId={patientId}
          document={document}
          onDeleted={onResult}
          onFailed={onError}
        />
      ) : null}
    </div>
  );
}
