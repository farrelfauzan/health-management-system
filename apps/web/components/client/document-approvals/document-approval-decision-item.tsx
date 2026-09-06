'use client';

import type { DocumentApprovalDecisionView } from '@hms/shared-types';
import { useFormatter, useTranslations } from 'next-intl';

type DocumentApprovalDecisionItemProps = {
  decision: DocumentApprovalDecisionView;
};

/**
 * One decision, with its reason where there is one.
 *
 * The reason is rendered as the approver typed it and never truncated: it is
 * the whole content of a rejection to the person who has to act on it
 * (US-E5-03).
 */
export function DocumentApprovalDecisionItem({ decision }: DocumentApprovalDecisionItemProps) {
  const t = useTranslations('operations.documents.approvals.thread');
  const format = useFormatter();

  return (
    <li className="rounded-md bg-slate-50 px-3 py-2">
      <p className="text-sm text-slate-900">
        {t(decision.isApproved ? 'approvedBy' : 'rejectedBy', {
          email: decision.approver.email,
          date: format.dateTime(new Date(decision.decidedAt), {
            dateStyle: 'medium',
            timeStyle: 'short',
          }),
        })}
      </p>
      {decision.reason === null ? null : (
        <p className="mt-1 text-sm whitespace-pre-wrap text-slate-700">{decision.reason}</p>
      )}
    </li>
  );
}
