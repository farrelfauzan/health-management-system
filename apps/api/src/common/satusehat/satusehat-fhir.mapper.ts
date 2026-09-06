import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { SatusehatError } from './satusehat.error';
import { resolveSatusehatConfig } from './satusehat.config';
import {
  SatusehatConditionMapInput,
  SatusehatEncounterMapInput,
  SatusehatEncounterStatusHistoryEntry,
  SatusehatFhirCondition,
  SatusehatFhirEncounter,
  SatusehatFhirMedication,
  SatusehatFhirMedicationDispense,
  SatusehatFhirMedicationRequest,
  SatusehatFhirObservation,
  SatusehatFhirProcedure,
  SatusehatFhirReference,
  SatusehatMedicationDispenseMapInput,
  SatusehatMedicationMapInput,
  SatusehatMedicationRequestMapInput,
  SatusehatProcedureMapInput,
  SatusehatVitalSignField,
  SatusehatVitalSignsMapInput,
} from './satusehat-fhir.types';
import { SatusehatConfig } from './satusehat.types';

const ENCOUNTER_IDENTIFIER_SYSTEM_PREFIX = 'http://sys-ids.kemkes.go.id/encounter';
const ICD10_SYSTEM = 'http://hl7.org/fhir/sid/icd-10';
const ICD9CM_SYSTEM = 'http://hl7.org/fhir/sid/icd-9-cm';
const PROCEDURE_IDENTIFIER_SYSTEM_PREFIX = 'http://sys-ids.kemkes.go.id/procedure';
const LOINC_SYSTEM = 'http://loinc.org';
const UCUM_SYSTEM = 'http://unitsofmeasure.org';
const ACT_ENCOUNTER_CODE_SYSTEM = 'http://terminology.hl7.org/CodeSystem/v3-ActCode';
const PARTICIPATION_TYPE_SYSTEM = 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType';
const CONDITION_CLINICAL_SYSTEM = 'http://terminology.hl7.org/CodeSystem/condition-clinical';
const CONDITION_CATEGORY_SYSTEM = 'http://terminology.hl7.org/CodeSystem/condition-category';
const DIAGNOSIS_ROLE_SYSTEM = 'http://terminology.hl7.org/CodeSystem/diagnosis-role';
const OBSERVATION_CATEGORY_SYSTEM = 'http://terminology.hl7.org/CodeSystem/observation-category';
const KFA_SYSTEM = 'http://sys-ids.kemkes.go.id/kfa';
const MEDICATION_IDENTIFIER_SYSTEM_PREFIX = 'http://sys-ids.kemkes.go.id/medication';
const PRESCRIPTION_IDENTIFIER_SYSTEM_PREFIX = 'http://sys-ids.kemkes.go.id/prescription';
const PRESCRIPTION_ITEM_IDENTIFIER_SYSTEM_PREFIX = 'http://sys-ids.kemkes.go.id/prescription-item';
const MEDICATION_DISPENSE_IDENTIFIER_SYSTEM_PREFIX =
  'http://sys-ids.kemkes.go.id/medicationdispense';
const MEDICATION_TYPE_EXTENSION_URL =
  'https://fhir.kemkes.go.id/r4/StructureDefinition/MedicationType';
const MEDICATION_TYPE_SYSTEM = 'https://terminology.kemkes.go.id/CodeSystem/medication-type';

type VitalSignDefinition = {
  field: SatusehatVitalSignField;
  loincCode: string;
  loincDisplay: string;
  unit: string;
  ucumCode: string;
};

/**
 * LOINC and UCUM codings for the fixed-unit vital-sign columns. This table is
 * the only place the codes exist — the database deliberately stores none
 * (`P8-T02`), so a coding correction is an adapter change, not a migration.
 */
