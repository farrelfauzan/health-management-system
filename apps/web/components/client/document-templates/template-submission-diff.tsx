'use client';

import type { DocumentTemplateApprovalPreviewView } from '@hms/shared-types';
import { useTranslations } from 'next-intl';

import { TemplateDiffSegment } from '#components/client/document-templates/template-diff-segment';

type TemplateSubmissionDiffProps = {
  review: DocumentTemplateApprovalPreviewView;
};

/**
 * What changed between the submission and the version invoices render from
 * today (`P16-T32`, FR-E5-22).
 *
 * Unchanged blocks stay on screen rather than being collapsed away. A
 * template is a page, not a codebase: the whole thing fits, and an approver
 * asked to sign off a layout should see the layout, with the changes marked
 * inside it.
 */
export function TemplateSubmissionDiff({ review }: TemplateSubmissionDiffProps) {
  const t = useTranslations('operations.billing.templates.approval.review');
  const hasChanges = review.diff.some((segment) => segment.kind !== 'UNCHANGED');

  return (
    <section className="space-y-2" data-testid="template-submission-diff">
      <h3 className="text-sm font-medium text-slate-900">
        {review.baseVersionNumber === null
          ? t('diffFirstPublish')
          : t('diffTitle', { version: review.baseVersionNumber })}
      </h3>
      {hasChanges ? (
        <ul className="max-h-80 overflow-y-auto rounded-lg border border-slate-200">
          {review.diff.map((segment, index) => (
            <TemplateDiffSegment key={`${segment.kind}-${index}`} segment={segment} />
          ))}
        </ul>
      ) : (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          {t('noChanges')}
        </p>
      )}
    </section>
  );
}
