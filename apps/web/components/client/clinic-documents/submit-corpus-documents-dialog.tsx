'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ClinicDocumentBulkSubmissionView } from '@hms/shared-types';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import {
  ApproverPicker,
  type ApproverOption,
} from '#components/client/document-approvals/approver-picker';
import { InlineNotice } from '#components/client/shared/inline-notice';
import { LocalizedDateTimePicker } from '#components/client/shared/localized-date-time-picker';
import { documentAdminControllerSubmitDocumentsForApprovalV1 } from '#lib/api/generated/document-management/document-management';
import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';
import { parseApiSuccess } from '#lib/api/response';
import { invalidateClinicDocumentQueries } from '#lib/clinic-documents/invalidate-clinic-document-queries';
import { useClinicCorpusApprovalContext } from '#lib/clinic-documents/use-clinic-corpus-approval-context';

type SubmitCorpusDocumentsDialogProps = {
  open: boolean;
  /** The selection this submission covers: one row, or a whole page of them. */
  documentIds: readonly string[];
  currentUserId: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmitted: (message: string) => void;
  onFailed: (message: string) => void;
};

/**
 * Naming who approves a corpus document, and sending it (`P19`).
 *
 * One dialog for one row and for a selection of twenty-eight, because it is
 * one act either way: the clinic is asking one group of people to read a set
 * of documents. Splitting it into a per-row dialog and a separate bulk one
 * would be two places for the panel rules to drift apart, and the per-row
 * version is the one that does not scale — twenty-eight dialogs is the
 * asymmetry the corpus already removed from uploading.
 *
 * The panel opens pre-filled from the type's configured default approvers, so
 * the common case is a single click. It is freely edited: a default is a
 * convenience, never a routing rule.
 *
 * The self-approval warning is shown before the send rather than left to the
 * API's refusal, because a submitter who learns at the last moment that
 * nobody can sign has already waited for nothing. The API refuses it anyway,
 * and that refusal is the control.
 */
export function SubmitCorpusDocumentsDialog({
  open,
  documentIds,
  currentUserId,
  onOpenChange,
  onSubmitted,
  onFailed,
}: SubmitCorpusDocumentsDialogProps) {
  const t = useTranslations('clinicCorpus.approval.submit');
  const contextQuery = useClinicCorpusApprovalContext(open);
  const queryClient = useQueryClient();
  const [approvers, setApprovers] = useState<ApproverOption[]>([]);
  const [dueAt, setDueAt] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const defaultApprovers = contextQuery.context?.defaultApprovers;
  const allowSelfApproval = contextQuery.context?.allowSelfApproval ?? false;
  // The defaults arrive after the dialog opens, so they are applied when they
  // land rather than read once at mount — and only while the submitter has
  // not chosen anything yet, so a prefill never overwrites a choice.
  useEffect(() => {
    if (!open || defaultApprovers === undefined || defaultApprovers.length === 0) {
      return;
    }
    setApprovers((current) => (current.length === 0 ? [...defaultApprovers] : current));
  }, [open, defaultApprovers]);

  const isSelfOnly =
    !allowSelfApproval &&
    currentUserId !== null &&
    approvers.length === 1 &&
    approvers[0]?.id === currentUserId;

  const submitMutation = useMutation({
    mutationFn: async () =>
      parseApiSuccess<ClinicDocumentBulkSubmissionView>(
        await documentAdminControllerSubmitDocumentsForApprovalV1({
          documentIds: [...documentIds],
          approverIds: approvers.map((approver) => approver.id),
          ...(dueAt === '' ? {} : { dueAt: new Date(dueAt).toISOString() }),
        }),
        t('error'),
      ),
    onSuccess: async (envelope) => {
      await invalidateClinicDocumentQueries(queryClient);
      const { submittedCount, failedCount, items } = envelope.data;
      onOpenChange(false);
      if (failedCount === 0) {
        onSubmitted(t('success', { count: submittedCount }));
        return;
      }
      // The first refusal's own sentence, not a count. "3 failed" tells an
      // admin nothing about what to do next, and the service's reasons are
      // already written for a person to read.
      const firstFailure = items.find((item) => !item.isSubmitted);
      onFailed(
        t('partial', {
          submitted: submittedCount,
          failed: failedCount,
          reason: firstFailure?.error?.message ?? '',
        }),
      );
    },
    onError: (err: unknown) => setError(resolveApiErrorMessage(err, t('error'))),
  });

  function handleOpenChange(next: boolean): void {
    if (!next) {
      setApprovers([]);
      setDueAt('');
      setError(null);
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('title', { count: documentIds.length })}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
        <ApproverPicker selected={approvers} onChange={setApprovers} />
        {isSelfOnly ? <InlineNotice tone="warning">{t('selfApprovalOnly')}</InlineNotice> : null}
        <div className="space-y-2">
          <Label htmlFor="clinic-corpus-due-at">{t('dueAt')}</Label>
          <LocalizedDateTimePicker
            id="clinic-corpus-due-at"
            value={dueAt}
            onValueChange={setDueAt}
          />
          <p className="text-xs text-slate-500">{t('dueAtHint')}</p>
        </div>
        {/* Said before the send, not discovered on the list afterwards: an
            admin who does not know the document leaves the assistant's reach
            while it waits will read the silence as a bug. */}
        <InlineNotice tone="info">{t('consequence')}</InlineNotice>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button
            type="button"
            disabled={approvers.length === 0 || isSelfOnly || submitMutation.isPending}
            onClick={() => {
              setError(null);
              submitMutation.mutate();
            }}
          >
            {submitMutation.isPending ? t('submitting') : t('submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
