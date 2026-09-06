'use client';

import { useState } from 'react';
import { Button, Card, CardContent, Icon, Input, Label, toast, useAbility } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { ManagedDocumentsTable } from '#components/client/managed-documents/managed-documents-table';
import { NewManagedDocumentDialog } from '#components/client/managed-documents/new-managed-document-dialog';
import { useDebouncedValue } from '#hooks/use-debounced-value';
import { useManagedDocuments } from '#lib/managed-documents/use-managed-documents';

const SEARCH_DEBOUNCE_MS = 300;
const PAGE_LIMIT = 50;

/**
 * The registry tab (`P16-T36`; the full workspace is `P16-T31`): search,
 * the list with parties on every row, and the new-document dialog whose
 * form is built from the chosen type's flags. `canWrite` decides only
 * whether the button renders; the API refuses every write regardless.
 */
export function ManagedDocumentsPanel() {
  const t = useTranslations('operations.documents.registry');
  const ability = useAbility();
  const canWrite = ability.can('write', 'ManagedDocument');
  const [search, setSearch] = useState<string>('');
  const [isNewOpen, setIsNewOpen] = useState<boolean>(false);
  const debouncedSearch = useDebouncedValue(search.trim(), SEARCH_DEBOUNCE_MS);
  const documentsQuery = useManagedDocuments({
    page: 1,
    limit: PAGE_LIMIT,
    ...(debouncedSearch === '' ? {} : { q: debouncedSearch }),
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <p className="text-sm text-slate-500">{t('description')}</p>
          <div className="flex items-center gap-2">
            <Label htmlFor="managed-documents-search" className="sr-only">
              {t('search')}
            </Label>
            <Input
              id="managed-documents-search"
              value={search}
              placeholder={t('searchPlaceholder')}
              className="w-72"
              onChange={(event) => setSearch(event.target.value)}
            />
            {documentsQuery.data ? (
              <span className="text-xs text-slate-500">
                {t('total', { count: documentsQuery.total })}
              </span>
            ) : null}
          </div>
        </div>
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
      <Card className="gap-0 rounded-xl border-slate-200 py-0 shadow-none">
        <CardContent className="p-0">
          <ManagedDocumentsTable
            documents={documentsQuery.documents}
            isPending={documentsQuery.isPending}
            isError={documentsQuery.isError}
            isFiltered={debouncedSearch !== ''}
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
