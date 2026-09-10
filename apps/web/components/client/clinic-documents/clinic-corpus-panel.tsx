'use client';

import { useState } from 'react';
import type { DocumentIngestStatusValue, DocumentVisibilityValue } from '@hms/shared-types';
import { Button, Card, CardContent } from '@hms/ui';
import { useTranslations } from 'next-intl';

import {
  CLINIC_DOCUMENT_FILTER_ALL,
  ClinicDocumentFilters,
} from '#components/client/clinic-documents/clinic-document-filters';
import { ClinicDocumentUploadDialog } from '#components/client/clinic-documents/clinic-document-upload-dialog';
import { ClinicDocumentsTable } from '#components/client/clinic-documents/clinic-documents-table';
import { InlineNotice } from '#components/client/shared/inline-notice';
import { PageHeader } from '#components/shared/page-header';
import { useClinicDocuments } from '#lib/clinic-documents/use-clinic-documents';
import { useShellBreadcrumbRoot } from '#lib/navigation/use-shell-breadcrumb-root';

type IngestStatusFilter = DocumentIngestStatusValue | typeof CLINIC_DOCUMENT_FILTER_ALL;
type VisibilityFilter = DocumentVisibilityValue | typeof CLINIC_DOCUMENT_FILTER_ALL;

/**
 * The shared clinic corpus: the FAQ and SOP documents the in-app assistant
 * answers from today and the WhatsApp/Telegram channel will answer from at
 * `PCS-T05`.
 *
 * Distinct from the knowledge-base screen next to it in the nav, and the
 * distinction is the point: that one is the signed-in user's private corpus,
 * this one is shared and patient-reachable. They are separate routes rather
 * than one screen with a toggle because a toggle is a thing you can be wrong
 * about — uploading an internal SOP into a patient-facing corpus by leaving a
 * switch where the last person left it is exactly the mistake worth making
 * structurally impossible.
 *
 * The list refetches itself while anything is still ingesting; that decision
 * lives in `useClinicDocuments`, next to the data it depends on.
 */
export function ClinicCorpusPanel() {
  const t = useTranslations('clinicCorpus');
  const root = useShellBreadcrumbRoot();
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [ingestStatus, setIngestStatus] = useState<IngestStatusFilter>(CLINIC_DOCUMENT_FILTER_ALL);
  const [visibility, setVisibility] = useState<VisibilityFilter>(CLINIC_DOCUMENT_FILTER_ALL);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const documentsQuery = useClinicDocuments({
    // Pinned to the FAQ corpus. A `GENERAL` clinic document is stored and
    // never embedded, so listing it here would offer a re-ingest that can
    // only ever be refused.
    purpose: 'FAQ_KNOWLEDGE_BASE',
    ...(ingestStatus === CLINIC_DOCUMENT_FILTER_ALL ? {} : { ingestStatus }),
    ...(visibility === CLINIC_DOCUMENT_FILTER_ALL ? {} : { visibility }),
  });
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
        breadcrumbs={[root, { label: t('header.breadcrumbs.clinicCorpus') }]}
        actions={
          <Button type="button" onClick={() => setIsUploadOpen(true)}>
            {t('header.upload')}
          </Button>
        }
      />
      <ClinicDocumentFilters
        ingestStatus={ingestStatus}
        visibility={visibility}
        onIngestStatusChange={setIngestStatus}
        onVisibilityChange={setVisibility}
      />
      {notice ? <InlineNotice tone="success">{notice}</InlineNotice> : null}
      {error ? <InlineNotice tone="error">{error}</InlineNotice> : null}
      <Card>
        <CardContent className="p-0">
          {documentsQuery.isLoading ? (
            <p className="p-6 text-sm text-slate-500">{t('states.loading')}</p>
          ) : documentsQuery.isError ? (
            <InlineNotice tone="error" className="m-6">
              {t('states.error')}
            </InlineNotice>
          ) : rows.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">{t('states.empty')}</p>
          ) : (
            <ClinicDocumentsTable documents={rows} onResult={handleResult} onError={handleError} />
          )}
        </CardContent>
      </Card>
      <ClinicDocumentUploadDialog
        open={isUploadOpen}
        onOpenChange={setIsUploadOpen}
        onUploaded={handleResult}
      />
    </div>
  );
}
