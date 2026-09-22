import { BirthsDeathsReportResponse, MATERNAL_REPORT_LABELS } from '@hms/shared-types';

import { buildMaternalReportCsv } from './build-maternal-report-csv';
import { buildMaternalReportHeaderRows } from './build-maternal-report-header-rows';
import { resolveMaternalReportTitle } from './resolve-maternal-report-title';

const MISSING_VALUE = '';

/** The births and deaths report as CSV (P25-T15): summary, births, deaths. */
export function buildBirthsDeathsCsv(report: BirthsDeathsReportResponse, timeZone: string): string {
  const formatInstant = (value: string): string =>
    new Intl.DateTimeFormat('id-ID', {
      timeZone,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(value));
  return buildMaternalReportCsv([
    ...buildMaternalReportHeaderRows(resolveMaternalReportTitle('births-deaths'), report.header),
    ['Catatan', report.coverageNote],
    [],
    ['Lahir hidup', String(report.summary.liveBirths)],
    ['Lahir mati', String(report.summary.stillbirths)],
    ['Kematian ibu', String(report.summary.maternalDeaths)],
    ['Kematian bayi baru lahir', String(report.summary.newbornDeaths)],
    ['Kematian lainnya', String(report.summary.otherDeaths)],
    [],
    ['KELAHIRAN'],
    [
      'Waktu lahir',
      'Hidup/Mati',
      'Jenis kelamin',
      'Berat lahir (g)',
      'Nama ibu',
      'Desa/Kelurahan',
      'Penolong',
    ],
    ...report.births.map((birth) => [
      formatInstant(birth.birthAt),
      MATERNAL_REPORT_LABELS.birthOutcome[birth.outcome],
      MATERNAL_REPORT_LABELS.sex[birth.sex],
      birth.birthWeightGrams === null ? MISSING_VALUE : String(birth.birthWeightGrams),
      birth.motherName,
      birth.villageName ?? MATERNAL_REPORT_LABELS.noVillage,
      birth.attendantName,
    ]),
    [],
    ['KEMATIAN'],
    ['Waktu meninggal', 'Kelompok', 'Nama', 'Usia', 'Desa/Kelurahan'],
    ...report.deaths.map((death) => [
      formatInstant(death.diedAt),
      MATERNAL_REPORT_LABELS.deathPatientKind[death.patientKind],
      death.patientName,
      death.ageLabel,
      death.villageName ?? MATERNAL_REPORT_LABELS.noVillage,
    ]),
  ]);
}
