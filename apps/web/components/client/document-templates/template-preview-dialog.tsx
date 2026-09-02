'use client';

import type { DocumentTemplatePreviewView } from '@hms/shared-types';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Icon,
} from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

type TemplatePreviewDialogProps = {
  open: boolean;
  preview: DocumentTemplatePreviewView | null;
  onOpenChange: (open: boolean) => void;
};

/**
 * Shows the fixture render in-editor (FR-E1-06). The PDF is embedded from
 * the storage origin on a short-lived inline URL — it was produced by the
 * renderer from sanitised HTML, never uploaded by a user, which is what
 * makes inline display acceptable here and nowhere else in the app.
 */
export function TemplatePreviewDialog({ open, preview, onOpenChange }: TemplatePreviewDialogProps) {
  const t = useTranslations('operations.billing.templates.preview');
  const format = useFormatter();

  function openInNewTab(): void {
    if (preview === null) {
      return;
    }
    window.open(preview.url, '_blank', 'noopener,noreferrer');
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[min(96vw,64rem)] flex-col sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        {preview === null ? null : (
          <>
            <iframe
              title={t('title')}
              src={preview.url}
              className="h-[65vh] w-full rounded-md border border-slate-200 bg-slate-50"
              data-testid="template-preview-frame"
            />
            {preview.warnings.length > 0 ? (
              <div className="rounded-lg bg-amber-50 px-4 py-2 text-xs text-amber-900">
                <p className="font-medium">{t('warningsTitle', { count: preview.warnings.length })}</p>
                <ul className="list-disc pl-4">
                  {preview.warnings.map((warning) => (
                    <li key={`${warning.token}-${warning.reason}`}>
                      <code className="font-mono">{warning.token}</code> — {warning.reason}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <DialogFooter className="items-center sm:justify-between">
              <p className="text-xs text-slate-500">
                {t('expiresAt', {
                  time: format.dateTime(new Date(preview.expiresAt), { timeStyle: 'short' }),
                })}
              </p>
              <Button type="button" variant="outline" size="sm" onClick={openInNewTab}>
                <Icon name="open_in_new" size={16} />
                {t('openInNewTab')}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
