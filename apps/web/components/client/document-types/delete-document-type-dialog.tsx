'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { DocumentTypeView } from '@hms/shared-types';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Icon,
  toast,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { InlineNotice } from '#components/client/shared/inline-notice';
import { documentTypeControllerDeleteTypeV1 } from '#lib/api/generated/document-types/document-types';
import { parseApiSuccess } from '#lib/api/response';
import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';
import { invalidateDocumentTypeQueries } from '#lib/document-types/invalidate-document-type-queries';
import { resolveDocumentTypeInUse } from '#lib/document-types/resolve-document-type-in-use';

type DeleteDocumentTypeDialogProps = {
  open: boolean;
  type: DocumentTypeView;
  onOpenChange: (open: boolean) => void;
  onDeactivateInstead: (type: DocumentTypeView) => void;
};

/**
 * Delete, with the two refusals the API makes surfaced as what to do
 * instead (FR-E5-36): a system type is never deletable and says so before
 * the click; a type in use comes back as 409 with the count, and the dialog
 * turns that into a "deactivate instead" button rather than an error.
 */
export function DeleteDocumentTypeDialog({
  open,
  type,
  onOpenChange,
  onDeactivateInstead,
}: DeleteDocumentTypeDialogProps) {
  const t = useTranslations('operations.documents.types');
  const common = useTranslations('operations.common');
  const queryClient = useQueryClient();
  const [inUseCount, setInUseCount] = useState<number | null>(
    type.documentCount > 0 ? type.documentCount : null,
  );
  const [error, setError] = useState<string | null>(null);
  const deleteMutation = useMutation({
    mutationFn: async () =>
      parseApiSuccess(await documentTypeControllerDeleteTypeV1(type.id), t('delete.error')),
    onSuccess: async () => {
      await invalidateDocumentTypeQueries(queryClient);
      toast.success(t('delete.deleted'));
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      const count = resolveDocumentTypeInUse(err);
      if (count !== null) {
        setInUseCount(count);
        return;
      }
      setError(resolveApiErrorMessage(err, t('delete.error')));
    },
  });
  const isBlocked = type.isSystem || inUseCount !== null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('delete.title', { name: type.name })}</DialogTitle>
          <DialogDescription>{t('delete.description')}</DialogDescription>
        </DialogHeader>
        {type.isSystem ? <InlineNotice tone="warning">{t('form.systemNote')}</InlineNotice> : null}
        {!type.isSystem && inUseCount !== null ? (
          <InlineNotice tone="warning">{t('delete.inUse', { count: inUseCount })}</InlineNotice>
        ) : null}
        {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {common('cancel')}
          </Button>
          {isBlocked && type.isActive ? (
            <Button type="button" onClick={() => onDeactivateInstead(type)}>
              <Icon name="visibility_off" size={18} />
              {t('delete.deactivateInstead')}
            </Button>
          ) : null}
          {!isBlocked ? (
            <Button
              type="button"
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => {
                setError(null);
                deleteMutation.mutate();
              }}
            >
              <Icon name="delete" size={18} />
              {deleteMutation.isPending ? t('delete.deleting') : t('delete.confirm')}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
