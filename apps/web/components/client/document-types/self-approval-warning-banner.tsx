'use client';

import { Icon } from '@hms/ui';
import { useTranslations } from 'next-intl';

/**
 * The persistent warning FR-E5-14 asks for while self-approval is on: a
 * drafter can approve their own document, which is the one thing an approval
 * policy exists to prevent. Rendered wherever the setting is visible, not
 * only at the moment it is switched.
 */
export function SelfApprovalWarningBanner() {
  const t = useTranslations('operations.documents.types.approval');

  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900"
    >
      <Icon name="warning" size={16} className="mt-0.5 shrink-0" />
      <span>{t('selfApprovalWarning')}</span>
    </p>
  );
}
