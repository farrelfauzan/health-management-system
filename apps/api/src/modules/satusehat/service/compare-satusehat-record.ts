import {
  SatusehatHeldResource,
  SatusehatRecordComparisonInput,
  SatusehatRecordLine,
  SatusehatSubmissionMedication,
  SatusehatSubmissionProcedure,
} from '@hms/shared-types';

import { SATUSEHAT_VITAL_SIGN_DEFINITIONS } from '../../../common/satusehat/satusehat-vital-sign-definitions';

const ICD10_SYSTEM = 'http://hl7.org/fhir/sid/icd-10';
const ICD9CM_SYSTEM = 'http://hl7.org/fhir/sid/icd-9-cm';
const LOINC_SYSTEM = 'http://loinc.org';
const KFA_SYSTEM = 'http://sys-ids.kemkes.go.id/kfa';
/** Vital signs are stored to at most two decimals, so closer than this is equal. */
const VALUE_TOLERANCE = 0.005;

type HeldCode = {
  display: string;
  value: number | null;
};

/** Reads `{system, code, display}` codings off a resource of unknown shape. */
function readCodings(resource: SatusehatHeldResource): Array<{
  system: string;
  code: string;
  display: string;
}> {
  const concept = resource.code;
  if (typeof concept !== 'object' || concept === null) {
    return [];
  }
  const coding = (concept as { coding?: unknown }).coding;
  if (!Array.isArray(coding)) {
    return [];
  }
  return coding.flatMap((entry: unknown) => {
    if (typeof entry !== 'object' || entry === null) {
      return [];
    }
    const { system, code, display } = entry as Record<string, unknown>;
    return typeof system === 'string' && typeof code === 'string'
      ? [{ system, code, display: typeof display === 'string' ? display : code }]
      : [];
  });
}

function readQuantityValue(resource: SatusehatHeldResource): number | null {
  const quantity = resource.valueQuantity;
  if (typeof quantity !== 'object' || quantity === null) {
    return null;
  }
  const value = (quantity as { value?: unknown }).value;
  return typeof value === 'number' ? value : null;
}

/**
 * Every code SATUSEHAT holds for one resource type in one code system. Keyed by
 * code rather than by resource id, because the comparison is about what the
 * national record says, and SATUSEHAT holds no local id for a Condition or an
 * Observation (P21-T01).
 */
function collectHeldCodes(input: {
  held: readonly SatusehatHeldResource[];
  resourceType: string;
  system: string;
}): Map<string, HeldCode> {
  const codes = new Map<string, HeldCode>();
  for (const resource of input.held) {
    if (resource.resourceType !== input.resourceType) {
      continue;
    }
    const coding = readCodings(resource).find((entry) => entry.system === input.system);
    if (coding !== undefined && !codes.has(coding.code)) {
      codes.set(coding.code, { display: coding.display, value: readQuantityValue(resource) });
    }
  }
  return codes;
}

/**
 * Lines for codes SATUSEHAT holds that the local record no longer has — a
 * diagnosis removed after the visit was reported, say. `DIFFERS` rather than an
 * outcome of its own: the two records disagree, and the fix is the same kind of
 * decision as any other disagreement.
 */
function buildHeldOnlyLines(
  category: SatusehatRecordLine['category'],
  held: ReadonlyMap<string, HeldCode>,
  localCodes: ReadonlySet<string>,
): SatusehatRecordLine[] {
  return [...held]
    .filter(([code]) => !localCodes.has(code))
    .map(([code, entry]) => ({
      category,
      code,
      display: entry.display,
      ours: null,
      satusehat: entry.display,
      outcome: 'DIFFERS',
      notSentReason: null,
    }));
}

function compareDiagnoses(input: SatusehatRecordComparisonInput): SatusehatRecordLine[] {
  const held = collectHeldCodes({ held: input.held, resourceType: 'Condition', system: ICD10_SYSTEM });
  const localCodes = new Set(input.diagnoses.map((diagnosis) => diagnosis.code));
  const local = input.diagnoses.map<SatusehatRecordLine>((diagnosis) => {
    const heldEntry = held.get(diagnosis.code);
    return {
      category: 'DIAGNOSIS',
      code: diagnosis.code,
      display: diagnosis.display,
      ours: diagnosis.display,
      satusehat: heldEntry?.display ?? null,
      outcome: heldEntry === undefined ? 'MISSING_ON_SATUSEHAT' : 'MATCHES',
      notSentReason: null,
    };
  });
  return [...local, ...buildHeldOnlyLines('DIAGNOSIS', held, localCodes)];
}

/**
 * Compared by value as well as by code: a blood pressure SATUSEHAT holds as
 * 130 mm[Hg] when the local record says 120 is exactly the disagreement a
 * doctor needs to see. Units are taken from the shared LOINC table the mapper
 * sends under, so both sides describe the reading the same way.
 */
