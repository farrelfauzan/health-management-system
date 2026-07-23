'use client';

import { useState } from 'react';
import { PATIENT_STATUSES, type PatientStatusValue } from '@hms/shared-types';
import {
  Button,
  DatePicker,
  Icon,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@hms/ui';

import { FilterCard } from '#components/shared/filter-card';
import { formatPatientStatusLabel } from '#lib/patients/patient-status-label';
import type { PatientsSearchParams } from '#lib/patients/search-params';

const ALL_STATUSES_VALUE = 'ALL';

export type PatientsFilterValues = {
  search?: string;
  status?: PatientStatusValue;
  createdFrom?: string;
  createdTo?: string;
};

type PatientsFilterCardProps = {
  initialQuery: PatientsSearchParams;
  onApply: (filters: PatientsFilterValues) => void;
  onReset: () => void;
  onExport: () => void;
  isExportDisabled: boolean;
};

export function PatientsFilterCard({
  initialQuery,
  onApply,
  onReset,
  onExport,
  isExportDisabled,
}: PatientsFilterCardProps) {
  const [search, setSearch] = useState<string>(initialQuery.search ?? '');
  const [status, setStatus] = useState<string>(initialQuery.status ?? ALL_STATUSES_VALUE);
  const [createdFrom, setCreatedFrom] = useState<string>(initialQuery.createdFrom ?? '');
  const [createdTo, setCreatedTo] = useState<string>(initialQuery.createdTo ?? '');

  function handleSubmit(event: React.SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    event.stopPropagation();
    const trimmedSearch = search.trim();
    onApply({
      search: trimmedSearch.length > 0 ? trimmedSearch : undefined,
      status: status === ALL_STATUSES_VALUE ? undefined : (status as PatientStatusValue),
      createdFrom: createdFrom.length > 0 ? createdFrom : undefined,
      createdTo: createdTo.length > 0 ? createdTo : undefined,
    });
  }

  function handleReset(): void {
    setSearch('');
    setStatus(ALL_STATUSES_VALUE);
    setCreatedFrom('');
    setCreatedTo('');
    onReset();
  }

  function handleCreatedFromChange(value: string): void {
    setCreatedFrom(value);
    if (createdTo.length > 0 && (value.length === 0 || createdTo < value)) {
      setCreatedTo('');
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
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isExportDisabled}
              onClick={onExport}
            >
              <Icon name="lab_profile" size={16} />
              Export
            </Button>
          </>
        }
      >
        <div className="w-full sm:w-56">
          <label
            htmlFor="patients-quick-filter"
            className="mb-1.5 block font-heading text-xs font-medium text-slate-600"
          >
            Quick Filter
          </label>
          <Input
            id="patients-quick-filter"
            placeholder="Name or ID..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="w-40">
          <label
            htmlFor="patients-status-filter"
            className="mb-1.5 block font-heading text-xs font-medium text-slate-600"
          >
            Status
          </label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger id="patients-status-filter" className="w-full">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_STATUSES_VALUE}>All Statuses</SelectItem>
              {PATIENT_STATUSES.map((statusValue) => (
                <SelectItem key={statusValue} value={statusValue}>
                  {formatPatientStatusLabel(statusValue)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {/* DUMMY-DATA: no department concept exists in the MVP backend; this
            control ships disabled until a department contract lands. */}
        {/* <div className="w-44">
          <label
            htmlFor="patients-department-filter"
            className="mb-1.5 block font-heading text-xs font-medium text-slate-600"
          >
            Department
          </label>
          <Select disabled>
            <SelectTrigger id="patients-department-filter" className="w-full">
              <SelectValue placeholder="All Departments" />
            </SelectTrigger>
            <SelectContent />
          </Select>
        </div> */}
        <div>
          <span className="mb-1.5 block font-heading text-xs font-medium text-slate-600">
            Date Range
          </span>
          <div className="flex items-center gap-2">
            <DatePicker
              aria-label="Registered from"
              className="w-40"
              placeholder="From"
              value={createdFrom}
              onValueChange={handleCreatedFromChange}
            />
            <span className="text-sm text-slate-400">–</span>
            <DatePicker
              aria-label="Registered to"
              className="w-40"
              placeholder="To"
              value={createdTo}
              disabled={createdFrom.length === 0}
              minValue={createdFrom}
              onValueChange={setCreatedTo}
            />
          </div>
        </div>
      </FilterCard>
    </form>
  );
}
