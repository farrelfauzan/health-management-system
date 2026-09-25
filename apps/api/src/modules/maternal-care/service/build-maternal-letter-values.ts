import {
  AntenatalExaminationRow,
  ClinicalDocumentSignerRecord,
  ClinicLetterhead,
  computeGestationalAge,
  getCalendarDateInTimeZone,
  MaternalLetterPatient,
  PregnancyEpisodeRecord,
  TriggeredAntenatalReferralRule,
} from '@hms/shared-types';

import { buildClinicLetterheadValues } from '../../clinical-request-document/service/build-clinic-letterhead-values';
import { buildSignerValues } from '../../clinical-request-document/service/build-signer-values';
import { formatIndonesianDateTime } from '../../clinical-request-document/service/format-indonesian-date-time';
import { toDateOnly } from '../to-date-only';
import { toMaternalDate } from '../to-maternal-date';

/** Shown when the record holds nothing for a token, rather than an empty cell. */
const NOT_RECORDED = '—';

/** A `@db.Date` column names a calendar day, so it is printed without a zone shift. */
const DATE_COLUMN_TIME_ZONE = 'UTC';

const SEX_LABELS: Readonly<Record<string, string>> = {
  MALE: 'Laki-laki',
  FEMALE: 'Perempuan',
};

/**
 * The token values both maternal letters are rendered from (P25-T07).
 *
 * Everything is read from the record, nothing is typed into the letter: the
 * destination and the free note are the only two things the midwife supplies,
 * and they are the only two the record does not already know.
 *
 * The NIK is **masked to its last four digits**. A surat rujukan is carried by
 * hand to a hospital counter and read by people the clinic never meets, so the
 * full national identifier has no business on it — the name, the date of birth
 * and the MRN identify her to the receiving clinician.
 *
 * The letterhead and the signature block are the ones every clinical letter
 * prints: the clinic profile, and the issuing clinician signing as a *bidan*
 * or a *dokter* under the licence in force (D-032). Dates are written out in
 * Indonesian, and the issue date is the clinic's calendar day.
 */
export function buildMaternalLetterValues(params: {
  patient: MaternalLetterPatient;
  episode: PregnancyEpisodeRecord;
  asOf: Date;
  examination: AntenatalExaminationRow | null;
  vitals: { systolicBloodPressure: number | null; diastolicBloodPressure: number | null };
  triggeredRules: readonly TriggeredAntenatalReferralRule[];
  letterhead: ClinicLetterhead;
  signer: ClinicalDocumentSignerRecord | null;
  timeZone: string;
  destination?: string;
  notes?: string;
}): Record<string, string> {
  const asOfDate = getCalendarDateInTimeZone(params.asOf, params.timeZone);
  const gestationalAge = computeGestationalAge({
    lastMenstrualPeriodDate: params.episode.lastMenstrualPeriodDate,
    estimatedDeliveryDate: params.episode.estimatedDeliveryDate,
    // Counted exactly as the referral rules count it, so the letter and the
    // prompts that caused it agree on the week.
    asOf: toMaternalDate(toDateOnly(params.asOf)) as Date,
  });
  return {
    ...buildClinicLetterheadValues(params.letterhead),
    ...buildSignerValues({ signer: params.signer, asOfDate }),
    'patient.fullName': params.patient.fullName,
    'patient.mrn': params.patient.mrn,
    'patient.dateOfBirth': formatDateColumn(params.patient.dateOfBirth),
    'patient.sex':
      params.patient.sex === null ? NOT_RECORDED : (SEX_LABELS[params.patient.sex] ?? NOT_RECORDED),
    'patient.age': buildAgeLabel(params.patient.dateOfBirth, params.asOf),
    'patient.nikMasked': maskNik(params.patient.nikLast4),
    'patient.address': params.patient.address ?? NOT_RECORDED,
    'pregnancy.lastMenstrualPeriodDate': formatDateColumn(params.episode.lastMenstrualPeriodDate),
    'pregnancy.estimatedDeliveryDate': formatDateColumn(params.episode.estimatedDeliveryDate),
    'pregnancy.gestationalAge': `${gestationalAge.weeks} minggu ${gestationalAge.days} hari`,
    'pregnancy.gpa': `G${params.episode.gravida}P${params.episode.para}A${params.episode.abortus}`,
    'request.issuedAt': formatIndonesianDateTime({
      value: params.asOf,
      timeZone: params.timeZone,
      withTime: false,
    }),
    'referral.destination': params.destination ?? NOT_RECORDED,
    'referral.findings': buildFindings(params.examination, params.vitals),
    'referral.triggeredRules': buildTriggeredRuleLabels(params.triggeredRules),
    'referral.notes': params.notes ?? NOT_RECORDED,
  };
}

/**
 * The measurements that were actually taken, in the order the examination
 * reads them. Absent ones are left out rather than printed as dashes: a letter
 * listing six things nobody measured says less than one listing the three that
 * were.
 */
function buildFindings(
  examination: AntenatalExaminationRow | null,
  vitals: { systolicBloodPressure: number | null; diastolicBloodPressure: number | null },
): string {
  const parts: string[] = [];
  if (vitals.systolicBloodPressure !== null && vitals.diastolicBloodPressure !== null) {
    parts.push(`TD ${vitals.systolicBloodPressure}/${vitals.diastolicBloodPressure} mmHg`);
  }
  if (examination?.muacCm != null) {
    parts.push(`LiLA ${examination.muacCm} cm`);
  }
  if (examination?.fundalHeightCm != null) {
    parts.push(`TFU ${examination.fundalHeightCm} cm`);
  }
  if (examination?.fetalHeartRateBpm != null) {
    parts.push(`DJJ ${examination.fetalHeartRateBpm} x/menit`);
  }
  if (examination?.fetalPresentation != null) {
    parts.push(`Presentasi ${examination.fetalPresentation}`);
  }

  return parts.length === 0 ? NOT_RECORDED : parts.join(', ');
}

/**
 * The prompts that fired, each with the page it came from. The source is
 * printed because the receiving clinician is entitled to know what standard
 * the referral was made against — and because a rule with no source never
 * reaches this list.
 */
function buildTriggeredRuleLabels(rules: readonly TriggeredAntenatalReferralRule[]): string {
  const active = rules.filter((rule) => rule.dismissedReason === null);

  return active.length === 0
    ? NOT_RECORDED
    : active.map((rule) => `${rule.label} (${rule.source})`).join('; ');
}

function formatDateColumn(value: Date | null): string {
  if (value === null) {
    return NOT_RECORDED;
  }
  return formatIndonesianDateTime({ value, timeZone: DATE_COLUMN_TIME_ZONE, withTime: false });
}

function maskNik(nikLast4: string | null): string {
  return nikLast4 === null ? NOT_RECORDED : `${'•'.repeat(12)}${nikLast4}`;
}

function buildAgeLabel(dateOfBirth: Date | null, asOf: Date): string {
  if (dateOfBirth === null) {
    return NOT_RECORDED;
  }
  const years = Math.floor((asOf.getTime() - dateOfBirth.getTime()) / (365.25 * 86_400_000));

  return `${years} tahun`;
}