const VITAL_SIGN_DEFINITIONS: readonly VitalSignDefinition[] = [
  { field: 'heightCm', loincCode: '8302-2', loincDisplay: 'Body height', unit: 'cm', ucumCode: 'cm' },
  { field: 'weightKg', loincCode: '29463-7', loincDisplay: 'Body weight', unit: 'kg', ucumCode: 'kg' },
  { field: 'systolicBloodPressure', loincCode: '8480-6', loincDisplay: 'Systolic blood pressure', unit: 'mmHg', ucumCode: 'mm[Hg]' },
  { field: 'diastolicBloodPressure', loincCode: '8462-4', loincDisplay: 'Diastolic blood pressure', unit: 'mmHg', ucumCode: 'mm[Hg]' },
  { field: 'pulseRate', loincCode: '8867-4', loincDisplay: 'Heart rate', unit: 'beats/minute', ucumCode: '/min' },
  { field: 'respiratoryRate', loincCode: '9279-1', loincDisplay: 'Respiratory rate', unit: 'breaths/minute', ucumCode: '/min' },
  { field: 'temperatureCelsius', loincCode: '8310-5', loincDisplay: 'Body temperature', unit: 'C', ucumCode: 'Cel' },
  { field: 'oxygenSaturation', loincCode: '2708-6', loincDisplay: 'Oxygen saturation in Arterial blood', unit: '%', ucumCode: '%' },
];

/**
 * Maps closed HMS clinical records to the FHIR R4 resources SATUSEHAT
 * accepts. Pure translation: no I/O, no persistence, and timestamps are
 * emitted as UTC instants (`Z` suffix), which FHIR defines as equivalent to
 * any offset form. The submission pipeline (`P10-T04`) assembles these into a
 * transaction bundle and owns reference wiring between entries.
 */
@Injectable()
export class SatusehatFhirMapper {
  private readonly satusehatConfig: SatusehatConfig;

  constructor(configService: ConfigService) {
    this.satusehatConfig = resolveSatusehatConfig(configService);
  }

  /**
   * Maps a finished encounter to a SATUSEHAT Encounter. The mandated
   * arrived/in-progress/finished status history is derived from the
   * registration check-in and the encounter open/close timestamps.
   */
  mapEncounter(input: SatusehatEncounterMapInput): SatusehatFhirEncounter {
    const organizationId = this.requireConfigValue(
      this.satusehatConfig.organizationId,
      'SATUSEHAT_ORGANIZATION_ID',
    );
    const locationId = this.requireConfigValue(
      this.satusehatConfig.locationId,
      'SATUSEHAT_LOCATION_ID',
    );
    return {
      resourceType: 'Encounter',
      identifier: [
        {
          system: `${ENCOUNTER_IDENTIFIER_SYSTEM_PREFIX}/${organizationId}`,
          use: 'official',
          value: input.encounterId,
        },
      ],
      status: 'finished',
      class: { system: ACT_ENCOUNTER_CODE_SYSTEM, code: 'AMB', display: 'ambulatory' },
      subject: this.buildReference(`Patient/${input.patientIhsNumber}`, input.patientName),
      participant: [
        {
          type: [
            {
              coding: [{ system: PARTICIPATION_TYPE_SYSTEM, code: 'ATND', display: 'attender' }],
            },
          ],
          individual: this.buildReference(
            `Practitioner/${input.practitionerIhsNumber}`,
            input.practitionerName,
          ),
        },
      ],
      period: {
        start: this.toFhirInstant(this.resolveArrivedAt(input)),
        end: this.toFhirInstant(input.endedAt),
      },
      location: [
        {
          location: this.buildReference(
            `Location/${locationId}`,
            this.satusehatConfig.locationName,
          ),
        },
      ],
      statusHistory: this.buildStatusHistory(input),
      ...this.buildEncounterDiagnosis(input),
      serviceProvider: { reference: `Organization/${organizationId}` },
    };
  }

