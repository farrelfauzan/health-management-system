'use client';

import type { DocumentTemplateApprovalView } from '@hms/shared-types';
import { useTranslations } from 'next-intl';

import { InlineNotice } from '#components/client/shared/inline-notice';

type TemplateApprovalBannerProps = {
  approval: DocumentTemplateApprovalView;
  isDirty: boolean;
};

/**
 * What the drafter is told while a template's publish is gated (`P16-T32`).
 *
 * Rendered only under an active policy — the caller returns null before this
 * when approval is off, so a clinic that never turned it on sees no banner at
 * all (US-E5-06).
 *
 * The supersede warning is the one worth saying out loud: an edit while a
 * round is open voids that round (FR-E5-15), and a drafter who discovers that
 * after their approvers have already looked has cost three people a morning.
 */
export function TemplateApprovalBanner({ approval, isDirty }: TemplateApprovalBannerProps) {
  const t = useTranslations('operations.billing.templates.approval');

  if (approval.status === 'PENDING_APPROVAL') {
    return (
      <InlineNotice tone="warning" title={t('pending')} data-testid="template-approval-pending">
        {isDirty ? t('supersedeWarning') : null}
      </InlineNotice>
    );
  }

  return (
    <InlineNotice tone="info" data-testid="template-approval-required">
      {t('required')}
    </InlineNotice>
  );
}
