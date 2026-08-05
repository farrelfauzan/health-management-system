'use client';

import { useState } from 'react';
import { Button, Card, CardContent } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { NoPatientDataNotice } from '#components/client/personal-documents/no-patient-data-notice';
import { PersonalDocumentUploadDialog } from '#components/client/personal-documents/personal-document-upload-dialog';
import { PersonalDocumentsTable } from '#components/client/personal-documents/personal-documents-table';
import { PageHeader } from '#components/shared/page-header';
import { usePersonalDocuments } from '#lib/personal-documents/use-personal-documents';

/**
 * A doctor's or admin's own knowledge base.
 *
 * Both portals render this same panel: the corpus is per user, not per portal,
 * and the API derives the owner from the session — so there is nothing here to
 * parameterise by role.
 *
 * The list refetches itself while anything is still ingesting; that decision
 * lives in `usePersonalDocuments`, next to the data it depends on.
 */
export function PersonalKnowledgeBasePanel() {
  const t = useTranslations('personalKnowledgeBase');
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const documentsQuery = usePersonalDocuments();
  const rows = documentsQuery.data ?? [];

  function handleResult(message: string): void {
    setError(null);
    setNotice(message);
  }

  function handleError(message: string): void {
    setNotice(null);
    setError(message);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('header.title')}
        subtitle={t('header.subtitle')}
        breadcrumbs={[t('header.breadcrumbs.assistant'), t('header.breadcrumbs.knowledgeBase')]}
        actions={
          <Button type="button" onClick={() => setIsUploadOpen(true)}>
            {t('header.upload')}
          </Button>
        }
      />
      {/* Also on the list, not only in the dialog: someone who uploaded last
          week and is looking at their corpus is exactly who needs reminding
          what may not be in it. */}
      <NoPatientDataNotice />
      {notice ? (
        <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</p>
      ) : null}
      {error ? (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-900">{error}</p>
      ) : null}
      <Card>
        <CardContent className="p-0">
          {documentsQuery.isLoading ? (
            <p className="p-6 text-sm text-slate-500">{t('states.loading')}</p>
          ) : documentsQuery.isError ? (
            <p className="p-6 text-sm text-red-700">{t('states.error')}</p>
          ) : rows.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">{t('states.empty')}</p>
          ) : (
            <PersonalDocumentsTable
              documents={rows}
              onResult={handleResult}
              onError={handleError}
            />
          )}
        </CardContent>
      </Card>
      <PersonalDocumentUploadDialog
        open={isUploadOpen}
        onOpenChange={setIsUploadOpen}
        onUploaded={handleResult}
      />
    </div>
  );
}
