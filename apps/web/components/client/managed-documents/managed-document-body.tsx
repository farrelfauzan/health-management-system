'use client';

import type { ManagedDocumentDetailView } from '@hms/shared-types';
import { Card, CardContent } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { ManagedDocumentDownloadButton } from '#components/client/managed-documents/managed-document-download-button';
import { ManagedDocumentPreview } from '#components/client/managed-documents/managed-document-preview';
import { canPreviewManagedDocument } from '#lib/managed-documents/can-preview-managed-document';

type ManagedDocumentBodyProps = {
  document: ManagedDocumentDetailView;
};

/**
 * What the document actually says.
 *
 * A drafted body is rendered from HTML the **API** sanitised on every write
 * (NFR-SEC-01) — the allowlist lives server-side, so the client is not the
 * thing standing between a pasted `<script>` and the reader. An uploaded body
 * is never framed in this origin (NFR-SEC-04): it is a signed,
 * attachment-disposition download, and since `P19-T18` a markdown or
 * plain-text one is additionally readable as *text*, extracted and stripped
 * of markup on the API. Neither path puts uploaded bytes into the DOM as
 * markup.
 *
 * The preview is rendered here only for a type that needs no approval. When
 * approval is in play the panel above already carries it, next to the decide
 * controls where the reading matters — and one document read twice on one
 * screen reads as two documents.
 */
export function ManagedDocumentBody({ document }: ManagedDocumentBodyProps) {
  const t = useTranslations('operations.documents.workspace');

  if (document.storageKey !== null) {
    if (!document.isApprovalRequired && canPreviewManagedDocument(document)) {
      return (
        <Card className="rounded-xl border-slate-200 shadow-none">
          <CardContent className="p-4">
            <ManagedDocumentPreview document={document} />
          </CardContent>
        </Card>
      );
    }
    return (
      <Card className="rounded-xl border-slate-200 shadow-none">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-sm text-slate-600">{t('uploadedBody')}</p>
          <ManagedDocumentDownloadButton documentId={document.id} />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-xl border-slate-200 shadow-none">
      <CardContent className="p-6">
        {document.contentHtml === null || document.contentHtml.trim() === '' ? (
          <p className="text-sm text-slate-500">{t('emptyBody')}</p>
        ) : (
          <div
            className="prose prose-sm max-w-none text-slate-900"
            // Sanitised server-side on every write with the same allowlist the
            // template editor uses; the API is the boundary, not this line.
            dangerouslySetInnerHTML={{ __html: document.contentHtml }}
          />
        )}
      </CardContent>
    </Card>
  );
}
