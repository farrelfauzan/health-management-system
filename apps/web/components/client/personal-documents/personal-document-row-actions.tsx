'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PersonalDocumentView } from '@hms/shared-types';
import { Button } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { PersonalDocumentRenameDialog } from '#components/client/personal-documents/personal-document-rename-dialog';
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
      onResult(t('success.delete'));
    },
    onError: (err: unknown) => onError(resolveApiErrorMessage(err, t('errors.delete'))),
  });

  function confirmDelete(): void {
    // Deleting takes the chunks and their vectors with it, which is what makes
    // the document stop answering. That is not recoverable by re-uploading the
    // same file — the ingest has to run again — so it is worth one confirm.
    if (window.confirm(t('confirm.delete', { title: document.title }))) {
      deleteMutation.mutate();
    }
  }

  return (
    <div className="flex justify-end gap-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={downloadMutation.isPending}
        onClick={() => downloadMutation.mutate()}
      >
        {t('download')}
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setIsRenameOpen(true)}>
        {t('rename')}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={reingestMutation.isPending}
        onClick={() => reingestMutation.mutate()}
      >
        {t('reingest')}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={deleteMutation.isPending}
        onClick={confirmDelete}
      >
        {t('delete')}
      </Button>
      <PersonalDocumentRenameDialog
        open={isRenameOpen}
        onOpenChange={setIsRenameOpen}
        document={document}
        onSaved={onResult}
        onFailed={onError}
      />
    </div>
  );
}
