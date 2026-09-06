'use client';

import { useState } from 'react';
import type { ManagedDocumentDetailView } from '@hms/shared-types';
import { Badge, Card, CardContent, useAbility } from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import { ApproveDocumentButton } from '#components/client/document-approvals/approve-document-button';
import { NoEligibleApproverBanner } from '#components/client/document-approvals/no-eligible-approver-banner';
import { RejectDocumentDialog } from '#components/client/document-approvals/reject-document-dialog';
import { RejectDocumentTrigger } from '#components/client/document-approvals/reject-document-trigger';
import { SubmitDocumentDialog } from '#components/client/document-approvals/submit-document-dialog';
import { SubmitDocumentTrigger } from '#components/client/document-approvals/submit-document-trigger';
import { WithdrawDocumentButton } from '#components/client/document-approvals/withdraw-document-button';
import { IssueDocumentButton } from '#components/client/document-approvals/issue-document-button';

type DocumentApprovalPanelProps = {
  document: ManagedDocumentDetailView;
  currentUserId: string | null;
  /** Named on the open round — the API's other half of FR-E5-13. */
  isNamedApprover: boolean;
  canWrite: boolean;
  /** The `document-approval` entitlement (US-E5-06). */
  isApprovalEnabled: boolean;
};

/**
 * The approval half of the workspace (`P16-T31`).
 *
 * Two absences carry most of the meaning here:
 *
 *   * a type whose approval policy is off — or a clinic without the
 *     `document-approval` entitlement — renders an **Issue** action and no
 *     approver field, banner or badge at all (FR-E5-12, US-E5-06); and
 *   * the approve and reject controls appear only for someone both named on
 *     the round and holding `document-approval.decide:any` — CASL decides
 *     what renders, the API decides what happens (FR-E5-13).
 */
export function DocumentApprovalPanel({
  document,
  currentUserId,
  isNamedApprover,
  canWrite,
  isApprovalEnabled,
}: DocumentApprovalPanelProps) {
  const t = useTranslations('operations.documents.approvals.panel');
  const format = useFormatter();
  const ability = useAbility();
  const [isSubmitOpen, setIsSubmitOpen] = useState<boolean>(false);
  const [isRejectOpen, setIsRejectOpen] = useState<boolean>(false);
  const round = document.approval;
  const canDecide = ability.can('decide', 'DocumentApproval') && isNamedApprover;

  // Entitlement off on a type that *does* require approval: no approval
  // chrome, and no Issue button either — the API would refuse that issue with
  // DOCUMENT_APPROVAL_REQUIRED, and a button the API refuses is worse than
  // none. The clinic turns the type's policy off, or the entitlement back on.
  if (!isApprovalEnabled && document.isApprovalRequired) {
    return null;
  }
  if (!document.isApprovalRequired) {
    return (
      <Card className="rounded-xl border-slate-200 shadow-none">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="text-sm text-slate-600">{t('noApprovalNeeded')}</p>
          {canWrite && document.status === 'DRAFT' ? (
            <IssueDocumentButton documentId={document.id} />
          ) : null}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-xl border-slate-200 shadow-none">
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <p className="text-sm font-medium text-slate-900">{t('title')}</p>
            <p className="text-xs text-slate-500">
              {round === null
                ? t('notSubmitted')
                : t('progress', {
                    approved: round.approvalCount,
                    required: round.requiredApprovals,
                  })}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {round !== null && round.isOverdue ? (
              <Badge variant="destructive">{t('overdue')}</Badge>
            ) : null}
            {round === null && canWrite && document.status === 'DRAFT' ? (
              <SubmitDocumentTrigger onOpen={() => setIsSubmitOpen(true)} />
            ) : null}
            {round !== null && canWrite ? (
              <WithdrawDocumentButton documentId={document.id} />
            ) : null}
            {round !== null && canDecide ? (
              <RejectDocumentTrigger onOpen={() => setIsRejectOpen(true)} />
            ) : null}
            {round !== null && canDecide ? <ApproveDocumentButton roundId={round.roundId} /> : null}
          </div>
        </div>
        {round !== null && round.hasNoEligibleApprover ? <NoEligibleApproverBanner /> : null}
        {round !== null && round.dueAt !== null ? (
          <p className="text-xs text-slate-500">
            {t('dueAt', {
              date: format.dateTime(new Date(round.dueAt), {
                dateStyle: 'medium',
                timeStyle: 'short',
              }),
            })}
          </p>
        ) : null}
        {isSubmitOpen ? (
          <SubmitDocumentDialog
            open={isSubmitOpen}
            document={document}
            currentUserId={currentUserId}
            onOpenChange={setIsSubmitOpen}
          />
        ) : null}
        {isRejectOpen && round !== null ? (
          <RejectDocumentDialog
            open={isRejectOpen}
            roundId={round.roundId}
            onOpenChange={setIsRejectOpen}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
