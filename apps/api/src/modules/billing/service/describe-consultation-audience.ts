import { ClinicianProfessionValue } from '@hms/shared-types';

const PROFESSION_LABELS: Record<ClinicianProfessionValue, string> = {
  DOCTOR: 'doctor',
  MIDWIFE: 'midwife',
};

/**
 * Names the visit an unbilled consultation belonged to, for the gap the
 * cashier reads. "No active consultation tariff" tells nobody which price to
 * write; "prices midwife consultations in Kebidanan" names the row to add.
 */
export function describeConsultationAudience(clinician: {
  specialtyName: string;
  profession: ClinicianProfessionValue;
}): string {
  return `${PROFESSION_LABELS[clinician.profession]} consultations in ${clinician.specialtyName}`;
}
