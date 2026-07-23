import type { AppointmentListItem } from '@hms/shared-types';
import { describe, expect, it } from 'vitest';

import { filterAppointmentsByDoctors } from './filter-appointments-by-doctors';

function buildAppointment(id: string, doctorId: string): AppointmentListItem {
  return {
    id,
    patientId: 'patient-1',
    doctorId,
    type: 'SPECIAL_REQUEST',
    scheduledAt: '2026-07-21T03:30:00.000Z',
    status: 'SCHEDULED',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    patient: { id: 'patient-1', mrn: 'MRN-0001', fullName: 'John Doe' },
    doctor: { id: doctorId, fullName: 'Dr. Budi Santoso', specialty: 'Cardiology' },
  };
}

const APPOINTMENTS = [
  buildAppointment('a1', 'doctor-1'),
  buildAppointment('a2', 'doctor-2'),
  buildAppointment('a3', 'doctor-1'),
];

describe('filterAppointmentsByDoctors', () => {
  it('returns every appointment when no staff filter is applied', () => {
    expect(filterAppointmentsByDoctors(APPOINTMENTS, null)).toEqual(APPOINTMENTS);
  });

  it('keeps only appointments for the selected doctors', () => {
    const filtered = filterAppointmentsByDoctors(APPOINTMENTS, ['doctor-1']);

    expect(filtered.map((appointment) => appointment.id)).toEqual(['a1', 'a3']);
  });

  it('returns no appointments when every doctor is unchecked', () => {
    expect(filterAppointmentsByDoctors(APPOINTMENTS, [])).toEqual([]);
  });
});
