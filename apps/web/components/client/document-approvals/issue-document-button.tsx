'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ManagedDocumentDetailView } from '@hms/shared-types';
import { Button, Icon, toast } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { managedDocumentControllerIssueDocumentV1 } from '#lib/api/generated/documents/documents';
import { parseApiSuccess } from '#lib/api/response';
import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';
import { invalidateDocumentApprovalQueries } from '#lib/document-approvals/invalidate-document-approval-queries';

type IssueDocumentButtonProps = {
  documentId: string;
};

/**
 * Issuing a draft directly (FR-E5-12) — the whole action for a type whose
 * approval policy is off (US-E5-06).
 *
 * The workspace renders this *instead of* the submit flow, never beside it:
 * on an approval-off type there is no approver field, no banner and no badge
 * anywhere, and on an approval-on type this button does not exist. The API
 * refuses the route either way, which is what makes the absence safe rather
 * than merely tidy.
 */
export function IssueDocumentButton({ documentId }: IssueDocumentButtonProps) {
  const t = useTranslations('operations.documents.approvals.issue');
  const queryClient = useQueryClient();
  const issueMutation = useMutation({
    mutationFn: async () =>
      parseApiSuccess<ManagedDocumentDetailView>(
        await managedDocumentControllerIssueDocumentV1(documentId),
        t('error'),
      ),
    onSuccess: async () => {
      await invalidateDocumentApprovalQueries(queryClient);
      toast.success(t('issued'));
    },
    onError: (err: unknown) => toast.error(resolveApiErrorMessage(err, t('error'))),
  });

  return (
    <Button type="button" disabled={issueMutation.isPending} onClick={() => issueMutation.mutate()}>
      <Icon name="task_alt" size={18} />
      {t('action')}
    </Button>
  );
}
