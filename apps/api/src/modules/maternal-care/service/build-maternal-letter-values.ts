import {
  AntenatalExaminationRow,
  computeGestationalAge,
  MaternalLetterPatient,
  PregnancyEpisodeRecord,
  TriggeredAntenatalReferralRule,
} from '@hms/shared-types';

import { toDateOnly } from '../to-date-only';
import { toMaternalDate } from '../to-maternal-date';

/** Shown when the record holds nothing for a token, rather than an empty cell. */
const NOT_RECORDED = '—';

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
 */
export function buildMaternalLetterValues(params: {
  patient: MaternalLetterPatient;
  episode: PregnancyEpisodeRecord;
  asOf: Date;
  examination: AntenatalExaminationRow | null;
  vitals: { systolicBloodPressure: number | null; diastolicBloodPressure: number | null };
  triggeredRules: readonly TriggeredAntenatalReferralRule[];
  destination?: string;
  notes?: string;
}): Record<string, string> {
  const gestationalAge = computeGestationalAge({
    lastMenstrualPeriodDate: params.episode.lastMenstrualPeriodDate,
    estimatedDeliveryDate: params.episode.estimatedDeliveryDate,
    asOf: toMaternalDate(toDateOnly(params.asOf)) as Date,
  });

  return {
    'patient.fullName': params.patient.fullName,
    'patient.mrn': params.patient.mrn,
    'patient.dateOfBirth':
      params.patient.dateOfBirth === null ? NOT_RECORDED : toDateOnly(params.patient.dateOfBirth),
    'patient.sex': params.patient.sex === 'FEMALE' ? 'Perempuan' : 'Laki-laki',
    'patient.age': buildAgeLabel(params.patient.dateOfBirth, params.asOf),
    'patient.nikMasked': maskNik(params.patient.nikLast4),
    'patient.address': params.patient.address ?? NOT_RECORDED,
    'pregnancy.lastMenstrualPeriodDate':
      params.episode.lastMenstrualPeriodDate === null
        ? NOT_RECORDED
        : toDateOnly(params.episode.lastMenstrualPeriodDate),
    'pregnancy.estimatedDeliveryDate': toDateOnly(params.episode.estimatedDeliveryDate),
    'pregnancy.gestationalAge': `${gestationalAge.weeks} minggu ${gestationalAge.days} hari`,
    'pregnancy.gpa': `G${params.episode.gravida}P${params.episode.para}A${params.episode.abortus}`,
    'request.issuedAt': toDateOnly(params.asOf),
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
