'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ManagedDocumentDetailView } from '@hms/shared-types';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Textarea,
  toast,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { documentApprovalControllerRejectV1 } from '#lib/api/generated/documents/documents';
import { parseApiSuccess } from '#lib/api/response';
import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';
import { invalidateDocumentApprovalQueries } from '#lib/document-approvals/invalidate-document-approval-queries';

type RejectDocumentDialogProps = {
  open: boolean;
  roundId: string;
  onOpenChange: (open: boolean) => void;
};

/**
 * Rejecting a document (`P16-T31`, FR-E5-17).
 *
 * The reason is required and the button stays disabled until there is one.
 * That is a courtesy, not the rule: the schema, the service and a CHECK on
 * the table each refuse an empty reason, because "returned to draft" with no
 * explanation is the failure the requirement exists to prevent — and it is
 * the drafter, not the approver, who pays for it (US-E5-03).
 */
export function RejectDocumentDialog({ open, roundId, onOpenChange }: RejectDocumentDialogProps) {
  const t = useTranslations('operations.documents.approvals.reject');
  const common = useTranslations('operations.common');
  const queryClient = useQueryClient();
  const [reason, setReason] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const rejectMutation = useMutation({
    mutationFn: async () =>
      parseApiSuccess<ManagedDocumentDetailView>(
        await documentApprovalControllerRejectV1(roundId, { reason: reason.trim() }),
        t('error'),
      ),
    onSuccess: async () => {
      await invalidateDocumentApprovalQueries(queryClient);
      toast.success(t('rejected'));
      onOpenChange(false);
    },
    onError: (err: unknown) => setError(resolveApiErrorMessage(err, t('error'))),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        {error ? (
          <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-900">
            {error}
          </p>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="document-rejection-reason">{t('reason')}</Label>
          <Textarea
            id="document-rejection-reason"
            rows={4}
            value={reason}
            placeholder={t('reasonPlaceholder')}
            onChange={(event) => setReason(event.target.value)}
          />
          <p className="text-xs text-slate-500">{t('reasonHint')}</p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {common('cancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={reason.trim() === '' || rejectMutation.isPending}
            onClick={() => {
              setError(null);
              rejectMutation.mutate();
            }}
          >
            {rejectMutation.isPending ? common('saving') : t('submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
