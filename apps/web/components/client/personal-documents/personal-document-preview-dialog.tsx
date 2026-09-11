'use client';

import type { PersonalDocumentView } from '@hms/shared-types';

import { DocumentPreviewDialog } from '#components/client/documents/document-preview-dialog';
import { isPdfMimeType } from '#lib/documents/is-pdf-mime-type';
import { usePersonalDocumentFileUrl } from '#lib/personal-documents/use-personal-document-file-url';
import { usePersonalDocumentPreview } from '#lib/personal-documents/use-personal-document-preview';

type PersonalDocumentPreviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: PersonalDocumentView;
  onDownload: () => void;
  isDownloadPending: boolean;
};

/**
 * A "My documents" row's preview, read only while open and only through the
 * caller's own endpoints, which answer for nothing outside their knowledge
 * base: a PDF through a fresh signed link, anything else as text.
 */
export function PersonalDocumentPreviewDialog({
  open,
  onOpenChange,
  document,
  onDownload,
  isDownloadPending,
}: PersonalDocumentPreviewDialogProps) {
  const isPdf = isPdfMimeType(document.mimeType);
  const previewQuery = usePersonalDocumentPreview(document.id, open && !isPdf);
  const fileQuery = usePersonalDocumentFileUrl(document.id, open && isPdf);
  const activeQuery = isPdf ? fileQuery : previewQuery;

  return (
    <DocumentPreviewDialog
      open={open}
      onOpenChange={onOpenChange}
      title={document.title}
      mimeType={document.mimeType}
      preview={previewQuery.preview}
      fileUrl={fileQuery.fileUrl}
      isPending={activeQuery.isPending}
      isError={activeQuery.isError}
      onDownload={onDownload}
      isDownloadPending={isDownloadPending}
    />
  );
}
