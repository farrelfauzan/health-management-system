import { SatusehatDischargeDisposition, SatusehatDischargeDispositionInput } from '@hms/shared-types';

const HL7_DISCHARGE_DISPOSITION_SYSTEM =
  'http://terminology.hl7.org/CodeSystem/discharge-disposition';
/**
 * A death is coded from the Kemenkes list rather than HL7's, which has no
 * under/over-48-hour split (PRD §13.1).
 */
const KEMKES_DISCHARGE_DISPOSITION_SYSTEM =
  'http://terminology.kemkes.go.id/CodeSystem/discharge-disposition';
const HOURS_BEFORE_LONG_STAY_DEATH = 48;
const MILLISECONDS_PER_HOUR = 60 * 60 * 1000;

/**
 * The coding an inpatient stay's `hospitalization.dischargeDisposition`
 * carries (P24-T08, FR-IP-02).
 *
 * A stay with no recorded disposition is reported as `home`: that is what
 * D-030 already sent for it, and every such row was discharged before staff
 * had anywhere to say otherwise. Inventing a different code for it now would
 * rewrite history rather than record it.
 *
 * `DIED` is the one value the clinic does not decide: SATUSEHAT wants to know
 * whether the death fell under or over 48 hours from admission, which the two
 * timestamps already answer.
 */
export function resolveSatusehatDischargeDisposition(
  input: SatusehatDischargeDispositionInput,
): SatusehatDischargeDisposition {
  if (input.disposition === 'DIED') {
    return resolveDeathDisposition(input);
  }
  if (input.disposition === 'AGAINST_ADVICE') {
    return { system: HL7_DISCHARGE_DISPOSITION_SYSTEM, code: 'aadvice', display: 'Left against advice' };
  }
  if (input.disposition === 'REFERRED') {
    return {
      system: HL7_DISCHARGE_DISPOSITION_SYSTEM,
      code: 'other-hcf',
      display: 'Other healthcare facility',
    };
  }
  if (input.disposition === 'OTHER') {
    return { system: HL7_DISCHARGE_DISPOSITION_SYSTEM, code: 'oth', display: 'Other' };
  }
  return { system: HL7_DISCHARGE_DISPOSITION_SYSTEM, code: 'home', display: 'Home' };
}

function resolveDeathDisposition(
  input: SatusehatDischargeDispositionInput,
): SatusehatDischargeDisposition {
  const stayHours =
    (input.dischargedAt.getTime() - input.admittedAt.getTime()) / MILLISECONDS_PER_HOUR;
  return stayHours < HOURS_BEFORE_LONG_STAY_DEATH
    ? {
        system: KEMKES_DISCHARGE_DISPOSITION_SYSTEM,
        code: 'exp-lt48h',
        display: 'Meninggal kurang dari 48 jam',
      }
    : {
        system: KEMKES_DISCHARGE_DISPOSITION_SYSTEM,
        code: 'exp-gt48h',
        display: 'Meninggal lebih dari 48 jam',
      };
}
