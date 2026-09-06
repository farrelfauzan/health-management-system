'use client';

import { useTranslations } from 'next-intl';

/**
 * Every named approver has been deactivated or has lost the decide key, so
 * this round cannot resolve however long anyone waits (§7.5.10).
 *
 * Worth its own banner rather than a subtle badge: the failure mode it
 * prevents is a drafter waiting weeks on a panel that no longer exists, and
 * nothing else on the screen would tell them.
 */
export function NoEligibleApproverBanner() {
  const t = useTranslations('operations.documents.approvals.panel');

  return (
    <p role="alert" className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
      {t('noEligibleApprover')}
    </p>
  );
}
