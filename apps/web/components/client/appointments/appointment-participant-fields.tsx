'use client';

import { Combobox } from '@hms/ui';

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
  const patientsQuery = usePatientsList(PICKER_PAGE);
  const doctorsQuery = useDoctorsList(DOCTOR_PICKER_QUERY);

  return (
    <>
      <div className="space-y-1.5">
        <label
          htmlFor="appointment-patient-select"
          className="block font-heading text-xs font-medium text-slate-600"
        >
          Patient
        </label>
        <Combobox
          id="appointment-patient-select"
          options={patientsQuery.patients.map((patient) => ({
            value: patient.id,
            label: `${patient.fullName} — ${patient.mrn}`,
          }))}
          value={patientId}
          placeholder="Select a patient"
          searchPlaceholder="Search by name or MRN..."
          emptyMessage="No patient found."
          isLoading={patientsQuery.isPending}
          onChange={onPatientChange}
        />
      </div>
      <div className="space-y-1.5">
        <label
          htmlFor="appointment-doctor-select"
          className="block font-heading text-xs font-medium text-slate-600"
        >
          Doctor
        </label>
        <Combobox
          id="appointment-doctor-select"
          options={doctorsQuery.doctors.map((doctor) => ({
            value: doctor.id,
            label: `${doctor.fullName} (${doctor.specialty})`,
          }))}
          value={doctorId}
          placeholder="Select a doctor"
          searchPlaceholder="Search by name or specialty..."
          emptyMessage="No doctor found."
          isLoading={doctorsQuery.isPending}
          onChange={onDoctorChange}
        />
      </div>
    </>
  );
}
