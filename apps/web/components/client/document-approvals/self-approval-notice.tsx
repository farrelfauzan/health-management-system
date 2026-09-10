'use client';

import { useTranslations } from 'next-intl';

import { InlineNotice } from '#components/client/shared/inline-notice';

/**
 * Shown when the drafter has named only themselves on a type whose
 * `allowSelfApproval` is off (FR-E5-14).
 *
 * The dialog surfaces it *before* submit rather than letting the API refuse
 * afterwards, because a drafter who learns at the last moment that nobody
 * can sign has already waited for nothing (§7.5.10). The API refuses this
 * panel regardless — this notice is the courtesy, not the control.
 */
export function SelfApprovalNotice() {
  const t = useTranslations('operations.documents.approvals.submit');

  return <InlineNotice tone="warning">{t('selfApprovalOnly')}</InlineNotice>;
}
