'use client';

import { useState, type ReactNode } from 'react';
import { Button, Card, CardContent, Icon, Skeleton, useAbility } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { DocumentsFilters } from '#components/client/patient-documents/documents-filters';
import { DocumentsTable } from '#components/client/patient-documents/documents-table';
import { UploadDocumentDialog } from '#components/client/patient-documents/upload-document-dialog';
import { EmptyState } from '#components/shared/empty-state';
import type { PatientDocumentsFilters } from '#lib/patient-documents/patient-documents-filters';
import { usePatientDocuments } from '#lib/patient-documents/use-patient-documents';

type PatientDocumentsPanelProps = {
  patientId: string;
};

/**
 * The Documents tab on a patient record (`P16-T13`): the patient's clinical
 * file, newest first, with filters that narrow and an upload for anyone who
 * may write to it.
 *
 * There is no inline preview in this version, and the empty state says so:
 * Download is the interaction, minting a short-lived URL per click. A
 * preview would mean either a long-lived URL in the page or the bytes
 * proxied through the API, and the private bucket exists to avoid both.
 */
export function PatientDocumentsPanel({ patientId }: PatientDocumentsPanelProps) {
  const t = useTranslations('clinical.patients.documents');
  const ability = useAbility();
  const canWrite = ability.can('write', 'PatientDocument');
  const [filters, setFilters] = useState<PatientDocumentsFilters>({});
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const documentsQuery = usePatientDocuments(patientId, filters);
  const hasAnyFilter =
    filters.category !== undefined ||
    Boolean(filters.documentDateFrom) ||
    Boolean(filters.documentDateTo);

  function handleResult(message: string): void {
    setError(null);
    setNotice(message);
  }

  function handleError(message: string): void {
    setNotice(null);
    setError(message);
  }

  function renderBody(): ReactNode {
    if (documentsQuery.isPending) {
      return (
        <div className="space-y-3 p-6">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-4/5" />
          <Skeleton className="h-5 w-2/3" />
        </div>
      );
    }
    if (documentsQuery.isError) {
      return <p className="p-6 text-sm text-red-700">{t('loadError')}</p>;
    }
    if (documentsQuery.documents.length === 0) {
      return (
        <EmptyState
          icon="folder_open"
          title={hasAnyFilter ? t('emptyFiltered') : t('emptyTitle')}
          description={hasAnyFilter ? undefined : t('emptyDescription')}
          className="border-0"
        />
      );
    }
    return (
      <>
        <DocumentsTable
          patientId={patientId}
          documents={documentsQuery.documents}
          onResult={handleResult}
          onError={handleError}
        />
        {documentsQuery.hasNextPage ? (
          <div className="flex justify-center border-t border-slate-200 p-4">
            <Button
              type="button"
              variant="outline"
              disabled={documentsQuery.isFetchingNextPage}
              onClick={() => void documentsQuery.fetchNextPage()}
            >
              {documentsQuery.isFetchingNextPage ? t('loadingMore') : t('loadMore')}
            </Button>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-heading text-lg font-semibold text-slate-900">{t('title')}</h2>
          <p className="text-sm text-slate-500">{t('subtitle')}</p>
        </div>
        {canWrite ? (
          <Button type="button" onClick={() => setIsUploadOpen(true)}>
            <Icon name="upload_file" size={18} />
            {t('upload')}
          </Button>
        ) : null}
      </div>
      <DocumentsFilters filters={filters} onFiltersChange={setFilters} />
      {notice ? (
        <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</p>
      ) : null}
      {error ? (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-900">{error}</p>
      ) : null}
      <Card className="rounded-xl border-slate-200 py-0 shadow-none">
        <CardContent className="p-0">{renderBody()}</CardContent>
      </Card>
      {isUploadOpen ? (
        <UploadDocumentDialog
          open={isUploadOpen}
          onOpenChange={setIsUploadOpen}
          patientId={patientId}
          onUploaded={handleResult}
        />
      ) : null}
    </div>
  );
}
