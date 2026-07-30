'use client';

import { Combobox } from '@hms/ui';
import { useTranslations } from 'next-intl';

import { useDoctorsList } from '#lib/doctors/use-doctors-list';
import { usePatientsList } from '#lib/patients/use-patients-list';

const PICKER_PAGE = { page: 1, limit: 100 };
const DOCTOR_PICKER_QUERY = { ...PICKER_PAGE, isActive: 'true' as const };

type AppointmentParticipantFieldsProps = {
  patientId: string;
  doctorId: string;
  onPatientChange: (patientId: string) => void;
  onDoctorChange: (doctorId: string) => void;
};

export function AppointmentParticipantFields({
  patientId,
  doctorId,
  onPatientChange,
  onDoctorChange,
}: AppointmentParticipantFieldsProps) {
  const t = useTranslations('operations');
  const patientsQuery = usePatientsList(PICKER_PAGE);
  const doctorsQuery = useDoctorsList(DOCTOR_PICKER_QUERY);

  return (
    <>
      <div className="space-y-1.5">
        <label
          htmlFor="appointment-patient-select"
          className="block font-heading text-xs font-medium text-slate-600"
        >
          {t('common.patient')}
        </label>
        <Combobox
          id="appointment-patient-select"
          options={patientsQuery.patients.map((patient) => ({
            value: patient.id,
            label: patient.fullName,
          }))}
          value={patientId}
          placeholder={t('appointments.selectPatient')}
          searchPlaceholder={t('appointments.searchPatient')}
          emptyMessage={t('appointments.noPatient')}
          isLoading={patientsQuery.isPending}
          onChange={onPatientChange}
        />
      </div>
      <div className="space-y-1.5">
        <label
          htmlFor="appointment-doctor-select"
          className="block font-heading text-xs font-medium text-slate-600"
        >
          {t('common.doctor')}
        </label>
        <Combobox
          id="appointment-doctor-select"
          options={doctorsQuery.doctors.map((doctor) => ({
            value: doctor.id,
            label: `${doctor.fullName} (${doctor.specialty})`,
          }))}
          value={doctorId}
          placeholder={t('appointments.selectDoctor')}
          searchPlaceholder={t('appointments.searchDoctor')}
          emptyMessage={t('appointments.noDoctor')}
          isLoading={doctorsQuery.isPending}
          onChange={onDoctorChange}
        />
      </div>
    </>
  );
}
