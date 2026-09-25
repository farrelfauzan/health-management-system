import { PrescriptionEncounterRecord } from '@hms/shared-types';

import { isAttendingClinicianOfEncounter } from './is-attending-clinician-of-encounter';

describe('isAttendingClinicianOfEncounter', () => {
  const inputClinicianId = 'clinician-1';
  const inputPatientId = 'patient-1';
  const openEncounter: PrescriptionEncounterRecord = {
    id: 'encounter-1',
    patientId: inputPatientId,
    doctorId: inputClinicianId,
    status: 'IN_PROGRESS',
  };

  it('is true for the attending clinician of the patient’s open encounter', () => {
    const actual = isAttendingClinicianOfEncounter({
      encounter: openEncounter,
      clinicianId: inputClinicianId,
      patientId: inputPatientId,
    });

    expect(actual).toBe(true);
  });

  it('is false without an encounter', () => {
    const actual = isAttendingClinicianOfEncounter({
      encounter: null,
      clinicianId: inputClinicianId,
      patientId: inputPatientId,
    });

    expect(actual).toBe(false);
  });

  it.each([
    ['another clinician attends it', { doctorId: 'clinician-2' }],
    ['it is another patient’s', { patientId: 'patient-2' }],
    ['it is finished', { status: 'FINISHED' as const }],
    ['it was cancelled', { status: 'CANCELLED' as const }],
  ])('is false when %s', (_label, override) => {
    const actual = isAttendingClinicianOfEncounter({
      encounter: { ...openEncounter, ...override },
      clinicianId: inputClinicianId,
      patientId: inputPatientId,
    });

    expect(actual).toBe(false);
  });
});
