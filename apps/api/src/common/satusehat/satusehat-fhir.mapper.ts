import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { escapeXhtml } from './escape-xhtml';
import { SatusehatError } from './satusehat.error';
import { resolveSatusehatConfig } from './satusehat.config';
import {
  SatusehatAllergyMapInput,
  SatusehatClinicalImpressionMapInput,
  SatusehatClinicalImpressionPrognosis,
  SatusehatCompositionMapInput,
  SatusehatCompositionSectionInput,
  SatusehatConditionMapInput,
  SatusehatEncounterMapInput,
  SatusehatEncounterStatusHistoryEntry,
  SatusehatFhirAllergyIntolerance,
  SatusehatFhirClinicalImpression,
  SatusehatFhirComposition,
  SatusehatFhirCompositionSection,
  SatusehatFhirEncounterHospitalization,
  SatusehatFhirCoding,
  SatusehatFhirCondition,
  SatusehatFhirImmunization,
  SatusehatFhirEncounter,
  SatusehatFhirMedication,
  SatusehatFhirMedicationDispense,
  SatusehatFhirMedicationRequest,
  SatusehatImmunizationMapInput,
  SatusehatFhirObservation,
  SatusehatFhirProcedure,
  SatusehatFhirReference,
  SatusehatMedicationDispenseMapInput,
  SatusehatCompoundMedicationMapInput,
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
const ALLERGY_IDENTIFIER_SYSTEM_PREFIX = 'http://sys-ids.kemkes.go.id/allergy';
const ALLERGY_CLINICAL_SYSTEM =
  'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical';
const ALLERGY_VERIFICATION_SYSTEM =
  'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification';
const COMPOSITION_IDENTIFIER_SYSTEM_PREFIX = 'http://sys-ids.kemkes.go.id/composition';
const CLINICAL_IMPRESSION_IDENTIFIER_SYSTEM_PREFIX =
  'http://sys-ids.kemkes.go.id/clinicalimpression';
const SNOMED_SYSTEM = 'http://snomed.info/sct';
const COMPOSITION_TYPE_LOINC_CODE = '18842-5';
const COMPOSITION_TYPE_LOINC_DISPLAY = 'Discharge summary';
const COMPOSITION_CATEGORY_LOINC_CODE = '34117-2';
const COMPOSITION_CATEGORY_LOINC_DISPLAY = 'History and physical note';
const COMPOSITION_TITLE = 'Resume Medis Rawat Jalan';
const XHTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';
const IMMUNIZATION_IDENTIFIER_SYSTEM_PREFIX = 'http://sys-ids.kemkes.go.id/immunization';
const ACT_SITE_SYSTEM = 'http://terminology.hl7.org/CodeSystem/v3-ActSite';
const ROUTE_OF_ADMINISTRATION_SYSTEM =
  'http://terminology.hl7.org/CodeSystem/v3-RouteOfAdministration';

/**
 * The HL7 v3 route codes for the five routes a klinik pratama actually uses.
 * Held here rather than in the database for the same reason the vital-sign
 * LOINC table is: a coding correction should be an adapter change, not a
 * migration.
 */
const IMMUNIZATION_ROUTE_CODES: Readonly<Record<string, { code: string; display: string }>> = {
  IM: { code: 'IM', display: 'Injection, intramuscular' },
  SC: { code: 'SQ', display: 'Injection, subcutaneous' },
  ID: { code: 'IDINJ', display: 'Injection, intradermal' },
  ORAL: { code: 'PO', display: 'Swallow, oral' },
  NASAL: { code: 'NASINHL', display: 'Inhalation, nasal' },
};

const IMMUNIZATION_SITE_CODES: Readonly<Record<string, { code: string; display: string }>> = {
  LEFT_ARM: { code: 'LA', display: 'Left arm' },
  RIGHT_ARM: { code: 'RA', display: 'Right arm' },
  LEFT_THIGH: { code: 'LT', display: 'Left thigh' },
  RIGHT_THIGH: { code: 'RT', display: 'Right thigh' },
  // No v3 code for "somewhere else": sending one would be inventing a site.
  OTHER: { code: '', display: '' },
};

/**
 * The three SNOMED prognosis grades the four recorded Latin terms map onto.
 * DUBIA_AD_MALAM and MALAM share `poor` — SNOMED offers no fourth grade — so
 * the recorded term is echoed in `text`, keeping the distinction the doctor
 * made visible even where the coding cannot carry it.
 */
const PROGNOSIS_SNOMED_CODES: Readonly<
  Record<SatusehatClinicalImpressionPrognosis, { code: string; display: string }>
> = {
  BONAM: { code: '170968001', display: 'Prognosis good' },
  DUBIA_AD_BONAM: { code: '170969009', display: 'Prognosis fair' },
  DUBIA_AD_MALAM: { code: '170970005', display: 'Prognosis poor' },
  MALAM: { code: '170970005', display: 'Prognosis poor' },
};

const LOINC_SYSTEM = 'http://loinc.org';
const UCUM_SYSTEM = 'http://unitsofmeasure.org';
const ACT_ENCOUNTER_CODE_SYSTEM = 'http://terminology.hl7.org/CodeSystem/v3-ActCode';
const PARTICIPATION_TYPE_SYSTEM = 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType';
const CONDITION_CLINICAL_SYSTEM = 'http://terminology.hl7.org/CodeSystem/condition-clinical';
const CONDITION_CATEGORY_SYSTEM = 'http://terminology.hl7.org/CodeSystem/condition-category';
const DIAGNOSIS_ROLE_SYSTEM = 'http://terminology.hl7.org/CodeSystem/diagnosis-role';
const OBSERVATION_CATEGORY_SYSTEM = 'http://terminology.hl7.org/CodeSystem/observation-category';
const DISCHARGE_DISPOSITION_SYSTEM =
  'http://terminology.hl7.org/CodeSystem/discharge-disposition';
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
   *
   * An encounter attached to an inpatient stay is reported as `IMP` over the
   * admission's own period, with a `hospitalization` element (P10-T09). An
   * outpatient visit stays `AMB` over the encounter's period. `EMER` is
   * deliberately absent: nothing in the registration types records an
   * emergency visit, and guessing one from a time of day would be a fiction.
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
      class: this.buildEncounterClass(input),
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
        end: this.toFhirInstant(this.resolveEndedAt(input)),
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
      ...this.buildHospitalization(input),
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
   * Maps one recorded allergy to a SATUSEHAT AllergyIntolerance.
   *
   * The coding is **text-first**: `substance` is free text in the record, FHIR
   * permits `code.text` with no coding, and the IG only *prefers* SNOMED CT.
   * Emitting `text` is therefore truthful where guessing a SNOMED code from
   * prose would not be — a wrong allergen code is worse than an uncoded one,
   * because the next clinic would act on it.
   *
   * `category` (food / medication / environment) is omitted: the row does not
   * record it, and a keyword heuristic over free text would be inventing
   * clinical classification. `verificationStatus` is `confirmed` because a
   * clinician wrote the row down; nothing in the system records an unverified
   * allergy.
   */
  mapAllergyToAllergyIntolerance(
    input: SatusehatAllergyMapInput,
  ): SatusehatFhirAllergyIntolerance {
    const organizationId = this.requireConfigValue(
      this.satusehatConfig.organizationId,
      'SATUSEHAT_ORGANIZATION_ID',
    );
    return {
      resourceType: 'AllergyIntolerance',
      identifier: [
        {
          system: `${ALLERGY_IDENTIFIER_SYSTEM_PREFIX}/${organizationId}`,
          use: 'official',
          value: input.allergyId,
        },
      ],
      clinicalStatus: {
        coding: [{ system: ALLERGY_CLINICAL_SYSTEM, code: 'active', display: 'Active' }],
      },
      verificationStatus: {
        coding: [{ system: ALLERGY_VERIFICATION_SYSTEM, code: 'confirmed', display: 'Confirmed' }],
      },
      code: { text: input.substance },
      criticality: input.severity === 'SEVERE' ? 'high' : 'low',
      patient: this.buildReference(`Patient/${input.patientIhsNumber}`, input.patientName),
      ...(input.encounterReference ? { encounter: { reference: input.encounterReference } } : {}),
      recordedDate: this.toFhirInstant(input.recordedAt),
      ...(input.recorderIhsNumber
        ? {
            recorder: this.buildReference(
              `Practitioner/${input.recorderIhsNumber}`,
              input.recorderName,
            ),
          }
        : {}),
      ...(input.reaction && input.reaction.trim() !== ''
        ? { reaction: [{ description: input.reaction }] }
        : {}),
    };
  }

  /**
   * Maps the closed encounter to a Composition — the *resume medis*, one
   * document per episode, which is also what PMK 24/2022 obliges the clinic to
   * hold. It is appended last in the bundle because it references everything
   * else.
   *
   * Every section's narrative is XHTML built through {@link escapeXhtml}: this
   * is the first place free clinician text leaves the system as markup, and a
   * plan typed with angle brackets must arrive as literal characters, not as
   * tags. Sections with neither narrative nor entries are dropped rather than
   * sent blank — an empty "Tindakan" section would assert that the question was
   * asked and answered with nothing.
   */
  mapComposition(input: SatusehatCompositionMapInput): SatusehatFhirComposition {
    const organizationId = this.requireConfigValue(
      this.satusehatConfig.organizationId,
      'SATUSEHAT_ORGANIZATION_ID',
    );
    return {
      resourceType: 'Composition',
      identifier: [
        {
          system: `${COMPOSITION_IDENTIFIER_SYSTEM_PREFIX}/${organizationId}`,
          use: 'official',
          value: input.encounterId,
        },
      ],
      status: 'final',
      type: {
        coding: [
          {
            system: LOINC_SYSTEM,
            code: COMPOSITION_TYPE_LOINC_CODE,
            display: COMPOSITION_TYPE_LOINC_DISPLAY,
          },
        ],
      },
      category: [
        {
          coding: [
            {
              system: LOINC_SYSTEM,
              code: COMPOSITION_CATEGORY_LOINC_CODE,
              display: COMPOSITION_CATEGORY_LOINC_DISPLAY,
            },
          ],
        },
      ],
      subject: this.buildReference(`Patient/${input.patientIhsNumber}`, input.patientName),
      encounter: { reference: input.encounterReference },
      date: this.toFhirInstant(input.endedAt),
      author: [
        this.buildReference(
          `Practitioner/${input.practitionerIhsNumber}`,
          input.practitionerName,
        ),
      ],
      title: COMPOSITION_TITLE,
      custodian: { reference: `Organization/${organizationId}` },
      section: input.sections.flatMap((section) => this.buildCompositionSection(section)),
    };
  }

  /**
   * Maps the assessment narrative and prognosis to a ClinicalImpression, which
   * sits beside the Composition in the IG's rawat-jalan set. `finding` points
   * at the same Condition entries the Composition's diagnosis section lists —
   * the impression is what the doctor concluded, the Conditions are what they
   * coded.
   */
  mapClinicalImpression(
    input: SatusehatClinicalImpressionMapInput,
  ): SatusehatFhirClinicalImpression {
    const organizationId = this.requireConfigValue(
      this.satusehatConfig.organizationId,
      'SATUSEHAT_ORGANIZATION_ID',
    );
    const findingReferences = input.findingReferences ?? [];
    return {
      resourceType: 'ClinicalImpression',
      identifier: [
        {
          system: `${CLINICAL_IMPRESSION_IDENTIFIER_SYSTEM_PREFIX}/${organizationId}`,
          use: 'official',
          value: input.encounterId,
        },
      ],
      status: 'completed',
      subject: this.buildReference(`Patient/${input.patientIhsNumber}`, input.patientName),
      encounter: { reference: input.encounterReference },
      effectiveDateTime: this.toFhirInstant(input.endedAt),
      assessor: this.buildReference(
        `Practitioner/${input.practitionerIhsNumber}`,
        input.practitionerName,
      ),
      ...(input.summary && input.summary.trim() !== '' ? { summary: input.summary } : {}),
      ...(findingReferences.length > 0
        ? {
            finding: findingReferences.map((reference) => ({
              itemReference: { reference },
            })),
          }
        : {}),
      ...(input.prognosis ? { prognosisCodeableConcept: [this.buildPrognosis(input.prognosis)] } : {}),
    };
  }

  private buildPrognosis(prognosis: SatusehatClinicalImpressionPrognosis) {
    const snomed = PROGNOSIS_SNOMED_CODES[prognosis];
    return {
      coding: [{ system: SNOMED_SYSTEM, code: snomed.code, display: snomed.display }],
      text: prognosis,
    };
  }

  private buildCompositionSection(
    section: SatusehatCompositionSectionInput,
  ): SatusehatFhirCompositionSection[] {
    const entryReferences = section.entryReferences ?? [];
    const narrative = section.narrative?.trim() ?? '';
    if (narrative === '' && entryReferences.length === 0) {
      return [];
    }
    return [
      {
        title: section.title,
        ...(section.loincCode
          ? {
              code: {
                coding: [
                  {
                    system: LOINC_SYSTEM,
                    code: section.loincCode,
                    ...(section.loincDisplay ? { display: section.loincDisplay } : {}),
                  },
                ],
              },
            }
          : {}),
        ...(narrative === ''
          ? {}
          : {
              text: {
                status: 'generated' as const,
                div: `<div xmlns="${XHTML_NAMESPACE}"><p>${escapeXhtml(narrative)}</p></div>`,
              },
            }),
        ...(entryReferences.length > 0
          ? { entry: entryReferences.map((reference) => ({ reference })) }
          : {}),
      },
    ];
  }

  /**
   * Maps one recorded vaccination to a SATUSEHAT Immunization.
   *
   * The vaccine code is KFA, like every other medication the platform accepts,
   * so callers must skip a vaccine whose catalog row has no `kfaCode` and
   * report the gap — the vaccination stays in the local record either way.
   *
   * Lot, expiry, dose, route and site are all omitted when absent rather than
   * defaulted. A nurse copying a vaccination off a patient's card may have
   * only two of the five, and a record with two true facts is worth more than
   * one with five where three are invented. `site: OTHER` has no v3 code at
   * all, so it is omitted for the same reason.
   */
  mapImmunization(input: SatusehatImmunizationMapInput): SatusehatFhirImmunization {
    const organizationId = this.requireConfigValue(
      this.satusehatConfig.organizationId,
      'SATUSEHAT_ORGANIZATION_ID',
    );
    const route = input.route ? IMMUNIZATION_ROUTE_CODES[input.route] : undefined;
    const site = input.site ? IMMUNIZATION_SITE_CODES[input.site] : undefined;
    return {
      resourceType: 'Immunization',
      identifier: [
        {
          system: `${IMMUNIZATION_IDENTIFIER_SYSTEM_PREFIX}/${organizationId}`,
          use: 'official',
          value: input.immunizationId,
        },
      ],
      status: 'completed',
      vaccineCode: {
        coding: [{ system: KFA_SYSTEM, code: input.kfaCode, display: input.vaccineName }],
      },
      patient: this.buildReference(`Patient/${input.patientIhsNumber}`, input.patientName),
      encounter: { reference: input.encounterReference },
      occurrenceDateTime: this.toFhirInstant(input.occurredAt),
      ...(input.lotNumber ? { lotNumber: input.lotNumber } : {}),
      ...(input.expirationDate ? { expirationDate: input.expirationDate } : {}),
      ...(site && site.code
        ? { site: { coding: [{ system: ACT_SITE_SYSTEM, ...site }] } }
        : {}),
      ...(route
        ? { route: { coding: [{ system: ROUTE_OF_ADMINISTRATION_SYSTEM, ...route }] } }
        : {}),
      ...(input.performerIhsNumber
        ? {
            performer: [
              {
                actor: this.buildReference(
                  `Practitioner/${input.performerIhsNumber}`,
                  input.performerName,
                ),
              },
            ],
          }
        : {}),
      ...(input.doseNumber === undefined
        ? {}
        : { protocolApplied: [{ doseNumberPositiveInt: input.doseNumber }] }),
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
   * Maps one compounded prescription line to a SATUSEHAT Medication of type
   * `SD` — the platform's code for a compound, as against the `NC` every
   * catalog product goes out as.
   *
   * Ingredients reference bundle-local `Medication` entries for their
   * component products, so the caller must register those first. A compound
   * whose components are not all KFA-coded must be skipped entirely by the
   * caller: a half-described compound is worse than an absent one, because the
   * next clinic reads it as complete.
   *
   * `strength` carries the per-compound quantity — a third of a tablet per
   * bungkus is what makes a racikan a racikan, and a compound without it is
   * just a list of names.
   */
  mapCompoundMedication(input: SatusehatCompoundMedicationMapInput): SatusehatFhirMedication {
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
          value: input.prescriptionItemId,
        },
      ],
      status: 'active',
      // No KFA code exists for a compound the clinic mixed itself, so the name
      // is the code — `text` is what FHIR provides for exactly this.
      code: { coding: [], text: input.compoundName },
      extension: [
        {
          url: MEDICATION_TYPE_EXTENSION_URL,
          valueCodeableConcept: {
            coding: [{ system: MEDICATION_TYPE_SYSTEM, code: 'SD', display: 'Compound' }],
          },
        },
      ],
      ingredient: input.ingredients.map((ingredient) => ({
        itemReference: this.buildReference(
          ingredient.medicationReference,
          ingredient.medicationDisplay,
        ),
        strength: {
          numerator: { value: ingredient.quantity, unit: ingredient.unit },
          denominator: { value: 1 },
        },
      })),
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

  private buildEncounterClass(input: SatusehatEncounterMapInput): SatusehatFhirCoding {
    return input.admission
      ? { system: ACT_ENCOUNTER_CODE_SYSTEM, code: 'IMP', display: 'inpatient encounter' }
      : { system: ACT_ENCOUNTER_CODE_SYSTEM, code: 'AMB', display: 'ambulatory' };
  }

  /**
   * The clinic records no discharge disposition, so every inpatient stay is
   * reported as discharged home. That is the truthful default for a klinik
   * pratama — a stay that ends any other way is a transfer the clinic arranges
   * outside this system — and inventing a column for it belongs to whichever
   * ticket actually gives staff somewhere to record it.
   */
  private buildHospitalization(
    input: SatusehatEncounterMapInput,
  ): Pick<SatusehatFhirEncounter, 'hospitalization'> | Record<string, never> {
    if (!input.admission) {
      return {};
    }
    const hospitalization: SatusehatFhirEncounterHospitalization = {
      dischargeDisposition: {
        coding: [{ system: DISCHARGE_DISPOSITION_SYSTEM, code: 'home', display: 'Home' }],
      },
    };
    return { hospitalization };
  }

  /**
   * For an inpatient stay the visit ends at discharge, not when the doctor
   * closed the note — a late-finished chart would otherwise report an episode
   * that ended before the patient left the bed.
   */
  private resolveEndedAt(input: SatusehatEncounterMapInput): Date {
    if (!input.admission) {
      return input.endedAt;
    }
    return input.admission.dischargedAt.getTime() < input.startedAt.getTime()
      ? input.startedAt
      : input.admission.dischargedAt;
  }

  /**
   * An inpatient stay's `in-progress` runs from admission to discharge — the
   * bed, not the consultation, is what the platform is being told about.
   */
  private buildStatusHistory(
    input: SatusehatEncounterMapInput,
  ): SatusehatEncounterStatusHistoryEntry[] {
    const arrivedAt = this.resolveArrivedAt(input);
    const inProgressFrom = this.resolveInProgressFrom(input);
    const endedAt = this.resolveEndedAt(input);
    return [
      {
        status: 'arrived',
        period: { start: this.toFhirInstant(arrivedAt), end: this.toFhirInstant(inProgressFrom) },
      },
      {
        status: 'in-progress',
        period: {
          start: this.toFhirInstant(inProgressFrom),
          end: this.toFhirInstant(endedAt),
        },
      },
      {
        status: 'finished',
        period: { start: this.toFhirInstant(endedAt), end: this.toFhirInstant(endedAt) },
      },
    ];
  }

  /**
   * Clamped the same way check-in is: an admission stamped before the
   * encounter opened (backfilled paperwork, clock skew) would invert the
   * `arrived` period, which the platform rejects.
   */
  private resolveInProgressFrom(input: SatusehatEncounterMapInput): Date {
    if (!input.admission) {
      return input.startedAt;
    }
    return input.admission.admittedAt.getTime() < input.startedAt.getTime()
      ? input.startedAt
      : input.admission.admittedAt;
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
