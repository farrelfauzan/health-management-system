'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ManagedDocumentDetailView } from '@hms/shared-types';
import { Button, toast } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { managedDocumentControllerWithdrawDocumentV1 } from '#lib/api/generated/documents/documents';
import { parseApiSuccess } from '#lib/api/response';
import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';
import { invalidateDocumentApprovalQueries } from '#lib/document-approvals/invalidate-document-approval-queries';

type WithdrawDocumentButtonProps = {
  documentId: string;
};

/** The drafter taking the request back (FR-E5-18). Nothing is decided. */
export function WithdrawDocumentButton({ documentId }: WithdrawDocumentButtonProps) {
  const t = useTranslations('operations.documents.approvals.withdraw');
  const queryClient = useQueryClient();
  const withdrawMutation = useMutation({
    mutationFn: async () =>
      parseApiSuccess<ManagedDocumentDetailView>(
        await managedDocumentControllerWithdrawDocumentV1(documentId),
        t('error'),
      ),
    onSuccess: async () => {
      await invalidateDocumentApprovalQueries(queryClient);
      toast.success(t('withdrawn'));
    },
    onError: (err: unknown) => toast.error(resolveApiErrorMessage(err, t('error'))),
  });

  return (
    <Button
      type="button"
      variant="outline"
      disabled={withdrawMutation.isPending}
      onClick={() => withdrawMutation.mutate()}
    >
      {t('action')}
    </Button>
  );
}
