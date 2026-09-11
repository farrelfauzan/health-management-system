'use client';

import type { ClinicDocumentView } from '@hms/shared-types';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import { InlineNotice } from '#components/client/shared/inline-notice';
import { MarkdownContent } from '#components/client/shared/markdown-content';
import { useClinicDocumentPreview } from '#lib/clinic-documents/use-clinic-document-preview';

const MARKDOWN_MIME_TYPE = 'text/markdown';

type ClinicDocumentPreviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: ClinicDocumentView;
  onDownload: () => void;
  isDownloadPending: boolean;
};

/**
 * Reads a corpus document in place: Markdown rendered, plain text as stored.
 *
 * The text is fetched when the dialog opens and comes from the API already
 * stripped of markup; `MarkdownContent` then renders it with raw HTML and
 * images off. Loading, failure and an empty document are three different
 * messages, because an admin checking what the assistant will quote needs to
 * tell "still loading" and "could not load" apart from "this file is blank".
 */
export function ClinicDocumentPreviewDialog({
  open,
  onOpenChange,
  document,
  onDownload,
  isDownloadPending,
}: ClinicDocumentPreviewDialogProps) {
  const t = useTranslations('clinicCorpus.preview');
  const format = useFormatter();
  const previewQuery = useClinicDocumentPreview(document.id, open);
  const preview = previewQuery.preview;
  const isMarkdown = document.mimeType === MARKDOWN_MIME_TYPE;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="break-words">{document.title}</DialogTitle>
          <DialogDescription>
            {isMarkdown ? t('markdownDescription') : t('plainTextDescription')}
          </DialogDescription>
        </DialogHeader>
        <div
          className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-slate-200 bg-white p-5"
          data-testid="clinic-document-preview-body"
        >
          {previewQuery.isPending ? (
            <p className="text-sm text-slate-500">{t('loading')}</p>
          ) : previewQuery.isError || preview === undefined ? (
            <InlineNotice tone="error">{t('loadError')}</InlineNotice>
          ) : preview.text.trim() === '' ? (
            <InlineNotice tone="warning">{t('empty')}</InlineNotice>
          ) : isMarkdown ? (
            <MarkdownContent markdown={preview.text} />
          ) : (
            <p className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-slate-800">
              {preview.text}
            </p>
          )}
        </div>
        {preview?.isTruncated ? (
          <InlineNotice tone="warning">
            {t('truncated', {
              shown: format.number(preview.characterCount),
              total: format.number(preview.totalCharacterCount),
            })}
          </InlineNotice>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={isDownloadPending} onClick={onDownload}>
            {t('download')}
          </Button>
          <Button type="button" onClick={() => onOpenChange(false)}>
            {t('close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
