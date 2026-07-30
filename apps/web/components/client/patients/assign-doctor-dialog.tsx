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
import { invalidatePatientQueries } from '#lib/patients/invalidate-patient-queries';
import { useActiveDoctors } from '#lib/patients/use-active-doctors';

const HTTP_CONFLICT_STATUS = 409;

type AssignDoctorDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  patientName: string;
  assignedDoctorIds?: string[];
};

export function AssignDoctorDialog({
  open,
  onOpenChange,
  patientId,
  patientName,
  assignedDoctorIds = [],
}: AssignDoctorDialogProps) {
  const queryClient = useQueryClient();
  const t = useTranslations('clinical');
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('');
  const [assignError, setAssignError] = useState<string | null>(null);
  const doctorsQuery = useActiveDoctors(open);
  const assignMutation = useMutation({
    mutationFn: (input: CreateDoctorPatientAssignmentInput) =>
      doctorPatientControllerAssignDoctorToPatientV1(input),
  });
  const selectableDoctors = doctorsQuery.doctors.filter(
    (doctor) => !assignedDoctorIds.includes(doctor.id),
  );

  async function handleAssign(): Promise<void> {
    if (!selectedDoctorId) {
      setAssignError(t('patients.doctorRequired'));
      return;
    }
    setAssignError(null);
    try {
      const response = await assignMutation.mutateAsync({
        doctorId: selectedDoctorId,
        patientId,
      });
      parseApiSuccess<DoctorPatientAssignment>(response, t('patients.assignDoctorError'));
      await invalidatePatientQueries(queryClient);
      setSelectedDoctorId('');
      onOpenChange(false);
    } catch (error) {
      if (isApiStatusError(error, HTTP_CONFLICT_STATUS)) {
        setAssignError(t('patients.doctorDuplicate'));
        return;
      }
      setAssignError(notifyApiError(error, t('patients.assignDoctorError')));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">{t('patients.assignDoctor')}</DialogTitle>
          <DialogDescription>
            {t('patients.assignDescription', { name: patientName })}
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
              htmlFor="assign-doctor-select"
              className="block font-heading text-xs font-medium text-slate-600"
            >
              {t('encounters.doctor')}
            </label>
            <Combobox
              id="assign-doctor-select"
              options={selectableDoctors.map((doctor) => ({
                value: doctor.id,
                label: `${doctor.fullName} — ${doctor.specialty}`,
              }))}
              value={selectedDoctorId}
              placeholder={t('patients.selectDoctor')}
              searchPlaceholder={t('patients.searchDoctor')}
              emptyMessage={t('patients.noDoctor')}
              isLoading={doctorsQuery.isPending}
              onChange={setSelectedDoctorId}
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
            {assignMutation.isPending ? t('patients.assigningDoctor') : t('patients.assignDoctor')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
