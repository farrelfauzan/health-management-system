'use client';

import { useState } from 'react';
import { Button, Card, CardContent, Icon } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { NotUsedByAssistantNotice } from '#components/client/vault-documents/not-used-by-assistant-notice';
import { VaultDocumentUploadDialog } from '#components/client/vault-documents/vault-document-upload-dialog';
import { VaultDocumentsTable } from '#components/client/vault-documents/vault-documents-table';
import { VaultExportButton } from '#components/client/vault-documents/vault-export-button';
import { EmptyState } from '#components/shared/empty-state';
import { PageHeader } from '#components/shared/page-header';
import { useVaultDocuments } from '#lib/vault-documents/use-vault-documents';

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
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const documentsQuery = useVaultDocuments();
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
        breadcrumbs={[t('header.breadcrumbs.you'), t('header.breadcrumbs.documents')]}
        actions={
          <>
            <VaultExportButton isDisabled={rows.length === 0} onError={handleError} />
            <Button type="button" onClick={() => setIsUploadOpen(true)}>
              <Icon name="upload_file" size={18} />
              {t('header.upload')}
            </Button>
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
          {documentsQuery.isLoading ? (
            <p className="p-6 text-sm text-slate-500">{t('states.loading')}</p>
          ) : documentsQuery.isError ? (
            <p className="p-6 text-sm text-red-700">{t('states.error')}</p>
          ) : rows.length === 0 ? (
            <EmptyState
              icon="folder_open"
              title={t('states.emptyTitle')}
              description={t('states.emptyDescription')}
            />
          ) : (
            <VaultDocumentsTable documents={rows} onResult={handleResult} onError={handleError} />
          )}
        </CardContent>
      </Card>
      <VaultDocumentUploadDialog
        open={isUploadOpen}
        onOpenChange={setIsUploadOpen}
        onUploaded={handleResult}
      />
    </div>
  );
}
