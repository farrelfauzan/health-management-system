'use client';

import type { DocumentApprovalRoundView } from '@hms/shared-types';
import { Badge } from '@hms/ui';
import { useFormatter, useTranslations } from 'next-intl';

import { DocumentApprovalDecisionItem } from '#components/client/document-approvals/document-approval-decision-item';

type DocumentApprovalRoundItemProps = {
  round: DocumentApprovalRoundView;
};

/** One round: who was asked, by when, and what came back. */
export function DocumentApprovalRoundItem({ round }: DocumentApprovalRoundItemProps) {
  const t = useTranslations('operations.documents.approvals.thread');
  const format = useFormatter();

  return (
    <section className="space-y-2 rounded-lg border border-slate-200 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-900">
          {t('submittedBy', {
            email: round.submittedBy.email,
            date: format.dateTime(new Date(round.submittedAt), { dateStyle: 'medium' }),
          })}
        </p>
        <div className="flex items-center gap-2">
          {round.isOverdue ? <Badge variant="destructive">{t('overdue')}</Badge> : null}
          <Badge variant="secondary">{t(`statuses.${round.status}`)}</Badge>
        </div>
      </div>
      <p className="text-xs text-slate-500">
        {t('approvers', { emails: round.approvers.map((approver) => approver.email).join(', ') })}
        {round.dueAt === null
          ? ''
          : ` · ${t('dueAt', {
              date: format.dateTime(new Date(round.dueAt), {
                dateStyle: 'medium',
                timeStyle: 'short',
              }),
            })}`}
      </p>
      {round.decisions.length === 0 ? (
        <p className="text-xs text-slate-500">{t('noDecisions')}</p>
      ) : (
        <ul className="space-y-2">
          {round.decisions.map((decision) => (
            <DocumentApprovalDecisionItem key={decision.id} decision={decision} />
          ))}
        </ul>
      )}
    </section>
  );
}
