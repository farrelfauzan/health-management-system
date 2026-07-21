'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { DoctorPatientAssignment, PatientDetail } from '@hms/shared-types';
import { Button, Can, Card, CardContent, CardHeader, CardTitle, Icon } from '@hms/ui';

import { AvatarInitials } from '#components/shared/avatar-initials';
import { doctorPatientControllerUnassignDoctorFromPatientV1 } from '#lib/api/generated/doctor-patient/doctor-patient';
import { parseApiSuccess } from '#lib/api/response';
import { resolveApiErrorMessage } from '#lib/api/resolve-api-error-message';
import { invalidatePatientQueries } from '#lib/patients/invalidate-patient-queries';

const UNASSIGN_ERROR_FALLBACK = 'Unable to unassign the doctor. Please try again.';

type PatientDoctorsCardProps = {
  patient: PatientDetail;
  onAssignDoctor: () => void;
};

export function PatientDoctorsCard({ patient, onAssignDoctor }: PatientDoctorsCardProps) {
  const queryClient = useQueryClient();
  const [unassignError, setUnassignError] = useState<string | null>(null);
  const unassignMutation = useMutation({
    mutationFn: (assignmentId: string) =>
      doctorPatientControllerUnassignDoctorFromPatientV1(assignmentId),
  });

  async function handleUnassign(assignmentId: string): Promise<void> {
    setUnassignError(null);
    try {
      const response = await unassignMutation.mutateAsync(assignmentId);
      parseApiSuccess<DoctorPatientAssignment>(response, UNASSIGN_ERROR_FALLBACK);
      await invalidatePatientQueries(queryClient);
    } catch (error) {
      setUnassignError(resolveApiErrorMessage(error, UNASSIGN_ERROR_FALLBACK));
    }
  }

  return (
    <Card className="rounded-xl border-slate-200 shadow-none">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="font-heading text-base font-semibold text-slate-900">
          Assigned Doctors
        </CardTitle>
        <Can action="assign" subject="DoctorPatient">
          <Button type="button" size="sm" variant="outline" onClick={onAssignDoctor}>
            <Icon name="person_add" size={16} />
            Assign
          </Button>
        </Can>
      </CardHeader>
      <CardContent className="space-y-3">
        {unassignError ? (
          <p
            role="alert"
            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
          >
            {unassignError}
          </p>
        ) : null}
        {patient.doctors.length === 0 ? (
          <p className="text-sm text-slate-500">No doctors assigned yet.</p>
        ) : (
          patient.doctors.map((doctor) => (
            <div key={doctor.assignmentId} className="flex items-center gap-3">
              <AvatarInitials name={doctor.fullName} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900">{doctor.fullName}</p>
                <p className="truncate text-xs text-slate-500">{doctor.specialty}</p>
              </div>
              <Can action="unassign" subject="DoctorPatient">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-danger hover:text-danger"
                  disabled={unassignMutation.isPending}
                  aria-label={`Unassign ${doctor.fullName}`}
                  onClick={() => void handleUnassign(doctor.assignmentId)}
                >
                  <Icon name="person_remove" size={16} />
                </Button>
              </Can>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
