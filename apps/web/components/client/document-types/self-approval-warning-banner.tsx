'use client';

import { useTranslations } from 'next-intl';

import { InlineNotice } from '#components/client/shared/inline-notice';

/**
 * The persistent warning FR-E5-14 asks for while self-approval is on: a
 * drafter can approve their own document, which is the one thing an approval
 * policy exists to prevent. Rendered wherever the setting is visible, not
 * only at the moment it is switched.
 */
export function SelfApprovalWarningBanner() {
  const t = useTranslations('operations.documents.types.approval');

  return <InlineNotice tone="warning">{t('selfApprovalWarning')}</InlineNotice>;
}
