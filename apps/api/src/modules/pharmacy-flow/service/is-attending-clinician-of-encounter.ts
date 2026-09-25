import { PrescriptionEncounterRecord } from '@hms/shared-types';

/**
 * D-046. Whether the prescribing clinician is the one holding this visit for
 * this patient right now: the encounter is open, is the patient's own, and
 * its attending clinician (doctor or midwife) is the prescriber. That clinician
 * examined the patient, so the visit — not a standing doctor–patient
 * assignment — is what authorises the prescription.
 */
export function isAttendingClinicianOfEncounter(params: {
  encounter: PrescriptionEncounterRecord | null;
  clinicianId: string;
  patientId: string;
}): boolean {
  const { encounter, clinicianId, patientId } = params;
  if (!encounter) {
    return false;
  }
  return (
    encounter.status === 'IN_PROGRESS' &&
    encounter.patientId === patientId &&
    encounter.doctorId === clinicianId
  );
}
