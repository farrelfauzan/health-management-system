'use client';

import { useState } from 'react';
import type { DocumentTypeView } from '@hms/shared-types';
import { Combobox, Label } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { useDebouncedValue } from '#hooks/use-debounced-value';
import { usePatientOptions } from '#lib/admissions/use-patient-options';
import { useDoctorsList } from '#lib/doctors/use-doctors-list';

const SEARCH_DEBOUNCE_MS = 300;
const DOCTOR_OPTIONS_LIMIT = 50;

type ManagedDocumentPartyFieldsProps = {
  type: Pick<DocumentTypeView, 'requiresPatient' | 'requiresDoctor'>;
  patientId: string;
  doctorId: string;
  disabled: boolean;
  onPatientChange: (patientId: string) => void;
  onDoctorChange: (doctorId: string) => void;
};

/**
 * The party pickers, rendered from the type's flags (FR-E5-35): a patient
 * picker only when the type names a patient, a doctor picker only when it
 * names a doctor. A policy type renders nothing here at all — the absence
 * is the rule, and the API refuses a party the type has no place for.
 */
export function ManagedDocumentPartyFields({
  type,
  patientId,
  doctorId,
  disabled,
  onPatientChange,
  onDoctorChange,
}: ManagedDocumentPartyFieldsProps) {
  const t = useTranslations('operations.documents.form.parties');
  const [patientSearch, setPatientSearch] = useState<string>('');
  const debouncedPatientSearch = useDebouncedValue(patientSearch, SEARCH_DEBOUNCE_MS);
  const patientsQuery = usePatientOptions(type.requiresPatient ? debouncedPatientSearch : '');
  const doctorsQuery = useDoctorsList({ page: 1, limit: DOCTOR_OPTIONS_LIMIT, isActive: 'true' });
  const selectedPatient = patientsQuery.patients.find((patient) => patient.id === patientId);

  if (!type.requiresPatient && !type.requiresDoctor) {
    return null;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {type.requiresPatient ? (
        <div className="space-y-2">
          <Label htmlFor="managed-document-patient">{t('patient')}</Label>
          <Combobox
            id="managed-document-patient"
            options={patientsQuery.patients.map((patient) => ({
              value: patient.id,
              label: patient.fullName,
            }))}
            value={patientId}
            selectedLabel={selectedPatient?.fullName}
            placeholder={t('patientPlaceholder')}
            searchPlaceholder={t('patientSearchPlaceholder')}
            emptyMessage={t('patientEmpty')}
            isLoading={patientsQuery.isFetching}
            disabled={disabled}
            searchValue={patientSearch}
            onSearchValueChange={setPatientSearch}
            shouldFilter={false}
            onChange={onPatientChange}
          />
        </div>
      ) : null}
      {type.requiresDoctor ? (
        <div className="space-y-2">
          <Label htmlFor="managed-document-doctor">{t('doctor')}</Label>
          <Combobox
            id="managed-document-doctor"
            options={doctorsQuery.doctors.map((doctor) => ({
              value: doctor.id,
              label: `${doctor.fullName} (${doctor.specialty})`,
            }))}
            value={doctorId}
            placeholder={t('doctorPlaceholder')}
            searchPlaceholder={t('doctorSearchPlaceholder')}
            emptyMessage={t('doctorEmpty')}
            isLoading={doctorsQuery.isPending}
            disabled={disabled}
            onChange={onDoctorChange}
          />
        </div>
      ) : null}
    </div>
  );
}
