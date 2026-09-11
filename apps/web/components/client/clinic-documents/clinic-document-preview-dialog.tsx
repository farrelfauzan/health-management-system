'use client';

import type { ClinicDocumentView } from '@hms/shared-types';

import { DocumentPreviewDialog } from '#components/client/documents/document-preview-dialog';
import { useClinicDocumentFileUrl } from '#lib/clinic-documents/use-clinic-document-file-url';
import { useClinicDocumentPreview } from '#lib/clinic-documents/use-clinic-document-preview';
import { isPdfMimeType } from '#lib/documents/is-pdf-mime-type';

type ClinicDocumentPreviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: ClinicDocumentView;
  onDownload: () => void;
  isDownloadPending: boolean;
};

/**
 * A corpus row's preview, read only while open: a PDF through a fresh signed
 * link for the page viewer, anything else through the text preview endpoint.
 */
export function ClinicDocumentPreviewDialog({
  open,
  onOpenChange,
  document,
  onDownload,
  isDownloadPending,
}: ClinicDocumentPreviewDialogProps) {
  const isPdf = isPdfMimeType(document.mimeType);
  const previewQuery = useClinicDocumentPreview(document.id, open && !isPdf);
  const fileQuery = useClinicDocumentFileUrl(document.id, open && isPdf);
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
