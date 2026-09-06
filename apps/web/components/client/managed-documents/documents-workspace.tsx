'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { DocumentApprovalQueuePanel } from '#components/client/document-approvals/document-approval-queue-panel';
import { DocumentTypesPanel } from '#components/client/document-types/document-types-panel';
import { ManagedDocumentsPanel } from '#components/client/managed-documents/managed-documents-panel';
import { PageHeader } from '#components/shared/page-header';

type DocumentsWorkspaceProps = {
  currentUserId: string | null;
  /**
   * The `document-approval` entitlement (US-E5-06). Off, the approvals tab is
   * absent entirely — the registry, its search and its export are untouched,
   * because switching approval off takes away the second signature and
   * nothing else.
   */
  isApprovalEnabled: boolean;
};

/**
 * The documents module's screen (`P16-T31`): the registry, the caller's own
 * approval queue beside it, and the type settings behind both.
 */
export function DocumentsWorkspace({
  currentUserId,
  isApprovalEnabled,
}: DocumentsWorkspaceProps) {
  const t = useTranslations('operations.documents');

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} subtitle={t('subtitle')} breadcrumbs={[t('title')]} />
      <Tabs defaultValue="registry" className="space-y-5">
        <TabsList>
          <TabsTrigger value="registry">{t('registryTab')}</TabsTrigger>
          {isApprovalEnabled ? (
            <TabsTrigger value="approvals">{t('approvalsTab')}</TabsTrigger>
          ) : null}
          <TabsTrigger value="types">{t('typesTab')}</TabsTrigger>
        </TabsList>
        <TabsContent value="registry">
          <ManagedDocumentsPanel currentUserId={currentUserId} />
        </TabsContent>
        {isApprovalEnabled ? (
          <TabsContent value="approvals">
            <DocumentApprovalQueuePanel />
          </TabsContent>
        ) : null}
        <TabsContent value="types">
          <DocumentTypesPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
