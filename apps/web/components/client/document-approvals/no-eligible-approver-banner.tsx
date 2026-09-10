'use client';

import { useTranslations } from 'next-intl';

import { InlineNotice } from '#components/client/shared/inline-notice';

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

  return <InlineNotice tone="warning">{t('noEligibleApprover')}</InlineNotice>;
}
