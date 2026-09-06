'use client';

import { useState } from 'react';
import { Button, Card, CardContent, Icon, toast, useAbility } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { ExportManagedDocumentsButton } from '#components/client/managed-documents/export-managed-documents-button';
import { ManagedDocumentsFilterBar } from '#components/client/managed-documents/managed-documents-filter-bar';
import { ManagedDocumentsSavedFilters } from '#components/client/managed-documents/managed-documents-saved-filters';
import { ManagedDocumentsTable } from '#components/client/managed-documents/managed-documents-table';
import { NewManagedDocumentDialog } from '#components/client/managed-documents/new-managed-document-dialog';
import { useDebouncedValue } from '#hooks/use-debounced-value';
import {
  EMPTY_MANAGED_DOCUMENT_FILTERS,
  hasActiveManagedDocumentFilters,
  toManagedDocumentQueryParams,
  type ManagedDocumentFilters,
} from '#lib/managed-documents/managed-document-filters';
import { useManagedDocuments } from '#lib/managed-documents/use-managed-documents';

const SEARCH_DEBOUNCE_MS = 300;
const PAGE_LIMIT = 50;

type ManagedDocumentsPanelProps = {
  currentUserId: string | null;
};

/**
 * The registry (`P16-T31`, FR-E5-01…03/06/07): saved views, filters, search,
 * the list with parties and the overdue flag on every row, and the CSV
 * export of exactly what is on screen.
 *
 * `canWrite` decides only whether the New button renders; the API refuses
 * every write regardless, and the rows themselves are filtered by the
 * per-row source rule server-side — the client never removes a row the API
 * chose to return (FR-E5-04).
 */
export function ManagedDocumentsPanel({ currentUserId }: ManagedDocumentsPanelProps) {
  const t = useTranslations('operations.documents.registry');
  const ability = useAbility();
  const canWrite = ability.can('write', 'ManagedDocument');
  const [filters, setFilters] = useState<ManagedDocumentFilters>(EMPTY_MANAGED_DOCUMENT_FILTERS);
  const [savedFilter, setSavedFilter] = useState<'all' | 'awaitingMe' | 'myDrafts' | 'issued'>(
    'all',
  );
  const [isNewOpen, setIsNewOpen] = useState<boolean>(false);
  const debouncedSearch = useDebouncedValue(filters.search.trim(), SEARCH_DEBOUNCE_MS);
  const documentsQuery = useManagedDocuments({
    page: 1,
    limit: PAGE_LIMIT,
    ...toManagedDocumentQueryParams({ ...filters, search: debouncedSearch }),
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-sm text-slate-500">{t('description')}</p>
        <div className="flex flex-wrap items-center gap-2">
          <ExportManagedDocumentsButton filters={{ ...filters, search: debouncedSearch }} />
          {canWrite ? (
            <Button
              type="button"
              size="sm"
              className="bg-primary-container hover:bg-primary"
              onClick={() => setIsNewOpen(true)}
            >
              <Icon name="add" size={18} />
              {t('new')}
            </Button>
          ) : null}
        </div>
      </div>
      <ManagedDocumentsSavedFilters
        active={savedFilter}
        currentUserId={currentUserId}
        onSelect={(key, nextFilters) => {
          setSavedFilter(key);
          setFilters(nextFilters);
        }}
      />
      <ManagedDocumentsFilterBar
        filters={filters}
        onChange={(nextFilters) => {
          setSavedFilter('all');
          setFilters(nextFilters);
        }}
      />
      {documentsQuery.data ? (
        <p className="text-xs text-slate-500">{t('total', { count: documentsQuery.total })}</p>
      ) : null}
      <Card className="gap-0 rounded-xl border-slate-200 py-0 shadow-none">
        <CardContent className="p-0">
          <ManagedDocumentsTable
            documents={documentsQuery.documents}
            isPending={documentsQuery.isPending}
            isError={documentsQuery.isError}
            isFiltered={hasActiveManagedDocumentFilters({ ...filters, search: debouncedSearch })}
            onError={(message) => toast.error(message)}
          />
        </CardContent>
      </Card>
      {isNewOpen ? (
        <NewManagedDocumentDialog
          open={isNewOpen}
          onOpenChange={setIsNewOpen}
          onCreated={(message) => toast.success(message)}
        />
      ) : null}
    </div>
  );
}
