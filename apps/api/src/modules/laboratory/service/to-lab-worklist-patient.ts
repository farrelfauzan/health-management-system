import { LabWorklistOrderRecord, LabWorklistPatient } from '@hms/shared-types';

import { toPatientAgeYears } from './to-patient-age-years';

/**
 * The identity the bench matches a tube against — name, MRN, sex and age,
 * nothing clinical (P18-T03). Age is whole years at the time of the read: what
 * an analis compares a printed range against. Shared by the worklist, the
 * label and the bench view (P18-T08) so the three never disagree about who a
 * patient is.
 */
export function toLabWorklistPatient(record: LabWorklistOrderRecord): LabWorklistPatient {
  return {
    id: record.patient.id,
    fullName: record.patient.fullName,
    mrn: record.patient.mrn,
    dateOfBirth: record.patient.dateOfBirth.toISOString().slice(0, 10),
    sex: record.patient.sex,
    ageYears: toPatientAgeYears(record.patient.dateOfBirth, new Date()),
  };
}
