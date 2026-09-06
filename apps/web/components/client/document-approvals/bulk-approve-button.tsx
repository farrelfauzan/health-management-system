'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { DocumentBulkApprovalView } from '@hms/shared-types';
import { Button, Icon, toast } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { documentApprovalControllerBulkApproveV1 } from '#lib/api/generated/documents/documents';
import { parseApiSuccess } from '#lib/api/response';
import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';
import { invalidateDocumentApprovalQueries } from '#lib/document-approvals/invalidate-document-approval-queries';

type BulkApproveButtonProps = {
  requestIds: readonly string[];
  onDone: () => void;
};

/**
 * Approving a selection in one call (`P16-T33`, FR-E5-23, R-18).
 *
 * Onboarding a forty-document corpus should not cost forty visits. What it
 * must not cost either is a weaker decision: every item goes through the same
 * checks a single approve does, on the server, so this is a saving in round
 * trips and in nothing else.
 *
 * Partial failure is reported rather than hidden. A batch is not a
 * transaction — one round somebody else already decided fails alone — and an
 * approver who is told "12 approved" while one silently did not would find
 * out from the drafter.
 */
export function BulkApproveButton({ requestIds, onDone }: BulkApproveButtonProps) {
  const t = useTranslations('operations.documents.approvals.bulk');
  const queryClient = useQueryClient();
  const bulkMutation = useMutation({
    mutationFn: async () =>
      parseApiSuccess<DocumentBulkApprovalView>(
        await documentApprovalControllerBulkApproveV1({ requestIds: [...requestIds] }),
        t('error'),
      ),
    onSuccess: async (envelope) => {
      await invalidateDocumentApprovalQueries(queryClient);
      const { approvedCount, failedCount, items } = envelope.data;
      if (failedCount === 0) {
        toast.success(t('success', { count: approvedCount }));
      } else {
        // The first failure's own message, not a count: "3 failed" tells an
        // approver nothing about what to do next, and the service's reasons
        // are already written for a person to read.
        const firstFailure = items.find((item) => !item.isApproved);
        toast.error(
          t('partial', {
            approved: approvedCount,
            failed: failedCount,
            reason: firstFailure?.error?.message ?? '',
          }),
        );
      }
      onDone();
    },
    onError: (err: unknown) => toast.error(resolveApiErrorMessage(err, t('error'))),
  });

  return (
    <Button
      type="button"
      size="sm"
      disabled={requestIds.length === 0 || bulkMutation.isPending}
      onClick={() => bulkMutation.mutate()}
    >
      <Icon name="done_all" size={18} />
      {t('action', { count: requestIds.length })}
    </Button>
  );
}