function compareVitalSigns(input: SatusehatRecordComparisonInput): SatusehatRecordLine[] {
  const held = collectHeldCodes({ held: input.held, resourceType: 'Observation', system: LOINC_SYSTEM });
  const vitals = input.latestVitalSigns;
  return SATUSEHAT_VITAL_SIGN_DEFINITIONS.flatMap<SatusehatRecordLine>((definition) => {
    const localValue = vitals === null ? null : vitals[definition.field];
    const heldEntry = held.get(definition.loincCode);
    if (localValue === null && heldEntry === undefined) {
      return [];
    }
    const heldValue = heldEntry?.value ?? null;
    const isEqual =
      localValue !== null && heldValue !== null && Math.abs(localValue - heldValue) < VALUE_TOLERANCE;
    return [
      {
        category: 'VITAL_SIGN',
        code: definition.loincCode,
        display: definition.loincDisplay,
        ours: localValue === null ? null : `${localValue} ${definition.unit}`,
        satusehat: heldValue === null ? null : `${heldValue} ${definition.unit}`,
        outcome: heldEntry === undefined ? 'MISSING_ON_SATUSEHAT' : isEqual ? 'MATCHES' : 'DIFFERS',
        notSentReason: null,
      },
    ];
  });
}

function compareProcedures(input: SatusehatRecordComparisonInput): SatusehatRecordLine[] {
  const held = collectHeldCodes({ held: input.held, resourceType: 'Procedure', system: ICD9CM_SYSTEM });
  const coded = input.procedures.filter((procedure) => procedure.isCoded);
  const localCodes = new Set(coded.map((procedure) => procedure.code));
  const local = input.procedures.map((procedure) => toProcedureLine(procedure, held));
  return [...local, ...buildHeldOnlyLines('PROCEDURE', held, localCodes)];
}

/**
 * An uncoded procedure is named, with its reason: the doctor may see what the
 * item was, and the fix is an ICD-9-CM code only the clinic can add.
 */
function toProcedureLine(
  procedure: SatusehatSubmissionProcedure,
  held: ReadonlyMap<string, HeldCode>,
): SatusehatRecordLine {
  if (!procedure.isCoded) {
    return {
      category: 'PROCEDURE',
      code: null,
      display: procedure.display,
      ours: procedure.display,
      satusehat: null,
      outcome: 'NOT_SENT',
      notSentReason: 'NO_ICD9CM_CODE',
    };
  }
  const heldEntry = held.get(procedure.code);
  return {
    category: 'PROCEDURE',
    code: procedure.code,
    display: procedure.display,
    ours: procedure.display,
    satusehat: heldEntry?.display ?? null,
    outcome: heldEntry === undefined ? 'MISSING_ON_SATUSEHAT' : 'MATCHES',
    notSentReason: null,
  };
}

function compareMedications(input: SatusehatRecordComparisonInput): SatusehatRecordLine[] {
  const held = collectHeldCodes({ held: input.held, resourceType: 'Medication', system: KFA_SYSTEM });
  const unique = [
    ...new Map(input.medications.map((medication) => [medication.medicationId, medication])).values(),
  ];
  const localCodes = new Set(
    unique.flatMap((medication) => (medication.kfaCode === null ? [] : [medication.kfaCode])),
  );
  const local = unique.map((medication) => toMedicationLine(medication, held));
  return [...local, ...buildHeldOnlyLines('MEDICATION', held, localCodes)];
}

function toMedicationLine(
  medication: SatusehatSubmissionMedication,
  held: ReadonlyMap<string, HeldCode>,
): SatusehatRecordLine {
  if (medication.kfaCode === null) {
    return {
      category: 'MEDICATION',
      code: null,
      display: medication.name,
      ours: medication.name,
      satusehat: null,
      outcome: 'NOT_SENT',
      notSentReason: 'NO_KFA_CODE',
    };
  }
  const heldEntry = held.get(medication.kfaCode);
  return {
    category: 'MEDICATION',
    code: medication.kfaCode,
    display: medication.name,
    ours: medication.name,
    satusehat: heldEntry?.display ?? null,
    outcome: heldEntry === undefined ? 'MISSING_ON_SATUSEHAT' : 'MATCHES',
    notSentReason: null,
  };
}

/**
 * Lines up the local record of a visit against what SATUSEHAT holds for it
 * (P21-T04): diagnoses, vital signs, procedures and medications, each marked
 * `MATCHES`, `DIFFERS`, `MISSING_ON_SATUSEHAT` or `NOT_SENT`.
 *
 * Pure — no I/O — so every verdict is testable against resources recorded off
 * the live platform. Matching is by code in the system the mapper sends under,
 * never by `status`: `Condition` carries no `status` at all, only
 * `clinicalStatus` (P21-T01), and comparing on it would mark every diagnosis as
 * differing.
 *
 * `held` is only what was actually found. A `MISSING_ON_SATUSEHAT` verdict is
 * therefore as reliable as the reads behind it; the caller reports reads that
 * failed so the screen does not present an unanswered question as a finding.
 */
export function compareSatusehatRecord(input: SatusehatRecordComparisonInput): SatusehatRecordLine[] {
  return [
    ...compareDiagnoses(input),
    ...compareVitalSigns(input),
    ...compareProcedures(input),
    ...compareMedications(input),
  ];
}