  /**
   * Maps a signed diagnosis snapshot to a SATUSEHAT Condition. The code and
   * display are the stored snapshot, never a catalog re-read.
   */
  mapDiagnosisToCondition(input: SatusehatConditionMapInput): SatusehatFhirCondition {
    return {
      resourceType: 'Condition',
      clinicalStatus: {
        coding: [{ system: CONDITION_CLINICAL_SYSTEM, code: 'active', display: 'Active' }],
      },
      category: [
        {
          coding: [
            {
              system: CONDITION_CATEGORY_SYSTEM,
              code: 'encounter-diagnosis',
              display: 'Encounter Diagnosis',
            },
          ],
        },
      ],
      code: {
        coding: [{ system: ICD10_SYSTEM, code: input.icd10Code, display: input.icd10Display }],
      },
      subject: this.buildReference(`Patient/${input.patientIhsNumber}`, input.patientName),
      encounter: { reference: input.encounterReference },
      recordedDate: this.toFhirInstant(input.recordedAt),
    };
  }

  /**
   * Maps one ICD-9-CM-coded procedure to a SATUSEHAT Procedure. `category` is
   * optional in the IG and the ICD-9-CM catalog carries no category column, so
   * it is omitted rather than invented. The performer is the attending doctor;
   * `recordedById` is a `User`, not a practitioner, and is never sent. Callers
   * must skip free-text procedures (no `icd9cmCodeId`) and report the gap.
   */
  mapProcedure(input: SatusehatProcedureMapInput): SatusehatFhirProcedure {
    const organizationId = this.requireConfigValue(
      this.satusehatConfig.organizationId,
      'SATUSEHAT_ORGANIZATION_ID',
    );
    const performedAt = this.clampToEncounterPeriod(input);
    return {
      resourceType: 'Procedure',
      identifier: [
        {
          system: `${PROCEDURE_IDENTIFIER_SYSTEM_PREFIX}/${organizationId}`,
          use: 'official',
          value: input.procedureId,
        },
      ],
      status: 'completed',
      code: {
        coding: [
          { system: ICD9CM_SYSTEM, code: input.icd9cmCode, display: input.icd9cmDisplay },
        ],
      },
      subject: this.buildReference(`Patient/${input.patientIhsNumber}`, input.patientName),
      encounter: { reference: input.encounterReference },
      performedPeriod: {
        start: this.toFhirInstant(performedAt),
        end: this.toFhirInstant(performedAt),
      },
      ...(input.practitionerIhsNumber
        ? {
            performer: [
              {
                actor: this.buildReference(
                  `Practitioner/${input.practitionerIhsNumber}`,
                  input.practitionerName,
                ),
              },
            ],
          }
        : {}),
      ...(input.notes && input.notes.trim() !== '' ? { note: [{ text: input.notes }] } : {}),
    };
  }

  /**
   * Maps one vital-signs row to LOINC-coded Observations — one resource per
   * measured column, skipping nulls, so a front-desk row with only weight and
   * blood pressure submits exactly three observations.
   */
  mapVitalSignsToObservations(input: SatusehatVitalSignsMapInput): SatusehatFhirObservation[] {
    return VITAL_SIGN_DEFINITIONS.flatMap((definition) => {
      const measuredValue = input[definition.field];
      if (measuredValue === null) {
        return [];
      }
      return [this.buildObservation(input, definition, measuredValue)];
    });
  }

  /**
   * Maps one KFA-coded catalog medication to a SATUSEHAT Medication. Callers
   * must skip catalog rows without a `kfaCode` — the platform only accepts
   * KFA-coded products — and report the gap.
   */
  mapMedicationToResource(input: SatusehatMedicationMapInput): SatusehatFhirMedication {
    const organizationId = this.requireConfigValue(
      this.satusehatConfig.organizationId,
      'SATUSEHAT_ORGANIZATION_ID',
    );
    return {
      resourceType: 'Medication',
      identifier: [
        {
          system: `${MEDICATION_IDENTIFIER_SYSTEM_PREFIX}/${organizationId}`,
          use: 'official',
          value: input.medicationCode,
        },
      ],
      status: 'active',
      code: { coding: [{ system: KFA_SYSTEM, code: input.kfaCode, display: input.name }] },
      extension: [
        {
          url: MEDICATION_TYPE_EXTENSION_URL,
          valueCodeableConcept: {
            coding: [{ system: MEDICATION_TYPE_SYSTEM, code: 'NC', display: 'Non-compound' }],
          },
        },
      ],
    };
  }

