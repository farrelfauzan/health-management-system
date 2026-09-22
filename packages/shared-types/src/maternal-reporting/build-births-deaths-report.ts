import type {
  BirthsDeathsBirthRow,
  BirthsDeathsDeathRow,
  BirthsDeathsSummary,
} from '#maternal-reporting/contracts';
import { classifyDeathPatient } from '#maternal-reporting/classify-death-patient';
import { computeAgeLabel } from '#maternal-reporting/compute-age-label';
import { isWithinMaternalReportMonth } from '#maternal-reporting/is-within-maternal-report-month';
import type {
  MaternalReportDeathSource,
  MaternalReportMonthRange,
  MaternalReportPatientSource,
} from '#maternal-reporting/types';
import type { MaternalReportDeliverySource } from '#maternal-reporting/types';

export type BuildBirthsDeathsReportParams = {
  readonly range: MaternalReportMonthRange;
  readonly deliveries: readonly (MaternalReportDeliverySource & {
    readonly mother: MaternalReportPatientSource;
  })[];
  readonly deaths: readonly MaternalReportDeathSource[];
};

export type BirthsDeathsReportBody = {
  readonly summary: BirthsDeathsSummary;
  readonly births: BirthsDeathsBirthRow[];
  readonly deaths: BirthsDeathsDeathRow[];
};

/**
 * The month's births and deaths (P25-T15, FR-RPT-03). Births are every baby of
 * a delivery whose birth instant is in the month — live or stillborn, one row
 * each. Deaths are DIED discharges in the month, attributed by
 * `classifyDeathPatient`. Deaths that happened outside the clinic have no row
 * here and the header says so.
 */
export function buildBirthsDeathsReport(
  params: BuildBirthsDeathsReportParams,
): BirthsDeathsReportBody {
  const births: BirthsDeathsBirthRow[] = params.deliveries
    .filter((delivery) => isWithinMaternalReportMonth(delivery.birthAt, params.range))
    .flatMap((delivery) =>
      delivery.newborns.map((newborn) => ({
        id: newborn.id,
        birthAt: delivery.birthAt.toISOString(),
        outcome: newborn.outcome,
        sex: newborn.sex,
        birthWeightGrams: newborn.birthWeightGrams,
        motherName: delivery.mother.fullName,
        villageName: delivery.mother.villageName,
        attendantName: delivery.attendantName,
      })),
    )
    .sort((left, right) => left.birthAt.localeCompare(right.birthAt));
  const deaths: BirthsDeathsDeathRow[] = params.deaths
    .filter((death) => isWithinMaternalReportMonth(death.dischargedAt, params.range))
    .map((death) => ({
      id: death.admissionId,
      diedAt: death.dischargedAt.toISOString(),
      patientKind: classifyDeathPatient(death),
      patientName: death.patient.fullName,
      ageLabel: computeAgeLabel(death.patient.dateOfBirth, death.dischargedAt),
      villageName: death.patient.villageName,
    }))
    .sort((left, right) => left.diedAt.localeCompare(right.diedAt));
  return {
    summary: {
      liveBirths: births.filter((birth) => birth.outcome === 'LIVE_BIRTH').length,
      stillbirths: births.filter((birth) => birth.outcome === 'STILLBIRTH').length,
      maternalDeaths: deaths.filter((death) => death.patientKind === 'MOTHER').length,
      newbornDeaths: deaths.filter((death) => death.patientKind === 'NEWBORN').length,
      otherDeaths: deaths.filter((death) => death.patientKind === 'OTHER').length,
    },
    births,
    deaths,
  };
}
