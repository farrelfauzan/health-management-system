'use client';

import type { DocumentPreviewView } from '@hms/shared-types';
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

const MARKDOWN_MIME_TYPE = 'text/markdown';

type DocumentPreviewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  mimeType: string;
  preview: DocumentPreviewView | undefined;
  isPending: boolean;
  isError: boolean;
  onDownload: () => void;
  isDownloadPending: boolean;
};

/**
 * Reads a stored document in place: Markdown rendered, plain text as stored.
 *
 * Shared by the clinic corpus and the personal knowledge base. They fetch
 * from different endpoints, so each wraps this with its own query, but a
 * document has to read the same way on both screens — this component owns
 * the reading. The text comes from the API already stripped of markup, and
 * `MarkdownContent` renders it with raw HTML and images off.
 *
 * Loading, failure and an empty document are three different messages,
 * because a reader needs to tell "still loading" and "could not load" apart
 * from "this file is blank".
 */
export function DocumentPreviewDialog({
  open,
  onOpenChange,
  title,
  mimeType,
  preview,
  isPending,
  isError,
  onDownload,
  isDownloadPending,
}: DocumentPreviewDialogProps) {
  const t = useTranslations('shared.documentPreview');
  const format = useFormatter();
  const isMarkdown = mimeType === MARKDOWN_MIME_TYPE;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="break-words">{title}</DialogTitle>
          <DialogDescription>
            {isMarkdown ? t('markdownDescription') : t('plainTextDescription')}
          </DialogDescription>
        </DialogHeader>
        <div
          className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-slate-200 bg-white p-5"
          data-testid="document-preview-body"
        >
          {isPending ? (
            <p className="text-sm text-slate-500">{t('loading')}</p>
          ) : isError || preview === undefined ? (
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
