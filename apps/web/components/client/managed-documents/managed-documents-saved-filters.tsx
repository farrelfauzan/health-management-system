'use client';

import { Button, cn } from '@hms/ui';
import { useTranslations } from 'next-intl';

import type { ManagedDocumentFilters } from '#lib/managed-documents/managed-document-filters';
import { EMPTY_MANAGED_DOCUMENT_FILTERS } from '#lib/managed-documents/managed-document-filters';

type SavedFilterKey = 'all' | 'awaitingMe' | 'myDrafts' | 'issued';

type ManagedDocumentsSavedFiltersProps = {
  active: SavedFilterKey;
  currentUserId: string | null;
  onSelect: (key: SavedFilterKey, filters: ManagedDocumentFilters) => void;
};

/**
 * The saved views (`P16-T31`, FR-E5-06). "Awaiting my approval" is one click
 * from the sidebar because that is the question the module is opened to
 * answer (US-E5-02) — a chip rather than a hunt through the filter bar.
 *
 * Every chip resolves to ordinary query parameters, so a saved view can never
 * see anything the plain list would not: the per-row source rule still runs
 * on the API for each of them (FR-E5-04).
 */
export function ManagedDocumentsSavedFilters({
  active,
  currentUserId,
  onSelect,
}: ManagedDocumentsSavedFiltersProps) {
  const t = useTranslations('operations.documents.registry.savedFilters');
  const chips: Array<{ key: SavedFilterKey; label: string; filters: ManagedDocumentFilters }> = [
    { key: 'all', label: t('all'), filters: EMPTY_MANAGED_DOCUMENT_FILTERS },
    {
      key: 'awaitingMe',
      label: t('awaitingMe'),
      filters: { ...EMPTY_MANAGED_DOCUMENT_FILTERS, approver: currentUserId },
    },
    {
      key: 'myDrafts',
      label: t('myDrafts'),
      filters: { ...EMPTY_MANAGED_DOCUMENT_FILTERS, draftedBy: currentUserId, status: 'DRAFT' },
    },
    {
      key: 'issued',
      label: t('issued'),
      filters: { ...EMPTY_MANAGED_DOCUMENT_FILTERS, status: 'ISSUED', dateField: 'issued' },
    },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <Button
          key={chip.key}
          type="button"
          size="sm"
          variant={active === chip.key ? 'default' : 'outline'}
          // A chip that needs to know who "me" is cannot work without a
          // session id; disabling beats a chip that silently lists everything.
          disabled={
            currentUserId === null && (chip.key === 'awaitingMe' || chip.key === 'myDrafts')
          }
          className={cn('rounded-full')}
          onClick={() => onSelect(chip.key, chip.filters)}
        >
          {chip.label}
        </Button>
      ))}
    </div>
  );
}
