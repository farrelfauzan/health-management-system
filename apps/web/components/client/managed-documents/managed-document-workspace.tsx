'use client';

import { Card, CardContent, useAbility } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { DocumentApprovalPanel } from '#components/client/document-approvals/document-approval-panel';
import { DocumentApprovalThread } from '#components/client/document-approvals/document-approval-thread';
import { ManagedDocumentBody } from '#components/client/managed-documents/managed-document-body';
import { ManagedDocumentHeader } from '#components/client/managed-documents/managed-document-header';
import { TemplateSubmissionReview } from '#components/client/document-templates/template-submission-review';
import { PageHeader } from '#components/shared/page-header';
import { useManagedDocument } from '#lib/managed-documents/use-managed-document';
import { useManagedDocumentHistory } from '#lib/managed-documents/use-managed-document-history';

type ManagedDocumentWorkspaceProps = {
  documentId: string;
  currentUserId: string | null;
  /** The `document-approval` entitlement — off, no approval chrome at all. */
  isApprovalEnabled: boolean;
};

/**
 * One document, everything about it (`P16-T31`, §7.5.1): its content, its
 * parties, where it stands, and the thread of decisions behind it. Drafter
 * and approver both act here — there is no second screen for the other role.
 */
export function ManagedDocumentWorkspace({
  documentId,
  currentUserId,
  isApprovalEnabled,
}: ManagedDocumentWorkspaceProps) {
  const t = useTranslations('operations.documents.workspace');
  const ability = useAbility();
  const documentQuery = useManagedDocument(documentId);
  const historyQuery = useManagedDocumentHistory(documentId);
  const document = documentQuery.document;

  if (documentQuery.isPending) {
    return <p className="px-4 py-6 text-sm text-slate-500">{t('loading')}</p>;
  }
  if (documentQuery.isError || document === undefined) {
    return (
      <Card className="rounded-xl border-slate-200 shadow-none">
        <CardContent className="p-6">
          <p role="alert" className="text-sm text-slate-600">
            {t('loadError')}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={document.title}
        subtitle={document.type.name}
        breadcrumbs={[t('breadcrumb'), document.title]}
      />
      <ManagedDocumentHeader document={document} />
      <DocumentApprovalPanel
        document={document}
        currentUserId={currentUserId}
        isNamedApprover={resolveIsNamedApprover(historyQuery.rounds, currentUserId)}
        canWrite={ability.can('write', 'ManagedDocument')}
        isApprovalEnabled={isApprovalEnabled}
      />
      {/*
        A template's body is a layout, not prose, so the registry's own body
        panel says little about it. `P16-T32` puts the review an approver
        actually needs here instead: the frozen submission rendered, and a
        diff against the version invoices render from today (FR-E5-21/22).
      */}
      {isApprovalEnabled && document.subject?.kind === 'TEMPLATE' ? (
        <TemplateSubmissionReview templateId={document.subject.templateId} />
      ) : null}
      <ManagedDocumentBody document={document} />
      {isApprovalEnabled ? (
        <DocumentApprovalThread rounds={historyQuery.rounds} isPending={historyQuery.isPending} />
      ) : null}
    </div>
  );
}

/**
 * Whether the viewer is on the *open* round's panel.
 *
 * Read from the history rather than the summary because the summary carries
 * counts, not names — and this is a visibility question only. The API checks
 * the same fact again on every decide route, and that check is the one that
 * decides anything (FR-E5-13).
 */
function resolveIsNamedApprover(
  rounds: ReadonlyArray<{ status: string; approvers: Array<{ id: string }> }>,
  currentUserId: string | null,
): boolean {
  if (currentUserId === null) {
    return false;
  }
  return rounds.some(
    (round) =>
      round.status === 'PENDING' &&
      round.approvers.some((approver) => approver.id === currentUserId),
  );
}