  /**
   * Maps one prescription line to a MedicationRequest. Dosage stays textual —
   * the record stores free-text dosage/frequency, and inventing structured
   * timing from prose would assert precision the record does not carry.
   */
  mapPrescriptionItemToMedicationRequest(
    input: SatusehatMedicationRequestMapInput,
  ): SatusehatFhirMedicationRequest {
    const organizationId = this.requireConfigValue(
      this.satusehatConfig.organizationId,
      'SATUSEHAT_ORGANIZATION_ID',
    );
    return {
      resourceType: 'MedicationRequest',
      identifier: [
        {
          system: `${PRESCRIPTION_IDENTIFIER_SYSTEM_PREFIX}/${organizationId}`,
          use: 'official',
          value: input.prescriptionId,
        },
        {
          system: `${PRESCRIPTION_ITEM_IDENTIFIER_SYSTEM_PREFIX}/${organizationId}`,
          use: 'official',
          value: input.prescriptionItemId,
        },
      ],
      status: 'completed',
      intent: 'order',
      medicationReference: this.buildReference(input.medicationReference, input.medicationDisplay),
      subject: this.buildReference(`Patient/${input.patientIhsNumber}`, input.patientName),
      encounter: { reference: input.encounterReference },
      requester: this.buildReference(
        `Practitioner/${input.practitionerIhsNumber}`,
        input.practitionerName,
      ),
      ...(input.authoredOn ? { authoredOn: this.toFhirInstant(input.authoredOn) } : {}),
      dosageInstruction: [{ sequence: 1, text: this.buildDosageText(input) }],
      dispenseRequest: {
        quantity: { value: input.quantity, ...(input.unit ? { unit: input.unit } : {}) },
      },
      substitution: { allowedBoolean: false },
    };
  }

  /**
   * Maps one dispensed line to a MedicationDispense. The performer is the
   * clinic Organization, not a Practitioner: the dispensing pharmacist is a
   * system user without an IHS practitioner number, and naming the attending
   * doctor instead would falsify who handed the medication over.
   */
  mapDispenseItemToMedicationDispense(
    input: SatusehatMedicationDispenseMapInput,
  ): SatusehatFhirMedicationDispense {
    const organizationId = this.requireConfigValue(
      this.satusehatConfig.organizationId,
      'SATUSEHAT_ORGANIZATION_ID',
    );
    return {
      resourceType: 'MedicationDispense',
      identifier: [
        {
          system: `${MEDICATION_DISPENSE_IDENTIFIER_SYSTEM_PREFIX}/${organizationId}`,
          use: 'official',
          value: input.dispenseRecordId,
        },
        {
          system: `${PRESCRIPTION_ITEM_IDENTIFIER_SYSTEM_PREFIX}/${organizationId}`,
          use: 'official',
          value: input.dispenseItemId,
        },
      ],
      status: 'completed',
      medicationReference: this.buildReference(input.medicationReference, input.medicationDisplay),
      subject: this.buildReference(`Patient/${input.patientIhsNumber}`, input.patientName),
      context: { reference: input.encounterReference },
      performer: [{ actor: { reference: `Organization/${organizationId}` } }],
      ...(input.medicationRequestReference
        ? { authorizingPrescription: [{ reference: input.medicationRequestReference }] }
        : {}),
      quantity: { value: input.quantity, ...(input.unit ? { unit: input.unit } : {}) },
      whenHandedOver: this.toFhirInstant(input.dispensedAt),
      substitution: { wasSubstituted: false },
    };
  }

  private buildDosageText(input: SatusehatMedicationRequestMapInput): string {
    const parts = [input.dosage, input.frequency, input.instructions].filter(
      (part): part is string => part !== undefined && part !== null && part.trim() !== '',
    );
    return parts.join(', ');
  }

