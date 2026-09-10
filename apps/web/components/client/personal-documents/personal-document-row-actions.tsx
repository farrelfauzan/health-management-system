'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PersonalDocumentView } from '@hms/shared-types';
import { TooltipProvider } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { DocumentActionButton } from '#components/client/documents/document-action-button';
import { PersonalDocumentRenameDialog } from '#components/client/personal-documents/personal-document-rename-dialog';
import { ConfirmDialog } from '#components/client/shared/confirm-dialog';
import {
  personalDocumentControllerDeleteDocumentV1,
  personalDocumentControllerGetDownloadUrlV1,
  personalDocumentControllerReingestDocumentV1,
} from '#lib/api/generated/document-management/document-management';
import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';
import { parseApiSuccess } from '#lib/api/response';
import { invalidatePersonalDocumentQueries } from '#lib/personal-documents/invalidate-personal-document-queries';

type PersonalDocumentRowActionsProps = {
  document: PersonalDocumentView;
  onResult: (message: string) => void;
  onError: (message: string) => void;
};

export function PersonalDocumentRowActions({
  document,
  onResult,
  onError,
}: PersonalDocumentRowActionsProps) {
  const t = useTranslations('personalKnowledgeBase.actions');
  const queryClient = useQueryClient();
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  /**
   * Downloads are minted per request and never persisted. The URL is opened
   * rather than stored, so it expires on its own instead of sitting in a
   * cached list — which is the whole point of the bucket being private.
   */
  const downloadMutation = useMutation({
    mutationFn: async () => {
      const response = parseApiSuccess<{ url: string }>(
        await personalDocumentControllerGetDownloadUrlV1(document.id),
        t('errors.download'),
      );
      window.open(response.data.url, '_blank', 'noopener,noreferrer');
    },
    onError: (err: unknown) => onError(resolveApiErrorMessage(err, t('errors.download'))),
  });

  const reingestMutation = useMutation({
    mutationFn: async () => {
      parseApiSuccess(
        await personalDocumentControllerReingestDocumentV1(document.id),
        t('errors.reingest'),
      );
    },
    onSuccess: async () => {
      await invalidatePersonalDocumentQueries(queryClient);
      onResult(t('success.reingest'));
    },
    onError: (err: unknown) => onError(resolveApiErrorMessage(err, t('errors.reingest'))),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      parseApiSuccess(
        await personalDocumentControllerDeleteDocumentV1(document.id),
        t('errors.delete'),
      );
    },
    onSuccess: async () => {
      await invalidatePersonalDocumentQueries(queryClient);
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
    // provider, and four of them in a row would each carry their own delay
    // timer for controls the user reads as a single group.
    <TooltipProvider>
      <div className="flex justify-end gap-1">
        <DocumentActionButton
          icon="download"
          label={t('download')}
          disabled={downloadMutation.isPending}
          onClick={() => downloadMutation.mutate()}
        />
        <DocumentActionButton
          icon="edit"
          label={t('rename')}
          onClick={() => setIsRenameOpen(true)}
        />
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
        <PersonalDocumentRenameDialog
          open={isRenameOpen}
          onOpenChange={setIsRenameOpen}
          document={document}
          onSaved={onResult}
          onFailed={onError}
        />
        {/* Deleting takes the chunks and their vectors with it, which is what
            makes the document stop answering. That is not recoverable by
            re-uploading the same file — the ingest has to run again — and the
            dialog says so, because it is the part an owner cannot guess. */}
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
