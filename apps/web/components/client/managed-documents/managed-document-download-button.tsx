'use client';

import { useMutation } from '@tanstack/react-query';
import { Button, Icon, toast } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';
import { openManagedDocument } from '#lib/managed-documents/open-managed-document';

type ManagedDocumentDownloadButtonProps = {
  documentId: string;
  variant?: 'outline' | 'ghost';
};

/**
 * The signed, attachment-disposition download of an uploaded body
 * (NFR-SEC-04).
 *
 * Its own file since `P19-T18`, because two places now offer it: the body
 * panel, where it has always been the only way to read an uploaded document,
 * and the in-app preview, where it is what a reader reaches for when the text
 * is capped. The URL is minted per click and never cached.
 */
export function ManagedDocumentDownloadButton({
  documentId,
  variant = 'outline',
}: ManagedDocumentDownloadButtonProps) {
  const t = useTranslations('operations.documents.registry.actions');
  const downloadMutation = useMutation({
    mutationFn: () => openManagedDocument({ documentId, errorMessage: t('downloadError') }),
    onError: (err: unknown) => toast.error(resolveApiErrorMessage(err, t('downloadError'))),
  });

  return (
    <Button
      type="button"
      variant={variant}
      disabled={downloadMutation.isPending}
      onClick={() => downloadMutation.mutate()}
    >
      <Icon name="download" size={18} />
      {t('download')}
    </Button>
  );
}
