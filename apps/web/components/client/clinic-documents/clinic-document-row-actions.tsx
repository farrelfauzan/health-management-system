'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ClinicDocumentView } from '@hms/shared-types';
import { TooltipProvider } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { ClinicDocumentEditDialog } from '#components/client/clinic-documents/clinic-document-edit-dialog';
import { SubmitCorpusDocumentsDialog } from '#components/client/clinic-documents/submit-corpus-documents-dialog';
import { DocumentActionButton } from '#components/client/documents/document-action-button';
import { ConfirmDialog } from '#components/client/shared/confirm-dialog';
import {
  documentAdminControllerDeleteDocumentV1,
  documentAdminControllerGetDownloadUrlV1,
  documentAdminControllerReingestDocumentV1,
} from '#lib/api/generated/document-management/document-management';
import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';
import { parseApiSuccess } from '#lib/api/response';
import { canSubmitClinicDocument } from '#lib/clinic-documents/can-submit-clinic-document';
import { invalidateClinicDocumentQueries } from '#lib/clinic-documents/invalidate-clinic-document-queries';

type ClinicDocumentRowActionsProps = {
  document: ClinicDocumentView;
  currentUserId: string | null;
  onResult: (message: string) => void;
  onError: (message: string) => void;
};

export function ClinicDocumentRowActions({
  document,
  currentUserId,
  onResult,
  onError,
}: ClinicDocumentRowActionsProps) {
  const t = useTranslations('clinicCorpus.actions');
  const approval = useTranslations('clinicCorpus.approval');
  const queryClient = useQueryClient();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isSubmitOpen, setIsSubmitOpen] = useState(false);

  /**
   * Downloads are minted per request and never persisted. The URL is opened
   * rather than stored, so it expires on its own instead of sitting in a
   * cached list — which is the whole point of the bucket being private.
   */
  const downloadMutation = useMutation({
    mutationFn: async () => {
      const response = parseApiSuccess<{ url: string }>(
        await documentAdminControllerGetDownloadUrlV1(document.id),
        t('errors.download'),
      );
      window.open(response.data.url, '_blank', 'noopener,noreferrer');
    },
    onError: (err: unknown) => onError(resolveApiErrorMessage(err, t('errors.download'))),
  });

  const reingestMutation = useMutation({
    mutationFn: async () => {
      parseApiSuccess(
        await documentAdminControllerReingestDocumentV1(document.id),
        t('errors.reingest'),
      );
    },
    onSuccess: async () => {
      await invalidateClinicDocumentQueries(queryClient);
      onResult(t('success.reingest'));
    },
    onError: (err: unknown) => onError(resolveApiErrorMessage(err, t('errors.reingest'))),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      parseApiSuccess(
        await documentAdminControllerDeleteDocumentV1(document.id),
        t('errors.delete'),
      );
    },
    onSuccess: async () => {
      await invalidateClinicDocumentQueries(queryClient);
      setIsDeleteOpen(false);
      onResult(t('success.delete'));
    },
    onError: (err: unknown) => {
      setIsDeleteOpen(false);
      onError(resolveApiErrorMessage(err, t('errors.delete')));
    },
  });

  return (
    // One provider per row rather than one per button: Radix needs an ancestor
    // provider, and five of them in a row would each carry their own delay
    // timer for controls the user reads as a single group.
    <TooltipProvider>
      <div className="flex justify-end gap-1">
        <DocumentActionButton
          icon="download"
          label={t('download')}
          disabled={downloadMutation.isPending}
          onClick={() => downloadMutation.mutate()}
        />
        <DocumentActionButton icon="edit" label={t('edit')} onClick={() => setIsEditOpen(true)} />
        <DocumentActionButton
          icon="refresh"
          label={t('reingest')}
          disabled={reingestMutation.isPending}
          onClick={() => reingestMutation.mutate()}
        />
        <DocumentActionButton
          icon="delete"
          label={t('delete')}
          disabled={deleteMutation.isPending}
          onClick={() => setIsDeleteOpen(true)}
        />
        {/* Offered while there is something to submit — no registry row, or a
            draft — and hidden on the three states the API can only refuse. */}
        {canSubmitClinicDocument(document.approval) ? (
          <DocumentActionButton
            icon="rate_review"
            label={approval('sendForReview')}
            onClick={() => setIsSubmitOpen(true)}
          />
        ) : null}
        <SubmitCorpusDocumentsDialog
          open={isSubmitOpen}
          documentIds={[document.id]}
          currentUserId={currentUserId}
          onOpenChange={setIsSubmitOpen}
          onSubmitted={onResult}
          onFailed={onError}
        />
        <ClinicDocumentEditDialog
          open={isEditOpen}
          onOpenChange={setIsEditOpen}
          document={document}
          onSaved={onResult}
          onFailed={onError}
        />
        {/* Retiring takes the chunks and their vectors with it, which is what
            makes the document stop answering — on the in-app assistant and on
            the public channel alike. Re-uploading the same file does not undo
            it; the ingest has to run again, and the dialog says so. */}
        <ConfirmDialog
          open={isDeleteOpen}
          onOpenChange={setIsDeleteOpen}
          title={t('confirm.delete.title')}
          description={t('confirm.delete.body', { title: document.title })}
          confirmLabel={t('confirm.delete.confirm')}
          cancelLabel={t('confirm.delete.cancel')}
          isDestructive
          isPending={deleteMutation.isPending}
          onConfirm={() => deleteMutation.mutate()}
        />
      </div>
    </TooltipProvider>
  );
}
