'use client';

import type { DocumentTemplateApprovalView } from '@hms/shared-types';
import { Icon } from '@hms/ui';
import { useTranslations } from 'next-intl';

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
      <div
        role="status"
        data-testid="template-approval-pending"
        className="flex flex-col gap-1 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
      >
        <span className="flex items-center gap-2 font-medium">
          <Icon name="hourglass_top" size={18} />
          {t('pending')}
        </span>
        {isDirty ? <span>{t('supersedeWarning')}</span> : null}
      </div>
    );
  }

  return (
    <div
      role="status"
      data-testid="template-approval-required"
      className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
    >
      <Icon name="how_to_reg" size={18} />
      {t('required')}
    </div>
  );
}
