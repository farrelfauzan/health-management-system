'use client';

import { useState } from 'react';
import type { DocumentTemplateApprovalView } from '@hms/shared-types';
import { useTranslations } from 'next-intl';

import { SubmitDocumentDialog } from '#components/client/document-approvals/submit-document-dialog';
import { SubmitDocumentTrigger } from '#components/client/document-approvals/submit-document-trigger';
import { WithdrawDocumentButton } from '#components/client/document-approvals/withdraw-document-button';
import { TemplateApprovalBanner } from '#components/client/document-templates/template-approval-banner';
import { useManagedDocument } from '#lib/managed-documents/use-managed-document';

type TemplateApprovalPanelProps = {
  approval: DocumentTemplateApprovalView;
  currentUserId: string | null;
  canWrite: boolean;
  isDirty: boolean;
  /**
   * Persists the draft first. What gets frozen is the *saved* working copy,
   * so submitting with unsaved changes would send an approver a layout the
   * drafter cannot see on their own screen.
   */
  onSaveDraft: () => Promise<boolean>;
};

/**
 * The approval half of the template editor (`P16-T32`).
 *
 * Renders **nothing** while the `INVOICE_TEMPLATE` policy is off, which is
 * the default: no approver field, no banner, no badge, and the publish button
 * next to it behaves exactly as E1 specifies (US-E5-06).
 *
 * The registry row is fetched rather than re-modelled, and the submit and
 * withdraw controls are the documents module's own. A template submission is
 * an ordinary approval round over an ordinary registry row — giving templates
 * their own copy of that UI would be two things to keep in step, and the
 * second one would drift.
 */
export function TemplateApprovalPanel({
  approval,
  currentUserId,
  canWrite,
  isDirty,
  onSaveDraft,
}: TemplateApprovalPanelProps) {
  const t = useTranslations('operations.billing.templates.approval');
  const [isSubmitOpen, setIsSubmitOpen] = useState<boolean>(false);
  const managedDocumentId = approval.managedDocumentId;
  const { document } = useManagedDocument(managedDocumentId ?? '');

  if (!approval.isApprovalRequired) {
    return null;
  }

  return (
    <div className="space-y-3" data-testid="template-approval-panel">
      <TemplateApprovalBanner approval={approval} isDirty={isDirty} />
      <div className="flex flex-wrap items-center gap-2">
        {approval.status === 'PENDING_APPROVAL' && managedDocumentId !== null ? (
          <WithdrawDocumentButton documentId={managedDocumentId} />
        ) : (
          <SubmitDocumentTrigger
            onOpen={() => {
              void onSaveDraft().then((isSaved) => setIsSubmitOpen(isSaved));
            }}
          />
        )}
      </div>
      {/*
        The registry row arrives a moment after the template does, so the
        dialog waits for it rather than opening against a half-built document
        whose default approvers it could not pre-fill.
      */}
      {document === undefined ? (
        isSubmitOpen ? <p className="text-sm text-slate-500">{t('loadingRegistryRow')}</p> : null
      ) : (
        <SubmitDocumentDialog
          open={isSubmitOpen && canWrite}
          document={document}
          currentUserId={currentUserId}
          onOpenChange={setIsSubmitOpen}
        />
      )}
    </div>
  );
}
