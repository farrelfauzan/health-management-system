'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type {
  CreateDoctorPatientAssignmentInput,
  DoctorPatientAssignment,
} from '@hms/shared-types';
import { useTranslations } from 'next-intl';
import {
  Button,
  Combobox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@hms/ui';

import { doctorPatientControllerAssignDoctorToPatientV1 } from '#lib/api/generated/doctor-patient/doctor-patient';
import { isApiStatusError } from '#lib/api/is-api-status-error';
import { parseApiSuccess } from '#lib/api/response';
import { notifyApiError } from '#lib/api/notify-api-error';
import { invalidateDoctorQueries } from '#lib/doctors/invalidate-doctor-queries';
import { usePatientsList } from '#lib/patients/use-patients-list';

const HTTP_CONFLICT_STATUS = 409;
const PATIENT_PICKER_PAGE = { page: 1, limit: 100 };

type AssignPatientDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  doctorId: string;
  doctorName: string;
  assignedPatientIds?: string[];
};

export function AssignPatientDialog({
  open,
  onOpenChange,
  doctorId,
  doctorName,
  assignedPatientIds = [],
}: AssignPatientDialogProps) {
  const queryClient = useQueryClient();
  const t = useTranslations('clinical');
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  const [assignError, setAssignError] = useState<string | null>(null);
  const patientsQuery = usePatientsList(PATIENT_PICKER_PAGE);
  const assignMutation = useMutation({
    mutationFn: (input: CreateDoctorPatientAssignmentInput) =>
      doctorPatientControllerAssignDoctorToPatientV1(input),
  });
  const selectablePatients = patientsQuery.patients.filter(
    (patient) => !assignedPatientIds.includes(patient.id),
  );

  async function handleAssign(): Promise<void> {
    if (!selectedPatientId) {
      setAssignError(t('doctors.patientRequired'));
      return;
    }
    setAssignError(null);
    try {
      const response = await assignMutation.mutateAsync({
        doctorId,
        patientId: selectedPatientId,
      });
      parseApiSuccess<DoctorPatientAssignment>(response, t('doctors.assignPatientError'));
      await invalidateDoctorQueries(queryClient);
      setSelectedPatientId('');
      onOpenChange(false);
    } catch (error) {
      if (isApiStatusError(error, HTTP_CONFLICT_STATUS)) {
        setAssignError(t('doctors.patientDuplicate'));
        return;
      }
      setAssignError(notifyApiError(error, t('doctors.assignPatientError')));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">{t('doctors.assignPatient')}</DialogTitle>
          <DialogDescription>
            {t('doctors.assignDescription', { name: doctorName })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {assignError ? (
            <p
              role="alert"
              className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
            >
              {assignError}
            </p>
          ) : null}
          <div className="space-y-1.5">
            <label
              htmlFor="assign-patient-select"
              className="block font-heading text-xs font-medium text-slate-600"
            >
              {t('patients.title')}
            </label>
            <Combobox
              id="assign-patient-select"
              options={selectablePatients.map((patient) => ({
                value: patient.id,
                label: `${patient.fullName} — ${patient.mrn}`,
              }))}
              value={selectedPatientId}
              placeholder={t('doctors.selectPatient')}
              searchPlaceholder={t('doctors.searchPatient')}
              emptyMessage={t('doctors.noPatient')}
              isLoading={patientsQuery.isPending}
              onChange={setSelectedPatientId}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            disabled={assignMutation.isPending}
            className="bg-primary-container hover:bg-primary"
            onClick={() => void handleAssign()}
          >
            {assignMutation.isPending ? t('doctors.assigningPatient') : t('doctors.assignPatient')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
