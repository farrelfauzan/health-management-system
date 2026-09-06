'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { DocumentTemplateView } from '@hms/shared-types';
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
import { useTranslations } from 'next-intl';

import { documentTemplateControllerArchiveTemplateV1 } from '#lib/api/generated/document-templates/document-templates';
import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';
import { parseApiSuccess } from '#lib/api/response';
import { invalidateDocumentTemplateQueries } from '#lib/document-templates/invalidate-document-template-queries';

type ArchiveTemplateDialogProps = {
  template: DocumentTemplateView | null;
  onOpenChange: (open: boolean) => void;
  onArchived: (message: string) => void;
  onFailed: (message: string) => void;
};

/**
 * Archiving a template is the "delete" of this surface: the row leaves the
 * list, but every published version stays attached to the invoices that
 * rendered from it — a receipt issued last month must still re-render
 * exactly as it did. The default template cannot be archived; the API
 * refuses it, and the dialog says why rather than greying a menu item out.
 */
export function ArchiveTemplateDialog({
  template,
  onOpenChange,
  onArchived,
  onFailed,
}: ArchiveTemplateDialogProps) {
  const t = useTranslations('operations.billing.templates.archiveDialog');
  const queryClient = useQueryClient();
  const isDefault = template?.isDefault === true;
  const archiveMutation = useMutation({
    mutationFn: async (target: DocumentTemplateView) =>
      parseApiSuccess(await documentTemplateControllerArchiveTemplateV1(target.id), t('error')),
    onSuccess: async () => {
      await invalidateDocumentTemplateQueries(queryClient);
      onOpenChange(false);
      onArchived(t('success'));
    },
    onError: (err: unknown) => onFailed(resolveApiErrorMessage(err, t('error'))),
  });

  return (
    <Dialog open={template !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title', { name: template?.name ?? '' })}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        {isDefault ? (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900"
          >
            <Icon name="info" size={16} />
            <span>{t('defaultBlocked')}</span>
          </p>
        ) : (
          <p className="text-sm text-slate-600">{t('versionsNote')}</p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={isDefault || archiveMutation.isPending || template === null}
            onClick={() => template && archiveMutation.mutate(template)}
          >
            <Icon name="archive" size={18} />
            {archiveMutation.isPending ? t('archiving') : t('confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
