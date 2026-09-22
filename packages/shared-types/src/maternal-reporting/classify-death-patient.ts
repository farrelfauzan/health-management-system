import type {
  MaternalReportDeathPatientKind,
  MaternalReportDeathSource,
} from '#maternal-reporting/types';

const MILLISECONDS_PER_DAY = 86_400_000;
/** WHO: a maternal death is during pregnancy or within 42 days of its end. */
const MATERNAL_DEATH_WINDOW_DAYS = 42;
/** The neonatal period, the first 28 days of life. */
const NEONATAL_PERIOD_DAYS = 28;

/**
 * Whether a DIED discharge is a maternal, a newborn or another death
 * (P25-T15, FR-RPT-03). Newborn: the patient was registered from a delivery
 * record, or was under 28 days old. Maternal: she had a pregnancy still open
 * or ended within 42 days before the death. Anything else is reported but
 * not attributed, because Pasal 28(h) asks for the count, not a cause.
 */
export function classifyDeathPatient(
  death: MaternalReportDeathSource,
): MaternalReportDeathPatientKind {
  const diedAt = death.dischargedAt.getTime();
  const ageDays = (diedAt - death.patient.dateOfBirth.getTime()) / MILLISECONDS_PER_DAY;
  if (death.isRegisteredNewborn || (ageDays >= 0 && ageDays <= NEONATAL_PERIOD_DAYS)) {
    return 'NEWBORN';
  }
  const isMaternal = death.pregnancyEndDates.some((endedAt) => {
    if (endedAt === null) {
      return true;
    }
    const daysSinceEnd = (diedAt - endedAt.getTime()) / MILLISECONDS_PER_DAY;
    return daysSinceEnd >= 0 && daysSinceEnd <= MATERNAL_DEATH_WINDOW_DAYS;
  });
  return isMaternal ? 'MOTHER' : 'OTHER';
}
