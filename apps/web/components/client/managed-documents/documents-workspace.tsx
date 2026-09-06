'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { DocumentTypesPanel } from '#components/client/document-types/document-types-panel';
import { PageHeader } from '#components/shared/page-header';

/**
 * The documents module's screen (`P16-T39`). One tab today — Types — so the
 * registry (`P16-T31`) and the approval queue land beside it rather than
 * on a screen of their own.
 */
export function DocumentsWorkspace() {
  const t = useTranslations('operations.documents');

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} subtitle={t('subtitle')} breadcrumbs={[t('title')]} />
      <Tabs defaultValue="types" className="space-y-5">
        <TabsList>
          <TabsTrigger value="types">{t('typesTab')}</TabsTrigger>
        </TabsList>
        <TabsContent value="types">
          <DocumentTypesPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
