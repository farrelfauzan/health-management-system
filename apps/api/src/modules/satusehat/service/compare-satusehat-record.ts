import {
  SatusehatHeldCode,
  SatusehatHeldResource,
  SatusehatLabReportItem,
  SatusehatLabReportResult,
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

/** Reads `{system, code, display}` codings off a resource of unknown shape. */
function readCodings(
  resource: SatusehatHeldResource,
): Array<{ system: string; code: string; display: string }> {
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

function readStringField(source: unknown, field: string): string | null {
  if (typeof source !== 'object' || source === null) {
    return null;
  }
  const value = (source as Record<string, unknown>)[field];
  return typeof value === 'string' ? value : null;
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
 * The non-numeric value of an Observation: `valueString`, or the text of a
 * `valueCodeableConcept` — the two shapes a text or coded lab result is sent
 * in (P18-T09).
 */
function readValueText(resource: SatusehatHeldResource): string | null {
  return (
    readStringField(resource, 'valueString') ??
    readStringField(resource.valueCodeableConcept, 'text')
  );
}

function toHeldCode(resource: SatusehatHeldResource, display: string): SatusehatHeldCode {
  return {
    display,
    value: readQuantityValue(resource),
    unit: readStringField(resource.valueQuantity, 'unit'),
    valueText: readValueText(resource),
  };
}

/**
 * Every code SATUSEHAT holds for one resource type in one code system. Keyed by
 * code rather than by resource id, because the comparison is about what the
 * national record says, and SATUSEHAT holds no local id for a Condition or an
 * Observation (P21-T01). The first resource read for a code wins, which is why
 * the caller orders an amended lab report ahead of the one it corrects.
 */
function collectHeldCodes(input: {
  held: readonly SatusehatHeldResource[];
  resourceType: string;
  system: string;
}): Map<string, SatusehatHeldCode> {
  const codes = new Map<string, SatusehatHeldCode>();
  for (const resource of input.held) {
    if (resource.resourceType !== input.resourceType) {
      continue;
    }
    const coding = readCodings(resource).find((entry) => entry.system === input.system);
    if (coding !== undefined && !codes.has(coding.code)) {
      codes.set(coding.code, toHeldCode(resource, coding.display));
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
  held: ReadonlyMap<string, SatusehatHeldCode>,
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
  const held = collectHeldCodes({
    held: input.held,
    resourceType: 'Condition',
    system: ICD10_SYSTEM,
  });
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
  const held = collectHeldCodes({
    held: input.held,
    resourceType: 'Observation',
    system: LOINC_SYSTEM,
  });
  const vitals = input.latestVitalSigns;
  return SATUSEHAT_VITAL_SIGN_DEFINITIONS.flatMap<SatusehatRecordLine>((definition) => {
    const localValue = vitals === null ? null : vitals[definition.field];
    const heldEntry = held.get(definition.loincCode);
    if (localValue === null && heldEntry === undefined) {
      return [];
    }
    const heldValue = heldEntry?.value ?? null;
    const isEqual =
      localValue !== null &&
      heldValue !== null &&
      Math.abs(localValue - heldValue) < VALUE_TOLERANCE;
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
  const held = collectHeldCodes({
    held: input.held,
    resourceType: 'Procedure',
    system: ICD9CM_SYSTEM,
  });
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
  held: ReadonlyMap<string, SatusehatHeldCode>,
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
  const held = collectHeldCodes({
    held: input.held,
    resourceType: 'Medication',
    system: KFA_SYSTEM,
  });
  const unique = [
    ...new Map(
      input.medications.map((medication) => [medication.medicationId, medication]),
    ).values(),
  ];
  const localCodes = new Set(
    unique.flatMap((medication) => (medication.kfaCode === null ? [] : [medication.kfaCode])),
  );
  const local = unique.map((medication) => toMedicationLine(medication, held));
  return [...local, ...buildHeldOnlyLines('MEDICATION', held, localCodes)];
}

function toMedicationLine(
  medication: SatusehatSubmissionMedication,
  held: ReadonlyMap<string, SatusehatHeldCode>,
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

function formatLocalLabValue(result: SatusehatLabReportResult): string {
  if (result.valueNumeric !== null) {
    return result.unit ? `${result.valueNumeric} ${result.unit}` : String(result.valueNumeric);
  }
  return result.valueText ?? result.valueCoded ?? '';
}

function formatHeldLabValue(held: SatusehatHeldCode): string | null {
  if (held.value !== null) {
    return held.unit ? `${held.value} ${held.unit}` : String(held.value);
  }
  return held.valueText;
}

/**
 * A numeric result can come back as `valueString` — the mapper sends one when
 * the unit is not UCUM-codable (P18-T09) — so a number is compared as a number
 * whichever field holds it, and text is compared ignoring case and edge space.
 */
function isLabValueEqual(result: SatusehatLabReportResult, held: SatusehatHeldCode): boolean {
  if (result.valueNumeric !== null) {
    const heldText = held.valueText?.trim() ?? '';
    const heldNumber = held.value ?? (heldText.length > 0 ? Number(heldText) : Number.NaN);
    return (
      Number.isFinite(heldNumber) && Math.abs(result.valueNumeric - heldNumber) < VALUE_TOLERANCE
    );
  }
  const ours = (result.valueText ?? result.valueCoded ?? '').trim().toLowerCase();
  return held.valueText !== null && held.valueText.trim().toLowerCase() === ours;
}

/**
 * Lab results are driven from the local orders only. A lab Observation the
 * encounter holds with no local item behind it is not reported as a
 * disagreement, because the same LOINC table also codes vital signs and the
 * encounter's own resources arrive in the same list.
 */
function toLabResultLine(
  item: SatusehatLabReportItem,
  held: ReadonlyMap<string, SatusehatHeldCode>,
): SatusehatRecordLine {
  const base = { category: 'LAB_RESULT', display: item.testName } as const;
  if (item.result === null) {
    return {
      ...base,
      code: item.loincCode,
      ours: null,
      satusehat: null,
      outcome: 'NOT_SENT',
      notSentReason: 'NO_VERIFIED_RESULT',
    };
  }
  const ours = formatLocalLabValue(item.result);
  if (item.loincCode === null) {
    return {
      ...base,
      code: null,
      ours,
      satusehat: null,
      outcome: 'NOT_SENT',
      notSentReason: 'NO_LOINC_CODE',
    };
  }
  const heldEntry = held.get(item.loincCode);
  return {
    ...base,
    code: item.loincCode,
    ours,
    satusehat: heldEntry === undefined ? null : formatHeldLabValue(heldEntry),
    outcome:
      heldEntry === undefined
        ? 'MISSING_ON_SATUSEHAT'
        : isLabValueEqual(item.result, heldEntry)
          ? 'MATCHES'
          : 'DIFFERS',
    notSentReason: null,
  };
}

function compareLabResults(input: SatusehatRecordComparisonInput): SatusehatRecordLine[] {
  const held = collectHeldCodes({
    held: input.held,
    resourceType: 'Observation',
    system: LOINC_SYSTEM,
  });
  return input.labItems.map((item) => toLabResultLine(item, held));
}

/**
 * Lines up the local record of a visit against what SATUSEHAT holds for it
 * (P21-T04): diagnoses, vital signs, procedures, medications and lab results,
 * each marked `MATCHES`, `DIFFERS`, `MISSING_ON_SATUSEHAT` or `NOT_SENT`.
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
export function compareSatusehatRecord(
  input: SatusehatRecordComparisonInput,
): SatusehatRecordLine[] {
  return [
    ...compareDiagnoses(input),
    ...compareVitalSigns(input),
    ...compareProcedures(input),
    ...compareMedications(input),
    ...compareLabResults(input),
  ];
}
