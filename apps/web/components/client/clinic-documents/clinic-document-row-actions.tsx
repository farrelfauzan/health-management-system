'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ClinicDocumentView } from '@hms/shared-types';
import { useTranslations } from 'next-intl';

import { ClinicDocumentEditDialog } from '#components/client/clinic-documents/clinic-document-edit-dialog';
import { ClinicDocumentPreviewDialog } from '#components/client/clinic-documents/clinic-document-preview-dialog';
import { SubmitCorpusDocumentsDialog } from '#components/client/clinic-documents/submit-corpus-documents-dialog';
import { ConfirmDialog } from '#components/client/shared/confirm-dialog';
import { RowActionsMenu, type RowAction } from '#components/client/shared/row-actions-menu';
import {
  documentAdminControllerDeleteDocumentV1,
  documentAdminControllerGetDownloadUrlV1,
  documentAdminControllerReingestDocumentV1,
} from '#lib/api/generated/document-management/document-management';
import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';
import { parseApiSuccess } from '#lib/api/response';
import { canPreviewClinicDocument } from '#lib/clinic-documents/can-preview-clinic-document';
import { canSubmitClinicDocument } from '#lib/clinic-documents/can-submit-clinic-document';
import { invalidateClinicDocumentQueries } from '#lib/clinic-documents/invalidate-clinic-document-queries';

type ClinicDocumentRowActionsProps = {
  document: ClinicDocumentView;
  currentUserId: string | null;
  onResult: (message: string) => void;
  onError: (message: string) => void;
};

/**
 * A corpus row's actions, behind one "more" menu.
 *
 * Six icon buttons in a row — preview, download, edit, reprocess, send for
 * review, retire — crowded the table and were hard to tell apart without
 * hovering each one. The menu names every action in words, which is also
 * what a screen reader reads; the trigger is named after the document so
 * twenty rows are not twenty identical "Actions" buttons. Retire stays last
 * and marked destructive, and still asks before it acts.
 */
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
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

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

  const actions: RowAction[] = [
    // Offered for the file types the preview can show.
    ...(canPreviewClinicDocument(document)
      ? [{ label: t('preview'), icon: 'visibility', onSelect: () => setIsPreviewOpen(true) }]
      : []),
    {
      label: t('download'),
      icon: 'download',
      isDisabled: downloadMutation.isPending,
      onSelect: () => downloadMutation.mutate(),
    },
    { label: t('edit'), icon: 'edit', onSelect: () => setIsEditOpen(true) },
    {
      label: t('reingest'),
      icon: 'refresh',
      isDisabled: reingestMutation.isPending,
      onSelect: () => reingestMutation.mutate(),
    },
    // Offered while there is something to submit — no registry row, or a
    // draft — and absent on the three states the API can only refuse.
    ...(canSubmitClinicDocument(document.approval)
      ? [
          {
            label: approval('sendForReview'),
            icon: 'rate_review',
            onSelect: () => setIsSubmitOpen(true),
          },
        ]
      : []),
    {
      label: t('delete'),
      icon: 'delete',
      isDestructive: true,
      isDisabled: deleteMutation.isPending,
      onSelect: () => setIsDeleteOpen(true),
    },
  ];

  return (
    <div className="flex justify-end">
      <RowActionsMenu actions={actions} triggerLabel={t('menuFor', { title: document.title })} />
      <ClinicDocumentPreviewDialog
        open={isPreviewOpen}
        onOpenChange={setIsPreviewOpen}
        document={document}
        onDownload={() => downloadMutation.mutate()}
        isDownloadPending={downloadMutation.isPending}
      />
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
  );
}
