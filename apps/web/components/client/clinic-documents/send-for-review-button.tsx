'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ClinicDocumentView } from '@hms/shared-types';
import { Button } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { documentAdminControllerSendDocumentForReviewV1 } from '#lib/api/generated/document-management/document-management';
import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';
import { parseApiSuccess } from '#lib/api/response';
import { invalidateClinicDocumentQueries } from '#lib/clinic-documents/invalidate-clinic-document-queries';

type SendForReviewButtonProps = {
  document: ClinicDocumentView;
  onResult: (message: string) => void;
  onError: (message: string) => void;
};

/**
 * Puts an already-retrievable corpus document behind the approval gate
 * (`P16-T33`, R-19).
 *
 * Offered only for a document that has no registry row yet — one that
 * predates the clinic switching approval on (OQ-18). It is the deliberate
 * counterpart to that non-retroactivity: enabling the policy changes nothing
 * about documents the assistant already cites, and this is how an admin
 * changes it for one of them.
 *
 * It is confirmed, because it has a consequence people do not expect from a
 * button labelled "review": the assistant stops being able to cite the
 * document from this moment until somebody approves it.
 */
export function SendForReviewButton({ document, onResult, onError }: SendForReviewButtonProps) {
  const t = useTranslations('clinicCorpus.approval');
  const queryClient = useQueryClient();
  const sendMutation = useMutation({
    mutationFn: async () => {
      parseApiSuccess(
        await documentAdminControllerSendDocumentForReviewV1(document.id),
        t('errors.sendForReview'),
      );
    },
    onSuccess: async () => {
      await invalidateClinicDocumentQueries(queryClient);
      onResult(t('success.sendForReview'));
    },
    onError: (err: unknown) => onError(resolveApiErrorMessage(err, t('errors.sendForReview'))),
  });

  if (document.approval.managedDocumentId !== null) {
    return null;
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={sendMutation.isPending}
      onClick={() => {
        if (window.confirm(t('confirm.sendForReview', { title: document.title }))) {
          sendMutation.mutate();
        }
      }}
    >
      {t('sendForReview')}
    </Button>
  );
}
