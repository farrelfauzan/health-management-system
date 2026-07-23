'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateDoctorPatientAssignmentInput, DoctorPatientAssignment } from '@hms/shared-types';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@hms/ui';

import { doctorPatientControllerAssignDoctorToPatientV1 } from '#lib/api/generated/doctor-patient/doctor-patient';
import { isApiStatusError } from '#lib/api/is-api-status-error';
import { parseApiSuccess } from '#lib/api/response';
import { notifyApiError } from '#lib/api/notify-api-error';
import { invalidatePatientQueries } from '#lib/patients/invalidate-patient-queries';
import { useActiveDoctors } from '#lib/patients/use-active-doctors';

const ASSIGN_ERROR_FALLBACK = 'Unable to assign the doctor. Please try again.';
const DUPLICATE_ASSIGNMENT_MESSAGE = 'This doctor is already assigned to the patient.';
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
      setAssignError('Select a doctor to assign.');
      return;
    }
    setAssignError(null);
    try {
      const response = await assignMutation.mutateAsync({
        doctorId: selectedDoctorId,
        patientId,
      });
      parseApiSuccess<DoctorPatientAssignment>(response, ASSIGN_ERROR_FALLBACK);
      await invalidatePatientQueries(queryClient);
      setSelectedDoctorId('');
      onOpenChange(false);
    } catch (error) {
      if (isApiStatusError(error, HTTP_CONFLICT_STATUS)) {
        setAssignError(DUPLICATE_ASSIGNMENT_MESSAGE);
        return;
      }
      setAssignError(notifyApiError(error, ASSIGN_ERROR_FALLBACK));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading">Assign Doctor</DialogTitle>
          <DialogDescription>Assign an active doctor to {patientName}.</DialogDescription>
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
              Doctor
            </label>
            <Select value={selectedDoctorId} onValueChange={setSelectedDoctorId}>
              <SelectTrigger id="assign-doctor-select" className="w-full">
                <SelectValue
                  placeholder={doctorsQuery.isPending ? 'Loading doctors…' : 'Select a doctor'}
                />
              </SelectTrigger>
              <SelectContent>
                {selectableDoctors.map((doctor) => (
                  <SelectItem key={doctor.id} value={doctor.id}>
                    {doctor.fullName} — {doctor.specialty}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={assignMutation.isPending}
            className="bg-primary-container hover:bg-primary"
            onClick={() => void handleAssign()}
          >
            {assignMutation.isPending ? 'Assigning…' : 'Assign Doctor'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
