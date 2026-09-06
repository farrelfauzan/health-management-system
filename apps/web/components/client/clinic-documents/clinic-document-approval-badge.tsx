'use client';

import type { ClinicDocumentApprovalView } from '@hms/shared-types';
import { useTranslations } from 'next-intl';

type ClinicDocumentApprovalBadgeProps = {
  approval: ClinicDocumentApprovalView;
};

const TONE_CLASS_NAME: Readonly<Record<string, string>> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  PENDING_APPROVAL: 'bg-amber-100 text-amber-900',
  ISSUED: 'bg-emerald-100 text-emerald-900',
  ARCHIVED: 'bg-slate-100 text-slate-500',
};

/**
 * Where a corpus document stands with its approvers (`P16-T33`, FR-E5-19).
 *
 * Renders nothing for a document with no registry row — which is every
 * document while the policy is off, and every document that predates a clinic
 * switching it on (OQ-18). The column simply stays empty rather than
 * asserting "approved" about a document nobody was ever asked to approve.
 *
 * The line under an unapproved document is the one that matters: the
 * assistant cannot retrieve it. An admin who uploaded the clinic's refund
 * policy and saw it listed has every reason to assume the bot is using it,
 * and under an active policy it is not.
 */
export function ClinicDocumentApprovalBadge({ approval }: ClinicDocumentApprovalBadgeProps) {
  const t = useTranslations('clinicCorpus.approval');
  const status = approval.status;

  if (status === null) {
    return null;
  }

  return (
    <div className="space-y-1">
      <span
        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CLASS_NAME[status] ?? TONE_CLASS_NAME.DRAFT}`}
      >
        {t(`status.${status}`)}
      </span>
      {status === 'ISSUED' ? null : (
        <p className="text-xs text-slate-500">{t('notRetrievableYet')}</p>
      )}
    </div>
  );
}