  private buildObservation(
    input: SatusehatVitalSignsMapInput,
    definition: VitalSignDefinition,
    measuredValue: number,
  ): SatusehatFhirObservation {
    return {
      resourceType: 'Observation',
      status: 'final',
      category: [
        {
          coding: [
            { system: OBSERVATION_CATEGORY_SYSTEM, code: 'vital-signs', display: 'Vital Signs' },
          ],
        },
      ],
      code: {
        coding: [
          { system: LOINC_SYSTEM, code: definition.loincCode, display: definition.loincDisplay },
        ],
      },
      subject: { reference: `Patient/${input.patientIhsNumber}` },
      encounter: { reference: input.encounterReference },
      effectiveDateTime: this.toFhirInstant(input.recordedAt),
      ...(input.practitionerIhsNumber
        ? { performer: [{ reference: `Practitioner/${input.practitionerIhsNumber}` }] }
        : {}),
      valueQuantity: {
        value: measuredValue,
        unit: definition.unit,
        system: UCUM_SYSTEM,
        code: definition.ucumCode,
      },
    };
  }

  private buildStatusHistory(
    input: SatusehatEncounterMapInput,
  ): SatusehatEncounterStatusHistoryEntry[] {
    const arrivedAt = this.resolveArrivedAt(input);
    return [
      {
        status: 'arrived',
        period: { start: this.toFhirInstant(arrivedAt), end: this.toFhirInstant(input.startedAt) },
      },
      {
        status: 'in-progress',
        period: {
          start: this.toFhirInstant(input.startedAt),
          end: this.toFhirInstant(input.endedAt),
        },
      },
      {
        status: 'finished',
        period: { start: this.toFhirInstant(input.endedAt), end: this.toFhirInstant(input.endedAt) },
      },
    ];
  }

  private buildEncounterDiagnosis(
    input: SatusehatEncounterMapInput,
  ): Pick<SatusehatFhirEncounter, 'diagnosis'> | Record<string, never> {
    if (!input.conditionReferences || input.conditionReferences.length === 0) {
      return {};
    }
    return {
      diagnosis: input.conditionReferences.map((conditionReference) => ({
        condition: { reference: conditionReference.reference },
        use: {
          coding: [{ system: DIAGNOSIS_ROLE_SYSTEM, code: 'DD', display: 'Discharge diagnosis' }],
        },
        rank: conditionReference.rank,
      })),
    };
  }

  /**
   * A procedure stamped outside the visit it belongs to (backdated entry,
   * clock skew) would produce a period the platform rejects against the
   * referenced Encounter — clamp it into the encounter period, as check-in is
   * clamped in `resolveArrivedAt`.
   */
  private clampToEncounterPeriod(input: SatusehatProcedureMapInput): Date {
    if (input.performedAt.getTime() < input.encounterStartedAt.getTime()) {
      return input.encounterStartedAt;
    }
    if (input.performedAt.getTime() > input.encounterEndedAt.getTime()) {
      return input.encounterEndedAt;
    }
    return input.performedAt;
  }

  /**
   * A check-in stamped after the encounter opened (clock skew, backfilled
   * data) would produce an inverted `arrived` period, which the platform
   * rejects — clamp to the encounter start instead.
   */
  private resolveArrivedAt(input: SatusehatEncounterMapInput): Date {
    return input.arrivedAt.getTime() > input.startedAt.getTime()
      ? input.startedAt
      : input.arrivedAt;
  }

  private buildReference(reference: string, display?: string): SatusehatFhirReference {
    return { reference, ...(display ? { display } : {}) };
  }

  private toFhirInstant(timestamp: Date): string {
    return timestamp.toISOString();
  }

  private requireConfigValue(value: string | undefined, key: string): string {
    if (value === undefined || value === '') {
      throw new SatusehatError(
        'SATUSEHAT_NOT_CONFIGURED',
        `SATUSEHAT FHIR mapping requires ${key} to be configured`,
      );
    }
    return value;
  }
}
