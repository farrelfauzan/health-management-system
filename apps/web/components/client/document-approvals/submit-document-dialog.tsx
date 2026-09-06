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
  Input,
  Label,
  toast,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import { ApproverPicker, type ApproverOption } from '#components/client/document-approvals/approver-picker';
import { SelfApprovalNotice } from '#components/client/document-approvals/self-approval-notice';
import { managedDocumentControllerSubmitDocumentV1 } from '#lib/api/generated/documents/documents';
import { parseApiSuccess } from '#lib/api/response';
import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';
import { invalidateDocumentApprovalQueries } from '#lib/document-approvals/invalidate-document-approval-queries';

type SubmitDocumentDialogProps = {
  open: boolean;
  document: ManagedDocumentDetailView;
  currentUserId: string | null;
  onOpenChange: (open: boolean) => void;
};

/**
 * Submitting for approval (`P16-T31`, FR-E5-09/10): who approves, and by
 * when.
 *
 * The panel is pre-filled from the type's default approvers and freely
 * edited. The deadline is optional, and the copy says what it does and does
 * not do — a deadline drives reminders and an overdue flag, and never a
 * decision (FR-E5-28), which is worth saying out loud where the date is
 * entered rather than leaving people to assume the opposite.
 */
export function SubmitDocumentDialog({
  open,
  document,
  currentUserId,
  onOpenChange,
}: SubmitDocumentDialogProps) {
  const t = useTranslations('operations.documents.approvals.submit');
  const common = useTranslations('operations.common');
  const queryClient = useQueryClient();
  const [approvers, setApprovers] = useState<ApproverOption[]>(document.defaultApprovers);
  const [dueAt, setDueAt] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const isSelfOnly =
    !document.allowSelfApproval &&
    currentUserId !== null &&
    approvers.length === 1 &&
    approvers[0]?.id === currentUserId;
  const submitMutation = useMutation({
    mutationFn: async () =>
      parseApiSuccess<ManagedDocumentDetailView>(
        await managedDocumentControllerSubmitDocumentV1(document.id, {
          approverIds: approvers.map((approver) => approver.id),
          ...(dueAt === '' ? {} : { dueAt: new Date(dueAt).toISOString() }),
        }),
        t('error'),
      ),
    onSuccess: async () => {
      await invalidateDocumentApprovalQueries(queryClient);
      toast.success(t('submitted'));
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
        <ApproverPicker selected={approvers} onChange={setApprovers} />
        {isSelfOnly ? <SelfApprovalNotice /> : null}
        <div className="space-y-2">
          <Label htmlFor="document-approval-due-at">{t('dueAt')}</Label>
          <Input
            id="document-approval-due-at"
            type="datetime-local"
            value={dueAt}
            onChange={(event) => setDueAt(event.target.value)}
          />
          <p className="text-xs text-slate-500">{t('dueAtHint')}</p>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {common('cancel')}
          </Button>
          <Button
            type="button"
            disabled={approvers.length === 0 || isSelfOnly || submitMutation.isPending}
            onClick={() => {
              setError(null);
              submitMutation.mutate();
            }}
          >
            {submitMutation.isPending ? common('saving') : t('submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
