'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { DocumentTypeApproverView, DocumentTypeView } from '@hms/shared-types';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  toast,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { DefaultApproverPicker } from '#components/client/document-types/default-approver-picker';
import { documentTypeControllerSetDefaultApproversV1 } from '#lib/api/generated/document-types/document-types';
import { parseApiSuccess } from '#lib/api/response';
import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';
import { invalidateDocumentTypeQueries } from '#lib/document-types/invalidate-document-type-queries';

type DocumentTypeApproversDialogProps = {
  open: boolean;
  type: DocumentTypeView;
  onOpenChange: (open: boolean) => void;
};

/** The default approver set for one type, replaced whole on save (FR-E5-38). */
export function DocumentTypeApproversDialog({
  open,
  type,
  onOpenChange,
}: DocumentTypeApproversDialogProps) {
  const t = useTranslations('operations.documents.types.approvers');
  const common = useTranslations('operations.common');
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<DocumentTypeApproverView[]>(type.defaultApprovers);
  const [error, setError] = useState<string | null>(null);
  const saveMutation = useMutation({
    mutationFn: async (approverIds: string[]) =>
      parseApiSuccess<DocumentTypeView>(
        await documentTypeControllerSetDefaultApproversV1(type.id, { approverIds }),
        t('error'),
      ),
    onSuccess: async () => {
      await invalidateDocumentTypeQueries(queryClient);
      toast.success(t('saved'));
      onOpenChange(false);
    },
    onError: (err: unknown) => setError(resolveApiErrorMessage(err, t('error'))),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('title', { name: type.name })}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        {error ? (
          <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-900">
            {error}
          </p>
        ) : null}
        <DefaultApproverPicker selected={selected} onChange={setSelected} />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {common('cancel')}
          </Button>
          <Button
            type="button"
            disabled={saveMutation.isPending}
            onClick={() => {
              setError(null);
              saveMutation.mutate(selected.map((approver) => approver.id));
            }}
          >
            {saveMutation.isPending ? common('saving') : t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
