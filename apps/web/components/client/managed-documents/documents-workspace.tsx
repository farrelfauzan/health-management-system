'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { DocumentTypesPanel } from '#components/client/document-types/document-types-panel';
import { ManagedDocumentsPanel } from '#components/client/managed-documents/managed-documents-panel';
import { PageHeader } from '#components/shared/page-header';

/**
 * The documents module's screen (`P16-T39`/`T36`): the registry first, the
 * type settings beside it. The approval queue lands as a third tab with
 * `P16-T29`, and the full workspace with `P16-T31`.
 */
export function DocumentsWorkspace() {
  const t = useTranslations('operations.documents');

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} subtitle={t('subtitle')} breadcrumbs={[t('title')]} />
      <Tabs defaultValue="registry" className="space-y-5">
        <TabsList>
          <TabsTrigger value="registry">{t('registryTab')}</TabsTrigger>
          <TabsTrigger value="types">{t('typesTab')}</TabsTrigger>
        </TabsList>
        <TabsContent value="registry">
          <ManagedDocumentsPanel />
        </TabsContent>
        <TabsContent value="types">
          <DocumentTypesPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
