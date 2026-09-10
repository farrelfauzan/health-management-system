'use client';

import type { ManagedDocumentDetailView } from '@hms/shared-types';
import { useFormatter, useTranslations } from 'next-intl';

import { ManagedDocumentDownloadButton } from '#components/client/managed-documents/managed-document-download-button';
import { InlineNotice } from '#components/client/shared/inline-notice';
import { canPreviewManagedDocument } from '#lib/managed-documents/can-preview-managed-document';
import { useManagedDocumentPreview } from '#lib/managed-documents/use-managed-document-preview';

type ManagedDocumentPreviewProps = {
  document: ManagedDocumentDetailView;
};

/**
 * The document, readable, on the screen where somebody is asked to approve it
 * (`P19-T18`, FR-E5-13).
 *
 * Before this, an uploaded body was a download and nothing else, which meant
 * a clinic corpus document could be approved by someone who had never opened
 * it. The text arrives from the API already extracted and stripped of markup,
 * and is rendered here as a **text node** — there is no
 * `dangerouslySetInnerHTML` on this path, so operator-uploaded bytes never
 * become markup in the app origin (NFR-SEC-04). Both facts hold on their own;
 * neither is relied on to cover the other.
 *
 * Four states are spelled out rather than collapsed, because the failure mode
 * this replaces is the dangerous one: an approver shown an empty box cannot
 * tell "still loading" or "could not load" from "this document is blank", and
 * only one of those is safe to approve against.
 *
 * Renders as a bare section so the caller owns the surface — inside the
 * approval panel's card, or wrapped in one of its own by the body panel.
 */
export function ManagedDocumentPreview({ document }: ManagedDocumentPreviewProps) {
  const t = useTranslations('operations.documents.preview');
  const format = useFormatter();
  const isPreviewable = canPreviewManagedDocument(document);
  const previewQuery = useManagedDocumentPreview(document.id, isPreviewable);
  const preview = previewQuery.preview;

  if (!isPreviewable) {
    return null;
  }

  return (
    <section className="space-y-3" data-testid="managed-document-preview">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-900">{t('title')}</p>
        <ManagedDocumentDownloadButton documentId={document.id} variant="ghost" />
      </div>
      {previewQuery.isPending ? (
        <p className="text-sm text-slate-500">{t('loading')}</p>
      ) : previewQuery.isError || preview === undefined ? (
        <InlineNotice tone="error">{t('loadError')}</InlineNotice>
      ) : preview.text.trim() === '' ? (
        <InlineNotice tone="warning">{t('empty')}</InlineNotice>
      ) : (
        <>
          <div className="max-h-[32rem] overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-slate-800">
              {preview.text}
            </p>
          </div>
          {preview.isTruncated ? (
            <InlineNotice tone="warning">
              {t('truncated', {
                shown: format.number(preview.characterCount),
                total: format.number(preview.totalCharacterCount),
              })}
            </InlineNotice>
          ) : null}
        </>
      )}
    </section>
  );
}
