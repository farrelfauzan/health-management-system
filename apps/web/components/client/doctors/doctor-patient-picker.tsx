'use client';

import type { PatientListItem } from '@hms/shared-types';
import { MAX_INITIAL_PATIENT_ASSIGNMENTS } from '@hms/shared-types';
import { Checkbox, Skeleton } from '@hms/ui';

type DoctorPatientPickerProps = {
  patients: PatientListItem[];
  selectedPatientIds: string[];
  isLoading: boolean;
  onTogglePatient: (patientId: string) => void;
};

export function DoctorPatientPicker({
  patients,
  selectedPatientIds,
  isLoading,
  onTogglePatient,
}: DoctorPatientPickerProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-3/4" />
      </div>
    );
  }
  if (patients.length === 0) {
    return <p className="text-sm text-slate-500">No patients available.</p>;
  }
  const isAtLimit = selectedPatientIds.length >= MAX_INITIAL_PATIENT_ASSIGNMENTS;
  return (
    <div className="max-h-44 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-3">
      {patients.map((patient) => {
        const isSelected = selectedPatientIds.includes(patient.id);
        return (
          <label key={patient.id} className="flex cursor-pointer items-center gap-2.5">
            <Checkbox
              checked={isSelected}
              disabled={!isSelected && isAtLimit}
              onCheckedChange={() => onTogglePatient(patient.id)}
            />
            <span className="text-sm text-slate-700">{patient.fullName}</span>
            <span className="font-mono text-xs text-slate-400">{patient.mrn}</span>
          </label>
        );
      })}
    </div>
  );
}
