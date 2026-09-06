'use client';

import { useState } from 'react';
import { Button, Can, Icon, Skeleton } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { AssignPatientDialog } from '#components/client/doctors/assign-patient-dialog';
import { DoctorFormDialog } from '#components/client/doctors/doctor-form-dialog';
import { DoctorEducationsCard } from '#components/client/doctors/doctor-educations-card';
import { DoctorIdentifiersCard } from '#components/client/doctors/doctor-identifiers-card';
import { DoctorLicensesCard } from '#components/client/doctors/doctor-licenses-card';
import { DoctorPatientsCard } from '#components/client/doctors/doctor-patients-card';
import { DoctorProfileCard } from '#components/client/doctors/doctor-profile-card';
import { DoctorScheduleCard } from '#components/client/doctors/doctor-schedule-card';
import { DoctorScheduleDialog } from '#components/client/doctors/doctor-schedule-dialog';
import { EmptyState } from '#components/shared/empty-state';
import { PageHeader } from '#components/shared/page-header';
import { useDoctorDetail } from '#lib/doctors/use-doctor-detail';

type DoctorDetailPanelProps = {
  doctorId: string;
  isSatusehatEnabled: boolean;
};

export function DoctorDetailPanel({ doctorId, isSatusehatEnabled }: DoctorDetailPanelProps) {
  const t = useTranslations('clinical');
  const detailQuery = useDoctorDetail(doctorId);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState<boolean>(false);
  const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState<boolean>(false);
  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState<boolean>(false);
  const doctor = detailQuery.doctor;

  if (detailQuery.isPending) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16 w-1/2" />
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <Skeleton className="h-72 w-full rounded-xl" />
          <Skeleton className="h-72 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (!doctor) {
    return (
      <EmptyState
        icon="person_off"
        title={t('doctors.notFound')}
        description={
          detailQuery.isError ? t('doctors.loadError') : t('doctors.notFoundDescription')
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={doctor.fullName}
        subtitle={`${doctor.specialty} · ${doctor.licenseNumber}`}
        breadcrumbs={[t('doctors.dashboard'), t('doctors.title'), doctor.fullName]}
        actions={
          <Can action="update" subject="Doctor">
            <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(true)}>
              <Icon name="edit" size={18} />
              {t('common.edit')} {t('doctors.title')}
            </Button>
          </Can>
        }
      />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <DoctorProfileCard doctor={doctor} />
          <DoctorIdentifiersCard doctor={doctor} isSatusehatEnabled={isSatusehatEnabled} />
          <DoctorEducationsCard educations={doctor.educations} />
        </div>
        <div className="space-y-6">
          <DoctorLicensesCard licenses={doctor.licenses} />
          <DoctorScheduleCard
            doctor={doctor}
            onManageSchedule={() => setIsScheduleDialogOpen(true)}
          />
          <DoctorPatientsCard doctor={doctor} onAssignPatient={() => setIsAssignDialogOpen(true)} />
        </div>
      </div>

      {isEditDialogOpen ? (
        <DoctorFormDialog
          key={doctor.updatedAt}
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          doctor={doctor}
          licenses={doctor.licenses}
          educations={doctor.educations}
        />
      ) : null}

      {isScheduleDialogOpen ? (
        <DoctorScheduleDialog
          key={doctor.updatedAt}
          open={isScheduleDialogOpen}
          onOpenChange={setIsScheduleDialogOpen}
          doctorId={doctor.id}
          doctorName={doctor.fullName}
          initialSchedules={doctor.schedules}
        />
      ) : null}

      {isAssignDialogOpen ? (
        <AssignPatientDialog
          open={isAssignDialogOpen}
          onOpenChange={setIsAssignDialogOpen}
          doctorId={doctor.id}
          doctorName={doctor.fullName}
          assignedPatientIds={doctor.patients?.map((patient) => patient.id)}
        />
      ) : null}
    </div>
  );
}
