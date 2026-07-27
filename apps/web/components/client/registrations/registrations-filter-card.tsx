'use client';

import { useState } from 'react';
import { REGISTRATION_STATUSES, type RegistrationStatusValue } from '@hms/shared-types';
import {
  Button,
  DatePicker,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@hms/ui';

import { DoctorCombobox } from '#components/client/doctors/doctor-combobox';
import { FilterCard } from '#components/shared/filter-card';
import { useDoctorsList } from '#lib/doctors/use-doctors-list';
import type { RegistrationsSearchParams } from '#lib/registrations/search-params';
import { formatStatusLabel } from '#lib/shared/status-label';

const ALL_STATUSES_VALUE = 'ALL';
const DOCTOR_PICKER_QUERY = { page: 1, limit: 100, isActive: 'true' as const };

export type RegistrationsFilterValues = {
  search?: string;
  status?: RegistrationStatusValue;
  doctorId?: string;
  registeredFrom?: string;
  registeredTo?: string;
};

type RegistrationsFilterCardProps = {
  initialQuery: RegistrationsSearchParams;
  onApply: (filters: RegistrationsFilterValues) => void;
  onReset: () => void;
};

export function RegistrationsFilterCard({
  initialQuery,
  onApply,
  onReset,
}: RegistrationsFilterCardProps) {
  const [search, setSearch] = useState<string>(initialQuery.search ?? '');
  const [status, setStatus] = useState<string>(initialQuery.status ?? ALL_STATUSES_VALUE);
  const [doctorId, setDoctorId] = useState<string>(initialQuery.doctorId ?? '');
  const doctorsQuery = useDoctorsList(DOCTOR_PICKER_QUERY);
  const [registeredFrom, setRegisteredFrom] = useState<string>(initialQuery.registeredFrom ?? '');
  const [registeredTo, setRegisteredTo] = useState<string>(initialQuery.registeredTo ?? '');

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    event.stopPropagation();
    const trimmedSearch = search.trim();
    onApply({
      search: trimmedSearch.length > 0 ? trimmedSearch : undefined,
      status: status === ALL_STATUSES_VALUE ? undefined : (status as RegistrationStatusValue),
      doctorId: doctorId.length > 0 ? doctorId : undefined,
      registeredFrom: registeredFrom.length > 0 ? registeredFrom : undefined,
      registeredTo: registeredTo.length > 0 ? registeredTo : undefined,
    });
  }

  function handleReset(): void {
    setSearch('');
    setStatus(ALL_STATUSES_VALUE);
    setDoctorId('');
    setRegisteredFrom('');
    setRegisteredTo('');
    onReset();
  }

  function handleRegisteredFromChange(value: string): void {
    setRegisteredFrom(value);
    if (registeredTo.length > 0 && (value.length === 0 || registeredTo < value)) {
      setRegisteredTo('');
    }
  }

  return (
    <form noValidate onSubmit={handleSubmit}>
      <FilterCard
        actions={
          <>
            <Button type="submit" size="sm" className="bg-primary-container hover:bg-primary">
              Apply Filters
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={handleReset}>
              Reset
            </Button>
          </>
        }
      >
        <div className="w-full sm:w-56">
          <label
            htmlFor="registrations-quick-filter"
            className="mb-1.5 block font-heading text-xs font-medium text-slate-600"
          >
            Quick Filter
          </label>
          <Input
            id="registrations-quick-filter"
            placeholder="Patient name or ID..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="w-40">
          <label
            htmlFor="registrations-status-filter"
            className="mb-1.5 block font-heading text-xs font-medium text-slate-600"
          >
            Status
          </label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger id="registrations-status-filter" className="w-full">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_STATUSES_VALUE}>All Statuses</SelectItem>
              {REGISTRATION_STATUSES.map((statusValue) => (
                <SelectItem key={statusValue} value={statusValue}>
                  {formatStatusLabel(statusValue)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-56">
          <label
            htmlFor="registrations-doctor-filter"
            className="mb-1.5 block font-heading text-xs font-medium text-slate-600"
          >
            Doctor
          </label>
          <DoctorCombobox
            id="registrations-doctor-filter"
            doctors={doctorsQuery.doctors}
            value={doctorId}
            isLoading={doctorsQuery.isPending}
            emptyOptionLabel="All Doctors"
            onChange={setDoctorId}
          />
        </div>
        <div>
          <span className="mb-1.5 block font-heading text-xs font-medium text-slate-600">
            Registered Between
          </span>
          <div className="flex items-center gap-2">
            <DatePicker
              aria-label="Registered from"
              className="w-40"
              placeholder="From"
              value={registeredFrom}
              onValueChange={handleRegisteredFromChange}
            />
            <span className="text-sm text-slate-400">–</span>
            <DatePicker
              aria-label="Registered to"
              className="w-40"
              placeholder="To"
              value={registeredTo}
              disabled={registeredFrom.length === 0}
              minValue={registeredFrom}
              onValueChange={setRegisteredTo}
            />
          </div>
        </div>
      </FilterCard>
    </form>
  );
}
