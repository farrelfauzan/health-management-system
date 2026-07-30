'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ENCOUNTER_STATUSES, type EncounterStatusValue } from '@hms/shared-types';
import {
  Button,
  DatePicker,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@hms/ui';

import { DoctorCombobox } from '#components/client/doctors/doctor-combobox';
import { FilterCard } from '#components/shared/filter-card';
import { useDoctorsList } from '#lib/doctors/use-doctors-list';
import type { EncountersSearchParams } from '#lib/encounters/search-params';

const ALL_STATUSES_VALUE = 'ALL';
const DOCTOR_PICKER_QUERY = { page: 1, limit: 100, isActive: 'true' as const };

export type EncountersFilterValues = {
  status?: EncounterStatusValue;
  doctorId?: string;
  startedFrom?: string;
  startedTo?: string;
};

type EncountersFilterCardProps = {
  initialQuery: EncountersSearchParams;
  onApply: (filters: EncountersFilterValues) => void;
  onReset: () => void;
};

export function EncountersFilterCard({
  initialQuery,
  onApply,
  onReset,
}: EncountersFilterCardProps) {
  const t = useTranslations('clinical');
  const [status, setStatus] = useState<string>(initialQuery.status ?? ALL_STATUSES_VALUE);
  const [doctorId, setDoctorId] = useState<string>(initialQuery.doctorId ?? '');
  const [startedFrom, setStartedFrom] = useState<string>(initialQuery.startedFrom ?? '');
  const [startedTo, setStartedTo] = useState<string>(initialQuery.startedTo ?? '');
  const doctorsQuery = useDoctorsList(DOCTOR_PICKER_QUERY);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    event.stopPropagation();
    onApply({
      status: status === ALL_STATUSES_VALUE ? undefined : (status as EncounterStatusValue),
      doctorId: doctorId.length > 0 ? doctorId : undefined,
      startedFrom: startedFrom.length > 0 ? startedFrom : undefined,
      startedTo: startedTo.length > 0 ? startedTo : undefined,
    });
  }

  function handleReset(): void {
    setStatus(ALL_STATUSES_VALUE);
    setDoctorId('');
    setStartedFrom('');
    setStartedTo('');
    onReset();
  }

  function handleStartedFromChange(value: string): void {
    setStartedFrom(value);
    if (startedTo.length > 0 && (value.length === 0 || startedTo < value)) {
      setStartedTo('');
    }
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
        <div className="w-44">
          <label
            htmlFor="encounters-status-filter"
            className="mb-1.5 block font-heading text-xs font-medium text-slate-600"
          >
            {t('common.status')}
          </label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger id="encounters-status-filter" className="w-full">
              <SelectValue placeholder={t('common.allStatuses')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_STATUSES_VALUE}>{t('common.allStatuses')}</SelectItem>
              {ENCOUNTER_STATUSES.map((statusValue) => (
                <SelectItem key={statusValue} value={statusValue}>
                  {t(`encounters.status.${statusValue}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-56">
          <label
            htmlFor="encounters-doctor-filter"
            className="mb-1.5 block font-heading text-xs font-medium text-slate-600"
          >
            {t('encounters.doctor')}
          </label>
          <DoctorCombobox
            id="encounters-doctor-filter"
            doctors={doctorsQuery.doctors}
            value={doctorId}
            isLoading={doctorsQuery.isPending}
            emptyOptionLabel={t('encounters.allDoctors')}
            onChange={setDoctorId}
          />
        </div>
        <div>
          <span className="mb-1.5 block font-heading text-xs font-medium text-slate-600">
            {t('encounters.startedBetween')}
          </span>
          <div className="flex items-center gap-2">
            <DatePicker
              aria-label={t('encounters.startedFrom')}
              className="w-40"
              placeholder={t('common.from')}
              value={startedFrom}
              onValueChange={handleStartedFromChange}
            />
            <span className="text-sm text-slate-400">–</span>
            <DatePicker
              aria-label={t('encounters.startedTo')}
              className="w-40"
              placeholder={t('common.to')}
              value={startedTo}
              disabled={startedFrom.length === 0}
              minValue={startedFrom}
              onValueChange={setStartedTo}
            />
          </div>
        </div>
      </FilterCard>
    </form>
  );
}
