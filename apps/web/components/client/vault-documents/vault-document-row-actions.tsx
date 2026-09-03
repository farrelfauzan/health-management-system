'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { VaultDocumentView } from '@hms/shared-types';
import { useTranslations } from 'next-intl';

import { VaultDocumentEditDialog } from '#components/client/vault-documents/vault-document-edit-dialog';
import { DocumentSharingPanel } from '#components/client/vault-shares/document-sharing-panel';
import { RowActionsMenu, type RowAction } from '#components/client/shared/row-actions-menu';
import { vaultDocumentControllerDeleteDocumentV1 } from '#lib/api/generated/document-management/document-management';
import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';
import { parseApiSuccess } from '#lib/api/response';
import { downloadVaultDocument } from '#lib/vault-documents/download-vault-document';
import { invalidateVaultDocumentQueries } from '#lib/vault-documents/invalidate-vault-document-queries';

type VaultDocumentRowActionsProps = {
  document: VaultDocumentView;
  onResult: (message: string) => void;
  onError: (message: string) => void;
};

export function VaultDocumentRowActions({
  document,
  onResult,
  onError,
}: VaultDocumentRowActionsProps) {
  const t = useTranslations('vault.actions');
  const queryClient = useQueryClient();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isSharingOpen, setIsSharingOpen] = useState(false);

  const downloadMutation = useMutation({
    mutationFn: async () => {
      const url = await downloadVaultDocument(document.id);
      window.open(url, '_blank', 'noopener,noreferrer');
    },
    onError: (err: unknown) => onError(resolveApiErrorMessage(err, t('errors.download'))),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      parseApiSuccess(
        await vaultDocumentControllerDeleteDocumentV1(document.id),
        t('errors.delete'),
      );
    },
    onSuccess: async () => {
      await invalidateVaultDocumentQueries(queryClient);
      onResult(t('success.delete'));
    },
    onError: (err: unknown) => onError(resolveApiErrorMessage(err, t('errors.delete'))),
  });

  function confirmDelete(): void {
    // Worth a confirm for a reason the knowledge base's delete is not: this
    // one is a **hard** delete. The row, the stored file and every reminder
    // about it go, and there is no soft-deleted copy an administrator could
    // restore — which is the promise the vault makes, and the reason the
    // person clicking should have meant it.
    if (window.confirm(t('confirm.delete', { title: document.title }))) {
      deleteMutation.mutate();
    }
  }

  const actions: RowAction[] = [
    {
      label: t('download'),
      icon: 'download',
      onSelect: () => downloadMutation.mutate(),
    },
    { label: t('edit'), icon: 'edit', onSelect: () => setIsEditOpen(true) },
    // P16-T35. Opens the panel rather than the share dialog directly: the
    // first question an owner has about a document is usually "who already
    // has this", not "give it to someone else".
    { label: t('sharing'), icon: 'group', onSelect: () => setIsSharingOpen(true) },
    { label: t('delete'), icon: 'delete', onSelect: confirmDelete },
  ];

  return (
    <>
      <RowActionsMenu actions={actions} triggerLabel={t('menuFor', { title: document.title })} />
      <VaultDocumentEditDialog
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        document={document}
        onSaved={onResult}
      />
      <DocumentSharingPanel
        open={isSharingOpen}
        onOpenChange={setIsSharingOpen}
        document={document}
        onResult={onResult}
        onError={onError}
      />
    </>
  );
}
