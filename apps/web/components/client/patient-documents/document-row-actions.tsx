'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { PatientDocumentView } from '@hms/shared-types';
import { Button, Icon, useAbility } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { DeleteDocumentDialog } from '#components/client/patient-documents/delete-document-dialog';
import { EditDocumentDialog } from '#components/client/patient-documents/edit-document-dialog';
import { PatientDocumentDeliveriesDialog } from '#components/client/patient-documents/patient-document-deliveries-dialog';
import { ReleaseDocumentButton } from '#components/client/patient-documents/release-document-button';
import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';
import { openPatientDocument } from '#lib/patient-documents/open-patient-document';

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
  const [isDeliveriesOpen, setIsDeliveriesOpen] = useState(false);

  const downloadMutation = useMutation({
    // No reading context: the patient tab is not an encounter, so the audit
    // row records the read with no `readFromEncounterId` rather than one
    // invented to fill the field (P16-T14).
    mutationFn: () =>
      openPatientDocument({ documentId: document.id, errorMessage: t('downloadError') }),
    onError: (err: unknown) => onError(resolveApiErrorMessage(err, t('downloadError'))),
  });

  return (
    <div className="flex justify-end gap-1">
      <ReleaseDocumentButton
        patientId={patientId}
        document={document}
        onResult={onResult}
        onError={onError}
      />
      {/* P16-T40: what left the building, and whether it arrived. Only a
          released file can have been sent, so the control appears with the
          release badge. */}
      {document.releasedToPatient ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t('deliveries')}
          title={t('deliveries')}
          onClick={() => setIsDeliveriesOpen(true)}
        >
          <Icon name="send" size={18} className="text-slate-600" />
        </Button>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={t('download')}
        title={t('download')}
        disabled={downloadMutation.isPending}
        onClick={() => downloadMutation.mutate()}
      >
        <Icon name="download" size={18} className="text-slate-600" />
      </Button>
      {canWrite ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t('edit')}
          title={t('edit')}
          onClick={() => setIsEditOpen(true)}
        >
          <Icon name="edit" size={18} className="text-slate-600" />
        </Button>
      ) : null}
      {canDelete ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t('delete')}
          title={t('delete')}
          onClick={() => setIsDeleteOpen(true)}
        >
          <Icon name="delete" size={18} className="text-danger" />
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
      {isDeliveriesOpen ? (
        <PatientDocumentDeliveriesDialog
          open={isDeliveriesOpen}
          onOpenChange={setIsDeliveriesOpen}
          document={document}
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
