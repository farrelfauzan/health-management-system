'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@hms/ui';

import { SpecialtyCombobox } from '#components/client/doctors/specialty-combobox';
import { FilterCard } from '#components/shared/filter-card';
import type { DoctorsSearchParams } from '#lib/doctors/search-params';
import { useSpecialtiesList } from '#lib/specialties/use-specialties-list';

const ALL_STATUSES_VALUE = 'ALL';

export type DoctorsFilterValues = {
  search?: string;
  specialtyId?: string;
  isActive?: 'true' | 'false';
};

type DoctorsFilterCardProps = {
  initialQuery: DoctorsSearchParams;
  onApply: (filters: DoctorsFilterValues) => void;
  onReset: () => void;
};

export function DoctorsFilterCard({ initialQuery, onApply, onReset }: DoctorsFilterCardProps) {
  const t = useTranslations('clinical');
  const [search, setSearch] = useState<string>(initialQuery.search ?? '');
  const [specialtyId, setSpecialtyId] = useState<string>(initialQuery.specialtyId ?? '');
  const [status, setStatus] = useState<string>(initialQuery.isActive ?? ALL_STATUSES_VALUE);
  const specialtiesQuery = useSpecialtiesList();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    event.stopPropagation();
    const trimmedSearch = search.trim();
    onApply({
      search: trimmedSearch.length > 0 ? trimmedSearch : undefined,
      specialtyId: specialtyId.length > 0 ? specialtyId : undefined,
      isActive: status === ALL_STATUSES_VALUE ? undefined : (status as 'true' | 'false'),
    });
  }

  function handleReset(): void {
    setSearch('');
    setSpecialtyId('');
    setStatus(ALL_STATUSES_VALUE);
    onReset();
  }

  return (
    <form noValidate onSubmit={handleSubmit}>
      <FilterCard
        actions={
          <>
            <Button type="submit" size="sm" className="bg-primary-container hover:bg-primary">
              {t('common.apply')}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={handleReset}>
              {t('common.reset')}
            </Button>
          </>
        }
      >
        <div className="w-full sm:w-56">
          <label
            htmlFor="doctors-quick-filter"
            className="mb-1.5 block font-heading text-xs font-medium text-slate-600"
          >
            {t('doctors.quickFilter')}
          </label>
          <Input
            id="doctors-quick-filter"
            placeholder={t('doctors.searchPlaceholder')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="w-52">
          <label
            htmlFor="doctors-specialty-filter"
            className="mb-1.5 block font-heading text-xs font-medium text-slate-600"
          >
            {t('doctors.specialty')}
          </label>
          <SpecialtyCombobox
            id="doctors-specialty-filter"
            specialties={specialtiesQuery.specialties}
            value={specialtyId}
            isLoading={specialtiesQuery.isPending}
            emptyOptionLabel={t('doctors.allSpecialties')}
            onChange={setSpecialtyId}
          />
        </div>
        <div className="w-40">
          <label
            htmlFor="doctors-status-filter"
            className="mb-1.5 block font-heading text-xs font-medium text-slate-600"
          >
            {t('common.status')}
          </label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger id="doctors-status-filter" className="w-full">
              <SelectValue placeholder={t('common.allStatuses')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_STATUSES_VALUE}>{t('common.allStatuses')}</SelectItem>
              <SelectItem value="true">{t('common.active')}</SelectItem>
              <SelectItem value="false">{t('common.inactive')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </FilterCard>
    </form>
  );
}
