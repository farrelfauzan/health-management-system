'use client';

import { DOCUMENT_CATEGORIES, type DocumentCategoryValue } from '@hms/shared-types';
import {
  Button,
  DatePicker,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import type { PatientDocumentsFilters } from '#lib/patient-documents/patient-documents-filters';

type DocumentsFiltersProps = {
  filters: PatientDocumentsFilters;
  onFiltersChange: (filters: PatientDocumentsFilters) => void;
};

/** The sentinel for "every category", since a Select cannot hold `undefined`. */
const CATEGORY_ALL = 'ALL';

/**
 * Category and document-date range. These narrow only: the patient is fixed
 * by the route, and each control combines with the others rather than
 * replacing them, so a clinician can ask for "lab results from this March"
 * in two moves. Clear resets all three at once.
 */
export function DocumentsFilters({ filters, onFiltersChange }: DocumentsFiltersProps) {
  const t = useTranslations('clinical.patients.documents.filters');
  const tCategories = useTranslations('clinical.patients.documents.categories');
  const hasAnyFilter =
    filters.category !== undefined ||
    Boolean(filters.documentDateFrom) ||
    Boolean(filters.documentDateTo);

  function handleCategoryChange(value: string): void {
    onFiltersChange({
      ...filters,
      category: value === CATEGORY_ALL ? undefined : (value as DocumentCategoryValue),
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="space-y-2">
        <Label htmlFor="patient-documents-filter-category">{t('category')}</Label>
        <Select value={filters.category ?? CATEGORY_ALL} onValueChange={handleCategoryChange}>
          <SelectTrigger id="patient-documents-filter-category" className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={CATEGORY_ALL}>{t('allCategories')}</SelectItem>
            {DOCUMENT_CATEGORIES.map((value) => (
              <SelectItem key={value} value={value}>
                {tCategories(value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="patient-documents-filter-from">{t('dateFrom')}</Label>
        <DatePicker
          id="patient-documents-filter-from"
          value={filters.documentDateFrom ?? ''}
          onValueChange={(value) =>
            onFiltersChange({ ...filters, documentDateFrom: value || undefined })
          }
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="patient-documents-filter-to">{t('dateTo')}</Label>
        <DatePicker
          id="patient-documents-filter-to"
          value={filters.documentDateTo ?? ''}
          minValue={filters.documentDateFrom}
          onValueChange={(value) =>
            onFiltersChange({ ...filters, documentDateTo: value || undefined })
          }
        />
      </div>
      <Button
        type="button"
        variant="ghost"
        disabled={!hasAnyFilter}
        onClick={() => onFiltersChange({})}
      >
        {t('clear')}
      </Button>
    </div>
  );
}
