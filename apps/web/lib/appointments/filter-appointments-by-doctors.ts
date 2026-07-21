import type { AppointmentListItem } from '@hms/shared-types';

export function filterAppointmentsByDoctors(
  appointments: AppointmentListItem[],
  selectedDoctorIds: string[] | null,
): AppointmentListItem[] {
  if (selectedDoctorIds === null) {
    return appointments;
  }
  return appointments.filter((appointment) => selectedDoctorIds.includes(appointment.doctorId));
}
