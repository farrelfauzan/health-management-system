'use client';

import { MANAGED_DOCUMENT_STATUSES, type ManagedDocumentStatusValue } from '@hms/shared-types';
import { Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@hms/ui';
import { useTranslations } from 'next-intl';

import type { ManagedDocumentFilters } from '#lib/managed-documents/managed-document-filters';
import { useDocumentTypes } from '#lib/document-types/use-document-types';

const ANY_VALUE = '__any__';

type ManagedDocumentsFilterBarProps = {
  filters: ManagedDocumentFilters;
  onChange: (filters: ManagedDocumentFilters) => void;
};

/**
 * The registry's filters (`P16-T31`, FR-E5-02): type, status and a date
 * range on created or issued, beside the search box.
 *
 * Drafter and approver are filtered through the saved-filter chips rather
 * than a free picker here — "awaiting my approval" is the question people
 * actually ask (US-E5-02), and a second staff combobox in the filter bar
 * would bury it.
 */
export function ManagedDocumentsFilterBar({ filters, onChange }: ManagedDocumentsFilterBarProps) {
  const t = useTranslations('operations.documents.registry.filters');
  const registry = useTranslations('operations.documents.registry');
  const typesQuery = useDocumentTypes();

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <Label htmlFor="managed-documents-search">{registry('search')}</Label>
        <Input
          id="managed-documents-search"
          value={filters.search}
          placeholder={registry('searchPlaceholder')}
          className="w-72"
          onChange={(event) => onChange({ ...filters, search: event.target.value })}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="managed-documents-type">{t('type')}</Label>
        <Select
          value={filters.typeId ?? ANY_VALUE}
          onValueChange={(value) =>
            onChange({ ...filters, typeId: value === ANY_VALUE ? null : value })
          }
        >
          <SelectTrigger id="managed-documents-type" className="w-52">
            <SelectValue placeholder={t('anyType')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY_VALUE}>{t('anyType')}</SelectItem>
            {typesQuery.types.map((type) => (
              <SelectItem key={type.id} value={type.id}>
                {type.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="managed-documents-status">{t('status')}</Label>
        <Select
          value={filters.status ?? ANY_VALUE}
          onValueChange={(value) =>
            onChange({
              ...filters,
              status: value === ANY_VALUE ? null : (value as ManagedDocumentStatusValue),
            })
          }
        >
          <SelectTrigger id="managed-documents-status" className="w-48">
            <SelectValue placeholder={t('anyStatus')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY_VALUE}>{t('anyStatus')}</SelectItem>
            {MANAGED_DOCUMENT_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {registry(`statuses.${status}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="managed-documents-date-field">{t('dateField')}</Label>
        <Select
          value={filters.dateField}
          onValueChange={(value) =>
            onChange({ ...filters, dateField: value === 'issued' ? 'issued' : 'created' })
          }
        >
          <SelectTrigger id="managed-documents-date-field" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="created">{t('dateFields.created')}</SelectItem>
            <SelectItem value="issued">{t('dateFields.issued')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="managed-documents-from">{t('from')}</Label>
        <Input
          id="managed-documents-from"
          type="date"
          value={filters.from ?? ''}
          className="w-40"
          onChange={(event) =>
            onChange({ ...filters, from: event.target.value === '' ? null : event.target.value })
          }
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="managed-documents-to">{t('to')}</Label>
        <Input
          id="managed-documents-to"
          type="date"
          value={filters.to ?? ''}
          className="w-40"
          onChange={(event) =>
            onChange({ ...filters, to: event.target.value === '' ? null : event.target.value })
          }
        />
      </div>
    </div>
  );
}
