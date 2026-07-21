'use client';

import { useState } from 'react';
import { Button, Can, Icon, Skeleton } from '@hms/ui';

import { AssignDoctorDialog } from '#components/client/patients/assign-doctor-dialog';
import { PatientActivityCard } from '#components/client/patients/patient-activity-card';
import { PatientDemographicsCard } from '#components/client/patients/patient-demographics-card';
import { PatientDoctorsCard } from '#components/client/patients/patient-doctors-card';
import { PatientFormDialog } from '#components/client/patients/patient-form-dialog';
import { EmptyState } from '#components/shared/empty-state';
import { PageHeader } from '#components/shared/page-header';
import { usePatientDetail } from '#lib/patients/use-patient-detail';

type PatientDetailPanelProps = {
  patientId: string;
};

export function PatientDetailPanel({ patientId }: PatientDetailPanelProps) {
  const detailQuery = usePatientDetail(patientId);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState<boolean>(false);
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState<boolean>(false);
  const patient = detailQuery.patient;

  if (detailQuery.isPending) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16 w-1/2" />
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <Skeleton className="h-72 w-full rounded-xl" />
          <Skeleton className="h-72 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (!patient) {
    return (
      <EmptyState
        icon="person_off"
        title="Patient not found"
        description={
          detailQuery.isError
            ? detailQuery.error?.message ?? 'Something went wrong while loading the patient.'
            : 'The patient record does not exist or you do not have access to it.'
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={patient.fullName}
        subtitle={`Patient record ${patient.mrn}`}
        breadcrumbs={['Main Dashboard', 'Patients', patient.fullName]}
        actions={
          <Can action="update" subject="Patient">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsEditDialogOpen(true)}
            >
              <Icon name="edit" size={18} />
              Edit Patient
            </Button>
          </Can>
        }
      />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <PatientDemographicsCard patient={patient} />
        <div className="space-y-6">
          <PatientDoctorsCard
            patient={patient}
            onAssignDoctor={() => setIsAssignDialogOpen(true)}
          />
          <PatientActivityCard patientId={patient.id} />
        </div>
      </div>

      {isEditDialogOpen ? (
        <PatientFormDialog
          key={patient.updatedAt}
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          patient={patient}
        />
      ) : null}

      {isAssignDialogOpen ? (
        <AssignDoctorDialog
          open={isAssignDialogOpen}
          onOpenChange={setIsAssignDialogOpen}
          patientId={patient.id}
          patientName={patient.fullName}
          assignedDoctorIds={patient.doctors.map((doctor) => doctor.id)}
        />
      ) : null}
    </div>
  );
}
