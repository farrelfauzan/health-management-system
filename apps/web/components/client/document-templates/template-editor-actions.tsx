'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { DocumentTemplatePreviewView, DocumentTemplateView } from '@hms/shared-types';
import { Button, Icon, toast } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { TemplatePreviewDialog } from '#components/client/document-templates/template-preview-dialog';
import { TemplatePublishErrors } from '#components/client/document-templates/template-publish-errors';
import {
  documentTemplateControllerPreviewTemplateV1,
  documentTemplateControllerPublishTemplateV1,
} from '#lib/api/generated/document-templates/document-templates';
import { notifyApiError } from '#lib/api/notify-api-error';
import { parseApiSuccess } from '#lib/api/response';
import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';
import { invalidateDocumentTemplateQueries } from '#lib/document-templates/invalidate-document-template-queries';
import { resolvePublishValidationDetails } from '#lib/document-templates/resolve-publish-validation-details';

type TemplateEditorActionsProps = {
  template: DocumentTemplateView;
  canWrite: boolean;
  isDirty: boolean;
  isSaving: boolean;
  hasContent: boolean;
  /**
   * Persists the draft first. Preview and publish both run against the
   * *saved* working copy, so with unsaved changes the action saves, then
   * proceeds — never a stale silent preview (US-E1-04).
   */
  onSaveDraft: () => Promise<boolean>;
};

export function TemplateEditorActions({
  template,
  canWrite,
  isDirty,
  isSaving,
  hasContent,
  onSaveDraft,
}: TemplateEditorActionsProps) {
  const t = useTranslations('operations.billing.templates');
  const queryClient = useQueryClient();
  const [preview, setPreview] = useState<DocumentTemplatePreviewView | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState<boolean>(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [unknownTokens, setUnknownTokens] = useState<readonly string[] | null>(null);

  const previewMutation = useMutation({
    mutationFn: async () => {
      const isSaved = await onSaveDraft();
      if (!isSaved) {
        return null;
      }
      return parseApiSuccess<DocumentTemplatePreviewView>(
        await documentTemplateControllerPreviewTemplateV1(template.id),
        t('preview.error'),
      );
    },
    onSuccess: (envelope) => {
      if (envelope === null) {
        return;
      }
      setPreviewError(null);
      setPreview(envelope.data);
      setIsPreviewOpen(true);
    },
    onError: (err: unknown) => setPreviewError(resolveApiErrorMessage(err, t('preview.error'))),
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      const isSaved = await onSaveDraft();
      if (!isSaved) {
        return null;
      }
      return parseApiSuccess<DocumentTemplateView>(
        await documentTemplateControllerPublishTemplateV1(template.id),
        t('publish.error'),
      );
    },
    onSuccess: async (envelope) => {
      if (envelope === null) {
        return;
      }
      setUnknownTokens(null);
      await invalidateDocumentTemplateQueries(queryClient);
      toast.success(
        t('publish.success', { version: envelope.data.latestPublishedVersion?.versionNumber ?? 1 }),
      );
    },
    onError: (err: unknown) => {
      const details = resolvePublishValidationDetails(err);
      if (details !== null) {
        setUnknownTokens(details.unknownTokens);
        return;
      }
      notifyApiError(err, t('publish.error'));
    },
  });

  const isBusy = isSaving || previewMutation.isPending || publishMutation.isPending;
  const isActionDisabled = !canWrite || isBusy || !hasContent;

  return (
    <div className="space-y-3" data-testid="template-editor-actions">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={isActionDisabled}
          onClick={() => previewMutation.mutate()}
        >
          <Icon name="visibility" size={18} />
          {isDirty ? t('preview.saveAndPreview') : t('preview.action')}
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={isActionDisabled}
          onClick={() => publishMutation.mutate()}
        >
          <Icon name="publish" size={18} />
          {isDirty ? t('publish.saveAndPublish') : t('publish.action')}
        </Button>
      </div>
      {previewError ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
        >
          <span>{previewError}</span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isBusy}
            onClick={() => previewMutation.mutate()}
          >
            {t('preview.retry')}
          </Button>
        </div>
      ) : null}
      {unknownTokens !== null ? (
        <TemplatePublishErrors unknownTokens={unknownTokens} onDismiss={() => setUnknownTokens(null)} />
      ) : null}
      <TemplatePreviewDialog open={isPreviewOpen} preview={preview} onOpenChange={setIsPreviewOpen} />
    </div>
  );
}
