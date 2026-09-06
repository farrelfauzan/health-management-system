'use client';

import { useMutation } from '@tanstack/react-query';
import type { DocumentTemplateApprovalPreviewView } from '@hms/shared-types';
import { Button, Card, CardContent, Icon } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { TemplateSubmissionDiff } from '#components/client/document-templates/template-submission-diff';
import { documentTemplateControllerPreviewTemplateSubmissionV1 } from '#lib/api/generated/document-templates/document-templates';
import { parseApiSuccess } from '#lib/api/response';
import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';

type TemplateSubmissionReviewProps = {
  templateId: string;
};

/**
 * What an approver reads before deciding on a template (`P16-T32`,
 * FR-E5-21/22).
 *
 * Both halves come from the round's **frozen payload**: the PDF is the
 * submitted layout rendered against the hostile fixture, and the diff is that
 * same layout against the published version. A drafter who kept editing after
 * submitting changes neither, which is the whole point — an approver has to
 * be looking at the thing they are approving.
 *
 * Loaded on demand rather than with the document. Rendering a PDF costs a
 * sidecar round trip, and the registry detail is opened far more often than
 * a template submission is reviewed.
 */
export function TemplateSubmissionReview({ templateId }: TemplateSubmissionReviewProps) {
  const t = useTranslations('operations.billing.templates.approval.review');
  const reviewMutation = useMutation({
    mutationFn: async () =>
      parseApiSuccess<DocumentTemplateApprovalPreviewView>(
        await documentTemplateControllerPreviewTemplateSubmissionV1(templateId),
        t('error'),
      ),
  });
  const review = reviewMutation.data?.data;

  return (
    <Card className="rounded-xl border-slate-200 shadow-none" data-testid="template-submission-review">
      <CardContent className="space-y-4 p-6">
        <div className="space-y-1">
          <h2 className="text-base font-medium text-slate-900">{t('title')}</h2>
          <p className="text-sm text-slate-600">{t('description')}</p>
        </div>
        {reviewMutation.isError ? (
          <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-900">
            {resolveApiErrorMessage(reviewMutation.error, t('error'))}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={reviewMutation.isPending}
            onClick={() => reviewMutation.mutate()}
          >
            <Icon name="difference" size={18} />
            {t('action')}
          </Button>
          {review === undefined ? null : (
            <a
              className="text-sm font-medium text-sky-700 underline underline-offset-4"
              href={review.preview.url}
              target="_blank"
              rel="noreferrer"
            >
              {t('openPreview')}
            </a>
          )}
        </div>
        {review === undefined ? null : <TemplateSubmissionDiff review={review} />}
      </CardContent>
    </Card>
  );
}
