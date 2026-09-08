'use client';

import { useState } from 'react';
import { Button, Input, Skeleton } from '@hms/ui';
import { useTranslations } from 'next-intl';

import type { LabIntakePatient } from '#lib/laboratory/lab-intake-patient';
import { usePatientsList } from '#lib/patients/use-patients-list';

type LabIntakePatientPickerProps = {
  selectedPatient: LabIntakePatient | null;
  onSelect: (patient: LabIntakePatient | null) => void;
  disabled?: boolean;
};

const SEARCH_RESULT_LIMIT = 8;
const MINIMUM_SEARCH_LENGTH = 2;

/**
 * Finds the patient the request is for (P18-T10).
 *
 * Search-first and never a full list: the front desk knows who is standing in
 * front of them, and a walk-in lab request raised against the wrong patient is
 * a result filed in a stranger's record. Once one is chosen the search closes,
 * so the choice is visible rather than one row highlighted among many.
 */
export function LabIntakePatientPicker({
  selectedPatient,
  onSelect,
  disabled,
}: LabIntakePatientPickerProps) {
  const t = useTranslations('operations.laboratory.intake.patient');
  const [search, setSearch] = useState<string>('');
  const trimmedSearch = search.trim();
  const isSearching = trimmedSearch.length >= MINIMUM_SEARCH_LENGTH;
  const { patients, isPending } = usePatientsList({
    page: 1,
    limit: SEARCH_RESULT_LIMIT,
    search: isSearching ? trimmedSearch : undefined,
  });
  const searchResults = patients as unknown as LabIntakePatient[];

  if (selectedPatient) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3">
        <span className="text-sm text-slate-700">
          {selectedPatient.fullName} · {selectedPatient.mrn}
        </span>
        <Button type="button" variant="outline" disabled={disabled} onClick={() => onSelect(null)}>
          {t('change')}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder={t('searchPlaceholder')}
        aria-label={t('searchLabel')}
        disabled={disabled}
      />
      {!isSearching ? null : isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : searchResults.length === 0 ? (
        <p className="text-sm text-slate-500">{t('noResults')}</p>
      ) : (
        <ul className="max-h-52 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
          {searchResults.map((patient) => (
            <li key={patient.id}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                disabled={disabled}
                onClick={() => onSelect(patient)}
              >
                {patient.fullName} · {patient.mrn}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
