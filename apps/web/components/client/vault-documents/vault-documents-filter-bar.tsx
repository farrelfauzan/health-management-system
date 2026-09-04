'use client';

import { VAULT_DOCUMENT_CATEGORIES, type VaultDocumentCategoryValue } from '@hms/shared-types';
import {
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@hms/ui';
import { useTranslations } from 'next-intl';

import type { VaultDocumentsFilters } from '#lib/vault-documents/use-vault-documents';

const ALL_CATEGORIES_VALUE = 'ALL';

type VaultDocumentsFilterBarProps = {
  filters: VaultDocumentsFilters;
  onChange: (filters: VaultDocumentsFilters) => void;
};

/**
 * Narrows the owner's own list by title or reference number, and by drawer.
 *
 * Plain controlled fields: the debounce and the request live in the hook, so
 * this component has nothing to time and nothing to fetch.
 */
export function VaultDocumentsFilterBar({ filters, onChange }: VaultDocumentsFilterBarProps) {
  const t = useTranslations('vault');

  return (
    <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 p-4">
      <div className="w-full sm:w-72">
        <Label htmlFor="vault-search" className="mb-1.5 block text-xs font-medium text-slate-600">
          {t('filters.search')}
        </Label>
        <Input
          id="vault-search"
          type="search"
          placeholder={t('filters.searchPlaceholder')}
          value={filters.search ?? ''}
          onChange={(event) =>
            onChange({
              ...filters,
              search: event.target.value === '' ? undefined : event.target.value,
            })
          }
        />
      </div>
      <div className="w-full sm:w-56">
        <Label
          htmlFor="vault-category-filter"
          className="mb-1.5 block text-xs font-medium text-slate-600"
        >
          {t('filters.category')}
        </Label>
        <Select
          value={filters.vaultCategory ?? ALL_CATEGORIES_VALUE}
          onValueChange={(next) =>
            onChange({
              ...filters,
              vaultCategory:
                next === ALL_CATEGORIES_VALUE ? undefined : (next as VaultDocumentCategoryValue),
            })
          }
        >
          <SelectTrigger id="vault-category-filter" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_CATEGORIES_VALUE}>{t('filters.allCategories')}</SelectItem>
            {VAULT_DOCUMENT_CATEGORIES.map((category) => (
              <SelectItem key={category} value={category}>
                {t(`categories.${category}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
