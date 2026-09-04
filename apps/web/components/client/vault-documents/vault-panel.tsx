'use client';

import { useState } from 'react';
import { Button, Card, CardContent, Icon, useAbility } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { NotUsedByAssistantNotice } from '#components/client/vault-documents/not-used-by-assistant-notice';
import { VaultDocumentUploadDialog } from '#components/client/vault-documents/vault-document-upload-dialog';
import { VaultDocumentsFilterBar } from '#components/client/vault-documents/vault-documents-filter-bar';
import { VaultDocumentsTable } from '#components/client/vault-documents/vault-documents-table';
import { VaultExportButton } from '#components/client/vault-documents/vault-export-button';
import { CursorPagination } from '#components/client/shared/cursor-pagination';
import { SharedWithMePanel } from '#components/client/vault-shares/shared-with-me-panel';
import { EmptyState } from '#components/shared/empty-state';
import { PageHeader } from '#components/shared/page-header';
import type { VaultDocumentsFilters } from '#lib/vault-documents/use-vault-documents';
import { useVaultDocumentsPage } from '#lib/vault-documents/use-vault-documents-page';

/**
 * A doctor's or an admin's own document vault (`P16-T18`, US-E3-01/03/04).
 *
 * Both portals render this same panel: a vault is per person, not per portal,
 * and the API derives the owner from the session — so there is nothing here
 * to parameterise by role. An administrator gets a vault on the same terms as
 * a doctor, because an admin is also a person with a contract and a KTP, and
 * it grants them nothing over anyone else's.
 *
 * A **separate route** from the knowledge base, never merged (FR-E3-06). The
 * two hold the same file types and share a database table, and the difference
 * between them is the difference between a corpus whose passages are sent to
 * an AI provider and a drawer nothing reads but its owner. A single page with
 * a toggle would put that distinction one mis-click away.
 */
export function VaultPanel() {
  const t = useTranslations('vault');
  const ability = useAbility();
  // Visibility only, and scope-blind: this decides whether the button
  // renders, the API decides whether an upload is accepted. An offboarded
  // person's session carries read and delete and no write (P16-T41), so
  // their vault shows export and delete and nothing that files anything new.
  const canUpload = ability.can('write', 'VaultDocument');
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<VaultDocumentsFilters>({});
  const documentsQuery = useVaultDocumentsPage(filters);
  const rows = documentsQuery.rows;
  const hasFilters = filters.search !== undefined || filters.vaultCategory !== undefined;
  const isPaged = documentsQuery.hasPreviousPage || documentsQuery.hasNextPage;

  function handleResult(message: string): void {
    setError(null);
    setNotice(message);
  }

  function handleError(message: string): void {
    setNotice(null);
    setError(message);
  }

  function handleFiltersChange(nextFilters: VaultDocumentsFilters): void {
    setFilters(nextFilters);
    documentsQuery.resetPage();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('header.title')}
        subtitle={t('header.subtitle')}
        breadcrumbs={[t('header.breadcrumbs.you'), t('header.breadcrumbs.documents')]}
        actions={
          <>
            {/* Disabled only when the vault itself is empty — a filter that
                matches nothing says nothing about what there is to export. */}
            <VaultExportButton
              isDisabled={rows.length === 0 && !hasFilters}
              onError={handleError}
            />
            {canUpload ? (
              <Button type="button" onClick={() => setIsUploadOpen(true)}>
                <Icon name="upload_file" size={18} />
                {t('header.upload')}
              </Button>
            ) : null}
          </>
        }
      />
      {/* On the list as well as in the dialog: someone who uploaded last month
          and is looking at their documents is exactly who benefits from being
          reminded who can and cannot read them. */}
      <NotUsedByAssistantNotice />
      {notice ? (
        <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</p>
      ) : null}
      {error ? (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-900">{error}</p>
      ) : null}
      <Card className="gap-0 rounded-xl border-slate-200 py-0 shadow-none">
        <CardContent className="p-0">
          <VaultDocumentsFilterBar filters={filters} onChange={handleFiltersChange} />
          {documentsQuery.isLoading ? (
            <p className="p-6 text-sm text-slate-500">{t('states.loading')}</p>
          ) : documentsQuery.isError ? (
            <p className="p-6 text-sm text-red-700">{t('states.error')}</p>
          ) : rows.length === 0 && hasFilters ? (
            <EmptyState
              icon="search_off"
              title={t('states.noMatchesTitle')}
              description={t('states.noMatchesDescription')}
              className="rounded-t-none border-0"
            />
          ) : rows.length === 0 ? (
            <EmptyState
              icon="folder_open"
              title={t('states.emptyTitle')}
              description={t('states.emptyDescription')}
              className="rounded-t-none border-0"
            />
          ) : (
            <>
              <VaultDocumentsTable documents={rows} onResult={handleResult} onError={handleError} />
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
      {/* Below the owner's own documents, and visually a separate section.
          What was handed to you is not part of your vault: it is a set of
          keys other people made, each of which can stop working without you
          doing anything (FR-E3-17). */}
      <SharedWithMePanel />
      <VaultDocumentUploadDialog
        open={isUploadOpen}
        onOpenChange={setIsUploadOpen}
        onUploaded={handleResult}
      />
    </div>
  );
}
