'use client';

import { useState } from 'react';
import type { DocumentIngestStatusValue, DocumentVisibilityValue } from '@hms/shared-types';
import { Button, Card, CardContent } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { BulkSubmitCorpusButton } from '#components/client/clinic-documents/bulk-submit-corpus-button';
import {
  CLINIC_DOCUMENT_FILTER_ALL,
  ClinicDocumentFilters,
} from '#components/client/clinic-documents/clinic-document-filters';
import { ClinicDocumentUploadDialog } from '#components/client/clinic-documents/clinic-document-upload-dialog';
import { ClinicDocumentsTable } from '#components/client/clinic-documents/clinic-documents-table';
import { SubmitCorpusDocumentsDialog } from '#components/client/clinic-documents/submit-corpus-documents-dialog';
import { CursorPagination } from '#components/client/shared/cursor-pagination';
import { InlineNotice } from '#components/client/shared/inline-notice';
import { PageHeader } from '#components/shared/page-header';
import { canSubmitClinicDocument } from '#lib/clinic-documents/can-submit-clinic-document';
import { useClinicDocumentsPage } from '#lib/clinic-documents/use-clinic-documents-page';
import { useShellBreadcrumbRoot } from '#lib/navigation/use-shell-breadcrumb-root';

type IngestStatusFilter = DocumentIngestStatusValue | typeof CLINIC_DOCUMENT_FILTER_ALL;
type VisibilityFilter = DocumentVisibilityValue | typeof CLINIC_DOCUMENT_FILTER_ALL;

type ClinicCorpusPanelProps = {
  /**
   * Who is looking, so the submit dialog can warn about a panel of only
   * themselves before the API refuses it (FR-E5-14).
   */
  currentUserId: string | null;
};

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
 * lives in `useClinicDocuments`, next to the data it depends on. Where the
 * admin is in the list lives one layer up from that, in
 * `useClinicDocumentsPage`.
 */
export function ClinicCorpusPanel({ currentUserId }: ClinicCorpusPanelProps) {
  const t = useTranslations('clinicCorpus');
  const root = useShellBreadcrumbRoot();
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [ingestStatus, setIngestStatus] = useState<IngestStatusFilter>(CLINIC_DOCUMENT_FILTER_ALL);
  const [visibility, setVisibility] = useState<VisibilityFilter>(CLINIC_DOCUMENT_FILTER_ALL);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [isBulkSubmitOpen, setIsBulkSubmitOpen] = useState(false);
  const documentsQuery = useClinicDocumentsPage({
    // Pinned to the FAQ corpus. A `GENERAL` clinic document is stored and
    // never embedded, so listing it here would offer a re-ingest that can
    // only ever be refused.
    purpose: 'FAQ_KNOWLEDGE_BASE',
    ...(ingestStatus === CLINIC_DOCUMENT_FILTER_ALL ? {} : { ingestStatus }),
    ...(visibility === CLINIC_DOCUMENT_FILTER_ALL ? {} : { visibility }),
  });
  const rows = documentsQuery.rows;
  const isPaged = documentsQuery.hasPreviousPage || documentsQuery.hasNextPage;
  // Only the rows still on screen. A selection that survived a filter change
  // or a page turn would submit documents the admin can no longer see.
  const selectedDocumentIds = rows
    .filter((row) => selectedIds.has(row.id) && canSubmitClinicDocument(row.approval))
    .map((row) => row.id);

  function handleResult(message: string): void {
    setError(null);
    setNotice(message);
  }

  /**
   * An upload lands on page one, because the list is newest-first — so that is
   * where the admin is put, rather than left looking at page three wondering
   * where the fifteen files they just chose went.
   */
  function handleUploaded(message: string): void {
    documentsQuery.resetPage();
    handleResult(message);
  }

  /**
   * A narrower list is a different list, and page three of the old one names
   * nothing in it. Both filters send the admin back to its first page.
   */
  function handleIngestStatusChange(next: IngestStatusFilter): void {
    documentsQuery.resetPage();
    setIngestStatus(next);
  }

  function handleVisibilityChange(next: VisibilityFilter): void {
    documentsQuery.resetPage();
    setVisibility(next);
  }

  function handleError(message: string): void {
    setNotice(null);
    setError(message);
  }

  function toggleSelected(documentId: string, isSelected: boolean): void {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (isSelected) {
        next.add(documentId);
      } else {
        next.delete(documentId);
      }
      return next;
    });
  }

  /** Header checkbox: every submittable row on this page, or none of them. */
  function toggleSelectAll(isSelected: boolean): void {
    setSelectedIds(
      isSelected
        ? new Set(rows.filter((row) => canSubmitClinicDocument(row.approval)).map((row) => row.id))
        : new Set(),
    );
  }

  function handleSubmitted(message: string): void {
    setSelectedIds(new Set());
    handleResult(message);
  }

  function handleSubmitFailed(message: string): void {
    setSelectedIds(new Set());
    handleError(message);
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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <ClinicDocumentFilters
          ingestStatus={ingestStatus}
          visibility={visibility}
          onIngestStatusChange={handleIngestStatusChange}
          onVisibilityChange={handleVisibilityChange}
        />
        {/* Only while something is selected: an always-present disabled
            button reads as a control that is broken rather than one that is
            waiting. */}
        {selectedDocumentIds.length === 0 ? null : (
          <BulkSubmitCorpusButton
            count={selectedDocumentIds.length}
            onOpen={() => setIsBulkSubmitOpen(true)}
          />
        )}
      </div>
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
            <>
              <ClinicDocumentsTable
                documents={rows}
                selectedIds={selectedIds}
                currentUserId={currentUserId}
                onSelectedChange={toggleSelected}
                onSelectAllChange={toggleSelectAll}
                onResult={handleResult}
                onError={handleError}
              />
              {isPaged ? (
                <CursorPagination
                  className="border-t border-slate-200 px-4 py-3"
                  pageNumber={documentsQuery.pageNumber}
                  hasPreviousPage={documentsQuery.hasPreviousPage}
                  hasNextPage={documentsQuery.hasNextPage}
                  isDisabled={documentsQuery.isFetching}
                  onPrevious={documentsQuery.goToPreviousPage}
                  onNext={() => void documentsQuery.goToNextPage()}
                />
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
      <ClinicDocumentUploadDialog
        open={isUploadOpen}
        onOpenChange={setIsUploadOpen}
        onUploaded={handleUploaded}
      />
      <SubmitCorpusDocumentsDialog
        open={isBulkSubmitOpen}
        documentIds={selectedDocumentIds}
        currentUserId={currentUserId}
        onOpenChange={setIsBulkSubmitOpen}
        onSubmitted={handleSubmitted}
        onFailed={handleSubmitFailed}
      />
    </div>
  );
}
