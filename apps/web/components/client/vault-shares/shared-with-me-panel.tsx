'use client';

import { useState } from 'react';
import { Card, CardContent, TableBody, TableHeader, TableRow } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { SharedWithMeRow } from '#components/client/vault-shares/shared-with-me-row';
import { DataTable } from '#components/shared/data-table';
import { DataTableHeaderCell } from '#components/shared/data-table-header-cell';
import { EmptyState } from '#components/shared/empty-state';
import { useSharedWithMe } from '#lib/vault-shares/use-shared-with-me';

/**
 * Documents other people have shared with this person (FR-E3-17).
 *
 * **Not a view onto anyone's vault.** It contains the individual documents
 * handed to the viewer and shows nothing about what else those vaults hold.
 * A share that has been revoked, has passed its expiry, or belongs to a
 * deactivated account simply drops out with no action from its owner — the
 * live test runs per request and nothing is cached.
 *
 * An empty list is a normal state, not an error, and the copy says so: most
 * people will have nothing here most of the time, and a screen that read like
 * a failure would send them looking for a problem.
 */
export function SharedWithMePanel() {
  const t = useTranslations('vault.sharedWithMe');
  const [error, setError] = useState<string | null>(null);
  const sharedQuery = useSharedWithMe();

  return (
    <div className="space-y-3">
      <div>
        <h2 className="font-heading text-lg font-semibold text-slate-900">{t('title')}</h2>
        <p className="text-sm text-slate-500">{t('subtitle')}</p>
      </div>
      {error ? (
        <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-900">{error}</p>
      ) : null}
      <Card className="gap-0 rounded-xl border-slate-200 py-0 shadow-none">
        <CardContent className="p-0">
          {sharedQuery.isLoading ? (
            <p className="p-6 text-sm text-slate-500">{t('states.loading')}</p>
          ) : sharedQuery.isError ? (
            <p className="p-6 text-sm text-red-700">{t('states.error')}</p>
          ) : sharedQuery.documents.length === 0 ? (
            <EmptyState
              icon="folder_shared"
              title={t('states.emptyTitle')}
              description={t('states.emptyDescription')}
            />
          ) : (
            <DataTable>
              <TableHeader>
                <TableRow>
                  <DataTableHeaderCell>{t('columns.document')}</DataTableHeaderCell>
                  <DataTableHeaderCell>{t('columns.sharedBy')}</DataTableHeaderCell>
                  <DataTableHeaderCell>{t('columns.sharedAt')}</DataTableHeaderCell>
                  <DataTableHeaderCell>{t('columns.expiresAt')}</DataTableHeaderCell>
                  <DataTableHeaderCell>{t('columns.size')}</DataTableHeaderCell>
                  <DataTableHeaderCell className="text-right">
                    {t('columns.actions')}
                  </DataTableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sharedQuery.documents.map((document) => (
                  <SharedWithMeRow key={document.id} document={document} onError={setError} />
                ))}
              </TableBody>
            </DataTable>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
