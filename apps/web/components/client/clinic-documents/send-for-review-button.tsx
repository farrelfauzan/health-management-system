'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ClinicDocumentView } from '@hms/shared-types';
import { useTranslations } from 'next-intl';

import { DocumentActionButton } from '#components/client/documents/document-action-button';
import { ConfirmDialog } from '#components/client/shared/confirm-dialog';
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
 * document from this moment until somebody approves it. The confirmation is
 * the app's own dialog rather than `window.confirm`, so the copy is localised
 * and the send can show that it is in flight. It is not styled as
 * destructive — nothing is lost, the document only goes quiet until somebody
 * approves it — so the confirm button stays the ordinary one.
 *
 * Assumes a `TooltipProvider` ancestor; the row that renders it supplies one.
 */
export function SendForReviewButton({ document, onResult, onError }: SendForReviewButtonProps) {
  const t = useTranslations('clinicCorpus.approval');
  const queryClient = useQueryClient();
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const sendMutation = useMutation({
    mutationFn: async () => {
      parseApiSuccess(
        await documentAdminControllerSendDocumentForReviewV1(document.id),
        t('errors.sendForReview'),
      );
    },
    onSuccess: async () => {
      await invalidateClinicDocumentQueries(queryClient);
      setIsConfirmOpen(false);
      onResult(t('success.sendForReview'));
    },
    onError: (err: unknown) => {
      setIsConfirmOpen(false);
      onError(resolveApiErrorMessage(err, t('errors.sendForReview')));
    },
  });

  if (document.approval.managedDocumentId !== null) {
    return null;
  }

  return (
    <>
      <DocumentActionButton
        icon="rate_review"
        label={t('sendForReview')}
        disabled={sendMutation.isPending}
        onClick={() => setIsConfirmOpen(true)}
      />
      <ConfirmDialog
        open={isConfirmOpen}
        onOpenChange={setIsConfirmOpen}
        title={t('confirm.sendForReview.title')}
        description={t('confirm.sendForReview.body', { title: document.title })}
        confirmLabel={t('confirm.sendForReview.confirm')}
        cancelLabel={t('confirm.sendForReview.cancel')}
        isPending={sendMutation.isPending}
        onConfirm={() => sendMutation.mutate()}
      />
    </>
  );
}
