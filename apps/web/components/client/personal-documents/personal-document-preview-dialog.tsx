'use client';

import type { PersonalDocumentView } from '@hms/shared-types';

import { DocumentPreviewDialog } from '#components/client/documents/document-preview-dialog';
import { usePersonalDocumentPreview } from '#lib/personal-documents/use-personal-document-preview';

type PersonalDocumentPreviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: PersonalDocumentView;
  onDownload: () => void;
  isDownloadPending: boolean;
};

/**
 * A "My documents" row's preview: read through the caller's own endpoint,
 * which only ever answers for documents in their knowledge base, and only
 * while the dialog is open.
 */
export function PersonalDocumentPreviewDialog({
  open,
  onOpenChange,
  document,
  onDownload,
  isDownloadPending,
}: PersonalDocumentPreviewDialogProps) {
  const previewQuery = usePersonalDocumentPreview(document.id, open);

  return (
    <DocumentPreviewDialog
      open={open}
      onOpenChange={onOpenChange}
      title={document.title}
      mimeType={document.mimeType}
      preview={previewQuery.preview}
      isPending={previewQuery.isPending}
      isError={previewQuery.isError}
      onDownload={onDownload}
      isDownloadPending={isDownloadPending}
    />
  );
}
