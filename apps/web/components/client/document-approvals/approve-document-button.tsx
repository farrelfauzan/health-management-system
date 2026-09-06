'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ManagedDocumentDetailView } from '@hms/shared-types';
import { Button, Icon, toast } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { documentApprovalControllerApproveV1 } from '#lib/api/generated/documents/documents';
import { parseApiSuccess } from '#lib/api/response';
import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';
import { invalidateDocumentApprovalQueries } from '#lib/document-approvals/invalidate-document-approval-queries';

type ApproveDocumentButtonProps = {
  roundId: string;
};

/**
 * Approving (`P16-T31`, FR-E5-16/21). No confirmation step: the approver is
 * looking at the frozen submission when they press it, which is the review.
 *
 * A "somebody got there first" 409 is surfaced as an ordinary message rather
 * than an error banner — in a multi-approver round it is a normal outcome,
 * not a fault, and the invalidation below repaints the resolved state.
 */
export function ApproveDocumentButton({ roundId }: ApproveDocumentButtonProps) {
  const t = useTranslations('operations.documents.approvals.approve');
  const queryClient = useQueryClient();
  const approveMutation = useMutation({
    mutationFn: async () =>
      parseApiSuccess<ManagedDocumentDetailView>(
        await documentApprovalControllerApproveV1(roundId),
        t('error'),
      ),
    onSuccess: async () => {
      await invalidateDocumentApprovalQueries(queryClient);
      toast.success(t('approved'));
    },
    onError: async (err: unknown) => {
      await invalidateDocumentApprovalQueries(queryClient);
      toast.error(resolveApiErrorMessage(err, t('error')));
    },
  });

  return (
    <Button type="button" disabled={approveMutation.isPending} onClick={() => approveMutation.mutate()}>
      <Icon name="check_circle" size={18} />
      {t('action')}
    </Button>
  );
}
