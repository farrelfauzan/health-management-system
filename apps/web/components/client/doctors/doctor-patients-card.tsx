'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { DoctorDetail, DoctorPatientAssignment } from '@hms/shared-types';
import { Button, Can, Card, CardContent, CardHeader, CardTitle, Icon } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { AvatarInitials } from '#components/shared/avatar-initials';
import { doctorPatientControllerUnassignDoctorFromPatientV1 } from '#lib/api/generated/doctor-patient/doctor-patient';
import { parseApiSuccess } from '#lib/api/response';
import { notifyApiError } from '#lib/api/notify-api-error';
import { invalidateDoctorQueries } from '#lib/doctors/invalidate-doctor-queries';

type DoctorPatientsCardProps = {
  doctor: DoctorDetail;
  onAssignPatient: () => void;
};

export function DoctorPatientsCard({ doctor, onAssignPatient }: DoctorPatientsCardProps) {
  const queryClient = useQueryClient();
  const t = useTranslations('clinical');
  const [unassignError, setUnassignError] = useState<string | null>(null);
  const unassignMutation = useMutation({
    mutationFn: (assignmentId: string) =>
      doctorPatientControllerUnassignDoctorFromPatientV1(assignmentId),
  });

  async function handleUnassign(assignmentId: string): Promise<void> {
    setUnassignError(null);
    try {
      const response = await unassignMutation.mutateAsync(assignmentId);
      parseApiSuccess<DoctorPatientAssignment>(response, t('doctors.unassignPatientError'));
      await invalidateDoctorQueries(queryClient);
    } catch (error) {
      setUnassignError(notifyApiError(error, t('doctors.unassignPatientError')));
    }
  }

  return (
    <Card className="rounded-xl border-slate-200 shadow-none">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="font-heading text-base font-semibold text-slate-900">
          {t('doctors.patientsAssigned')}
        </CardTitle>
        <Can action="assign" subject="DoctorPatient">
          <Button type="button" size="sm" variant="outline" onClick={onAssignPatient}>
            <Icon name="person_add" size={16} />
            {t('doctors.assignPatient')}
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
        {!doctor.patients ? (
          <p className="text-sm text-slate-500">{t('doctors.patientsPermission')}</p>
        ) : doctor.patients.length === 0 ? (
          <p className="text-sm text-slate-500">{t('doctors.noAssignedPatients')}</p>
        ) : (
          doctor.patients.map((patient) => (
            <div key={patient.assignmentId} className="flex items-center gap-3">
              <AvatarInitials name={patient.fullName} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900">{patient.fullName}</p>
                <p className="truncate font-mono text-xs text-slate-500">{patient.mrn}</p>
              </div>
              <Can action="unassign" subject="DoctorPatient">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-danger hover:text-danger"
                  disabled={unassignMutation.isPending}
                  aria-label={t('doctors.unassignPatient', { name: patient.fullName })}
                  onClick={() => void handleUnassign(patient.assignmentId)}
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
