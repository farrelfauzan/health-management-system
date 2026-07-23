'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@hms/ui';

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
        <Select value={patientId} onValueChange={onPatientChange}>
          <SelectTrigger id="appointment-patient-select" className="w-full">
            <SelectValue
              placeholder={patientsQuery.isPending ? 'Loading patients…' : 'Select a patient'}
            />
          </SelectTrigger>
          <SelectContent>
            {patientsQuery.patients.map((patient) => (
              <SelectItem key={patient.id} value={patient.id}>
                {patient.fullName} — {patient.mrn}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <label
          htmlFor="appointment-doctor-select"
          className="block font-heading text-xs font-medium text-slate-600"
        >
          Doctor
        </label>
        <Select value={doctorId} onValueChange={onDoctorChange}>
          <SelectTrigger id="appointment-doctor-select" className="w-full">
            <SelectValue
              placeholder={doctorsQuery.isPending ? 'Loading doctors…' : 'Select a doctor'}
            />
          </SelectTrigger>
          <SelectContent>
            {doctorsQuery.doctors.map((doctor) => (
              <SelectItem key={doctor.id} value={doctor.id}>
                {doctor.fullName} ({doctor.specialty})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  );
}
