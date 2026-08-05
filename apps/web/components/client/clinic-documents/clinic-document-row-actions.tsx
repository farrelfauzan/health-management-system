'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ClinicDocumentView } from '@hms/shared-types';
import { Button } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { ClinicDocumentEditDialog } from '#components/client/clinic-documents/clinic-document-edit-dialog';
import {
  documentAdminControllerDeleteDocumentV1,
  documentAdminControllerGetDownloadUrlV1,
  documentAdminControllerReingestDocumentV1,
} from '#lib/api/generated/document-management/document-management';
import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';
import { parseApiSuccess } from '#lib/api/response';
import { invalidateClinicDocumentQueries } from '#lib/clinic-documents/invalidate-clinic-document-queries';

type ClinicDocumentRowActionsProps = {
  document: ClinicDocumentView;
  onResult: (message: string) => void;
  onError: (message: string) => void;
};

export function ClinicDocumentRowActions({
  document,
  onResult,
  onError,
}: ClinicDocumentRowActionsProps) {
  const t = useTranslations('clinicCorpus.actions');
  const queryClient = useQueryClient();
  const [isEditOpen, setIsEditOpen] = useState(false);

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
      onResult(t('success.delete'));
    },
    onError: (err: unknown) => onError(resolveApiErrorMessage(err, t('errors.delete'))),
  });

  function confirmDelete(): void {
    // Retiring takes the chunks and their vectors with it, which is what makes
    // the document stop answering — on the in-app assistant and on the public
    // channel alike. Re-uploading the same file does not undo it; the ingest
    // has to run again. That is worth one confirm.
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
      <Button type="button" variant="ghost" size="sm" onClick={() => setIsEditOpen(true)}>
        {t('edit')}
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
      <ClinicDocumentEditDialog
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        document={document}
        onSaved={onResult}
        onFailed={onError}
      />
    </div>
  );
}
