import {
  ResolveSatusehatImmunizationEntryInput,
  SatusehatImmunizationEntryResolution,
  SatusehatImmunizationPerformer,
  SatusehatSubmissionImmunization,
} from '@hms/shared-types';

/**
 * Decides whether one vaccination row can go into the visit's bundle, and
 * under which name it is left out when it cannot (P24-T12).
 *
 * SATUSEHAT refuses an Immunization without `protocolApplied` (RuleNumber
 * 10450) or `reasonCode` (10105), and one refused resource fails the whole
 * transaction, so a legacy row missing either is skipped rather than sent
 * with an invented value. The performer is the clinician named on the row:
 * the attending doctor by default, otherwise whoever gave the dose — a
 * midwife's dose reported under the doctor would be attributed to the wrong
 * person. A named performer with no practitioner id cannot be referenced, so
 * that row is skipped too, and the skip says why.
 */
export function resolveSatusehatImmunizationEntry(
  input: ResolveSatusehatImmunizationEntryInput,
): SatusehatImmunizationEntryResolution {
  const { immunization } = input;
  if (immunization.kfaCode === null) {
    return { skipReason: 'NO_KFA_CODE', immunization: null };
  }
  if (immunization.doseNumber === null) {
    return { skipReason: 'IMMUNIZATION_DOSE_NUMBER_MISSING', immunization: null };
  }
  if (immunization.reason === null) {
    return { skipReason: 'IMMUNIZATION_REASON_MISSING', immunization: null };
  }
  const performer = resolvePerformer(input);
  if (performer === null) {
    return { skipReason: 'IMMUNIZATION_PERFORMER_UNLINKED', immunization: null };
  }
  return {
    skipReason: null,
    immunization: {
      ...immunization,
      kfaCode: immunization.kfaCode,
      doseNumber: immunization.doseNumber,
      reason: immunization.reason,
      performer,
    },
  };
}

/**
 * The attending doctor's number is the one already resolved for the
 * Encounter — it may have been auto-linked moments ago, in which case the
 * row's own copy is still null. Anyone else must already be linked.
 */
function resolvePerformer(
  input: ResolveSatusehatImmunizationEntryInput,
): SatusehatImmunizationPerformer | null {
  const { immunization } = input;
  if (isPerformedByAttendingDoctor(immunization, input.encounterDoctorId)) {
    return { ihsNumber: input.encounterPractitionerIhsNumber, name: input.encounterDoctorName };
  }
  if (immunization.performerIhsNumber === null) {
    return null;
  }
  return { ihsNumber: immunization.performerIhsNumber, name: immunization.performerName ?? '' };
}

function isPerformedByAttendingDoctor(
  immunization: SatusehatSubmissionImmunization,
  encounterDoctorId: string,
): boolean {
  return immunization.performerId === null || immunization.performerId === encounterDoctorId;
}
