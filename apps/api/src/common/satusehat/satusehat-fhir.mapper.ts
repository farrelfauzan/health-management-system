import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { escapeXhtml } from './escape-xhtml';
import { SatusehatError } from './satusehat.error';
import { resolveSatusehatConfig } from './satusehat.config';
import { buildSatusehatEncounterServiceClassExtension } from './satusehat-service-class-extension';
import { SATUSEHAT_ANTENATAL_OBSERVATION_DEFINITIONS } from './satusehat-antenatal-observation-definitions';
import {
  buildSatusehatEpisodeOfCareIdentifierSystem,
  SATUSEHAT_ANTENATAL_EPISODE_TYPE_CODE,
  SATUSEHAT_ANTENATAL_EPISODE_TYPE_DISPLAY,
  SATUSEHAT_EPISODE_OF_CARE_TYPE_SYSTEM,
} from './satusehat-episode-of-care-coding';
import { SATUSEHAT_VITAL_SIGN_DEFINITIONS } from './satusehat-vital-sign-definitions';
import {
  SatusehatAllergyMapInput,
  SatusehatAntenatalEpisodeFinishMapInput,
  SatusehatAntenatalEpisodeMapInput,
  SatusehatAntenatalObservationDefinition,
  SatusehatAntenatalObservationField,
  SatusehatAntenatalObservationMapInput,
  SatusehatClinicalImpressionMapInput,
  SatusehatClinicalImpressionPrognosis,
  SatusehatCompositionMapInput,
  SatusehatCompositionSectionInput,
  SatusehatCompoundMedicationMapInput,
  SatusehatConditionMapInput,
  SatusehatDiagnosticReportMapInput,
  SatusehatEncounterMapInput,
  SatusehatEncounterStatusHistoryEntry,
  SatusehatFhirAddress,
  SatusehatFhirAdministrativeCodeEntry,
  SatusehatFhirAllergyIntolerance,
  SatusehatFhirClinicalImpression,
  SatusehatFhirCodedOrBareQuantity,
  SatusehatFhirCoding,
  SatusehatFhirComposition,
  SatusehatFhirCompositionSection,
  SatusehatFhirCondition,
  SatusehatFhirDiagnosticReport,
  SatusehatFhirEncounter,
  SatusehatFhirEncounterHospitalization,
  SatusehatFhirEncounterLocation,
  SatusehatFhirEpisodeOfCare,
  SatusehatFhirIdentifier,
  SatusehatFhirImmunization,
  SatusehatFhirJsonPatchOperation,
  SatusehatFhirMedication,
  SatusehatFhirMedicationDispense,
  SatusehatFhirMedicationRequest,
  SatusehatFhirNewbornPatient,
  SatusehatFhirObservation,
  SatusehatFhirObservationReferenceRange,
  SatusehatFhirProcedure,
  SatusehatFhirQuantity,
  SatusehatFhirReference,
  SatusehatFhirServiceRequest,
  SatusehatFhirSpecimen,
  SatusehatImmunizationMapInput,
  SatusehatImmunizationReasonCode,
  SatusehatJsonPatchOperation,
  SatusehatLabObservationMapInput,
  SatusehatLabOnlyEncounterMapInput,
  SatusehatMedicationDispenseMapInput,
  SatusehatMedicationMapInput,
  SatusehatMedicationRequestMapInput,
  SatusehatNewbornNikPatchMapInput,
  SatusehatNewbornPatientMapInput,
  SatusehatPatientAddressMapInput,
  SatusehatProcedureMapInput,
  SatusehatServiceRequestMapInput,
  SatusehatSpecimenMapInput,
  SatusehatVitalSignDefinition,
  SatusehatVitalSignsMapInput,
} from './satusehat-fhir.types';
import { SatusehatConfig } from './satusehat.types';

/** The display each antenatal Observation category is sent under. */
const ANTENATAL_OBSERVATION_CATEGORY_DISPLAYS: Readonly<
  Record<SatusehatAntenatalObservationDefinition['category'], string>
> = {
  survey: 'Survey',
  exam: 'Exam',
  'vital-signs': 'Vital Signs',
  laboratory: 'Laboratory',
};

const ENCOUNTER_IDENTIFIER_SYSTEM_PREFIX = 'http://sys-ids.kemkes.go.id/encounter';
const ADMINISTRATIVE_CODE_EXTENSION_URL =
  'https://fhir.kemkes.go.id/r4/StructureDefinition/administrativeCode';
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

const IMMUNIZATION_REASON_SYSTEM =
  'http://terminology.kemkes.go.id/CodeSystem/immunization-reason';

/**
 * The platform's own immunization-reason codes (P24-T12, FR-IM-03). The
 * stored value folds the hyphen into an underscore because it is an enum;
 * the wire code is the platform's spelling, which the terminology validates
 * (RuleNumber 10105).
 */
const IMMUNIZATION_REASON_CODES: Readonly<
  Record<SatusehatImmunizationReasonCode, { code: string; display: string }>
> = {
  IM_DASAR: { code: 'IM-Dasar', display: 'Imunisasi Dasar' },
  IM_BADUTA: { code: 'IM-Baduta', display: 'Imunisasi Baduta' },
  IM_SD: { code: 'IM-SD', display: 'Imunisasi Anak Sekolah Dasar' },
  IM_WUS: { code: 'IM-WUS', display: 'Imunisasi Wanita Usia Subur' },
  IM_TAMBAHAN: { code: 'IM-Tambahan', display: 'Imunisasi Tambahan' },
  IM_KHUSUS: { code: 'IM-Khusus', display: 'Imunisasi Khusus' },
  IM_PILIHAN: { code: 'IM-Pilihan', display: 'Imunisasi Pilihan' },
};

const PERFORMER_FUNCTION_SYSTEM = 'http://terminology.hl7.org/CodeSystem/v2-0443';

/**
 * Who the named performer is to the dose (HL7 v2 table 0443). The platform
 * pairs the function with `primarySource` (RuleNumber 10307): a dose given
 * here is administered by its performer, a dose copied from a card was only
 * entered by them, and the other pairing is refused.
 */
const IMMUNIZATION_PERFORMER_FUNCTIONS: Readonly<
  Record<'ADMINISTERING' | 'ENTERING', { code: string; display: string }>
> = {
  ADMINISTERING: { code: 'AP', display: 'Administering Provider' },
  ENTERING: { code: 'EP', display: 'Entering Provider' },
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

/** SNOMED "Laboratory service", the kind of service a lab-only visit is. */
const LABORATORY_SERVICE_SNOMED_CODE = '108252007';
const LABORATORY_SERVICE_SNOMED_DISPLAY = 'Laboratory procedure';

const SERVICE_REQUEST_IDENTIFIER_SYSTEM_PREFIX = 'http://sys-ids.kemkes.go.id/servicerequest';
const SPECIMEN_IDENTIFIER_SYSTEM_PREFIX = 'http://sys-ids.kemkes.go.id/specimen';
// Rule 10432: a lab report's identifier system is `diagnostic/{org}/lab`
// (`/rad` for radiology) — not a `diagnosticreport` namespace.
const DIAGNOSTIC_REPORT_IDENTIFIER_SYSTEM_PREFIX = 'http://sys-ids.kemkes.go.id/diagnostic';
const OBSERVATION_INTERPRETATION_SYSTEM =
  'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation';
const DIAGNOSTIC_SERVICE_SECTION_SYSTEM =
  'http://terminology.hl7.org/CodeSystem/v2-0074';
const LABORATORY_PROCEDURE_SNOMED_CODE = '108252007';
const LABORATORY_PROCEDURE_SNOMED_DISPLAY = 'Laboratory procedure';
/** LOINC "Laboratory report", the code a mixed order reports under. */
const GENERIC_LAB_REPORT_LOINC_CODE = '11502-2';
const GENERIC_LAB_REPORT_LOINC_DISPLAY = 'Laboratory report';

/**
 * SNOMED specimen types for the eight kinds of tube the bench handles. Held
 * here rather than in the catalog for the same reason the vital-sign LOINC
 * table is: a coding correction should be an adapter change, not a migration.
 *
 * OTHER has no entry on purpose. "A specimen of some other kind" is not a
 * SNOMED concept, and sending one would be inventing a fact about what was in
 * the tube — the type is omitted and the rest of the resource still stands.
 */
const SPECIMEN_TYPE_SNOMED_CODES: Readonly<
  Record<string, { code: string; display: string }>
> = {
  WHOLE_BLOOD: { code: '258580003', display: 'Whole blood specimen' },
  SERUM: { code: '119364003', display: 'Serum specimen' },
  PLASMA: { code: '119361006', display: 'Plasma specimen' },
  URINE: { code: '122575003', display: 'Urine specimen' },
  STOOL: { code: '119339001', display: 'Stool specimen' },
  SPUTUM: { code: '119334006', display: 'Sputum specimen' },
  SWAB: { code: '258529004', display: 'Swab' },
};

/**
 * HL7 v3 interpretation codes for the six flags a result can carry. The pair
 * of critical flags map to HH/LL — "panic" values — which is what makes a
 * critical result visible as such nationally and not merely out of range.
 */
const RESULT_FLAG_INTERPRETATION_CODES: Readonly<
  Record<string, { code: string; display: string }>
> = {
  NORMAL: { code: 'N', display: 'Normal' },
  LOW: { code: 'L', display: 'Low' },
  HIGH: { code: 'H', display: 'High' },
  CRITICAL_LOW: { code: 'LL', display: 'Critical low' },
  CRITICAL_HIGH: { code: 'HH', display: 'Critical high' },
  ABNORMAL: { code: 'A', display: 'Abnormal' },
};

const LOINC_SYSTEM = 'http://loinc.org';
const UCUM_SYSTEM = 'http://unitsofmeasure.org';
/** UCUM's dimensionless unit — valid UCUM, but absent from the gateway's table. */
const DIMENSIONLESS_UCUM_CODE = '1';
const ACT_ENCOUNTER_CODE_SYSTEM = 'http://terminology.hl7.org/CodeSystem/v3-ActCode';
const PARTICIPATION_TYPE_SYSTEM = 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType';
const CONDITION_CLINICAL_SYSTEM = 'http://terminology.hl7.org/CodeSystem/condition-clinical';
const CONDITION_CATEGORY_SYSTEM = 'http://terminology.hl7.org/CodeSystem/condition-category';
const DIAGNOSIS_ROLE_SYSTEM = 'http://terminology.hl7.org/CodeSystem/diagnosis-role';
const OBSERVATION_CATEGORY_SYSTEM = 'http://terminology.hl7.org/CodeSystem/observation-category';
/**
 * How SATUSEHAT holds a baby who has no NIK yet: under her mother's
 * (P24-T11). `https`, unlike most of the Kemenkes systems here — the master
 * patient index page spells this one that way.
 */
const NIK_IBU_IDENTIFIER_SYSTEM = 'https://fhir.kemkes.go.id/id/nik-ibu';
/** A person's own NIK, which a newborn receives weeks after birth (P24-T13). */
const NIK_IDENTIFIER_SYSTEM = 'https://fhir.kemkes.go.id/id/nik';
const KFA_SYSTEM = 'http://sys-ids.kemkes.go.id/kfa';
const MEDICATION_IDENTIFIER_SYSTEM_PREFIX = 'http://sys-ids.kemkes.go.id/medication';
const PRESCRIPTION_IDENTIFIER_SYSTEM_PREFIX = 'http://sys-ids.kemkes.go.id/prescription';
const PRESCRIPTION_ITEM_IDENTIFIER_SYSTEM_PREFIX = 'http://sys-ids.kemkes.go.id/prescription-item';
const MEDICATION_TYPE_EXTENSION_URL =
  'https://fhir.kemkes.go.id/r4/StructureDefinition/MedicationType';
// `http`, not `https`: the published Medication page shows `https`, but the
// gateway rejects it (rule 10031) — the validator's terminology is `http`.
const MEDICATION_TYPE_SYSTEM = 'http://terminology.kemkes.go.id/CodeSystem/medication-type';
const ORDERABLE_DRUG_FORM_SYSTEM = 'http://terminology.hl7.org/CodeSystem/v3-orderableDrugForm';
/**
 * Catalog units that are dose forms, as HL7 orderable drug form codes — the
 * only coding SATUSEHAT accepts on a prescribed or dispensed quantity (rules
 * 10348 and 10050). Packaging units (BOTOL, STRIP, BOX…) and mass or volume
 * units have no dose-form code and are deliberately absent.
 */
const ORDERABLE_DRUG_FORM_CODES: Readonly<Record<string, string>> = {
  TABLET: 'TAB',
  KAPSUL: 'CAP',
  KAPLET: 'CAPLET',
  SUPOSITORIA: 'SUPP',
  TETES: 'DROP',
};

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
    const locationId = this.resolveLocationId(input.locationId);
    return {
      resourceType: 'Encounter',
      identifier: [
        ...this.buildAntenatalVisitIdentifier(input, organizationId),
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
      location: this.buildEncounterLocations(input, locationId),
      statusHistory: this.buildStatusHistory(input),
      ...this.buildHospitalization(input),
      ...this.buildEncounterDiagnosis(input),
      ...this.buildAntenatalEpisodeReference(input),
      serviceProvider: { reference: `Organization/${organizationId}` },
    };
  }

  /**
   * A newborn as the master patient index receives her (P24-T11, FR-NB-03).
   *
   * Identified by her mother's NIK, because she has none of her own for weeks
   * — that is the whole reason this resource is posted rather than resolved.
   * Her address is her mother's, which the caller has already read off the
   * mother's record; a baby who was not given one goes out without the
   * element rather than with an empty one.
   */
  mapNewbornToPatient(input: SatusehatNewbornPatientMapInput): SatusehatFhirNewbornPatient {
    return {
      resourceType: 'Patient',
      active: true,
      identifier: [{ system: NIK_IBU_IDENTIFIER_SYSTEM, use: 'official', value: input.motherNik }],
      name: [{ use: 'official', text: input.fullName }],
      gender: input.sex === 'FEMALE' ? 'female' : 'male',
      birthDate: input.birthDate,
      multipleBirthInteger: input.multipleBirthInteger,
      ...(input.address ? { address: [this.mapPatientAddress(input.address)] } : {}),
    };
  }

  /**
   * A newborn's first NIK as a JSON Patch on her existing SATUSEHAT Patient
   * (P24-T13, FR-NB-05).
   *
   * Three operations, because the platform validates the NIK against Dukcapil
   * **together with** the full name and birth date: sending the identifier
   * alone would be validated against whatever name the resource was created
   * with, which for a baby is often a placeholder like "Bayi Ny. Sari". The
   * name and birth date are therefore restated from the local record, so what
   * is validated is the record as it now stands.
   *
   * Her mother's `nik-ibu` identifier is **appended to, not replaced**: the
   * published pages say which fields may be updated and never say the
   * mother's identifier is withdrawn, and dropping an identifier the platform
   * still indexes her siblings by is not a guess worth making. That makes the
   * patch non-idempotent, which is why {@link SatusehatHttpClient} must not
   * retry it.
   */
  mapNewbornNikToPatientPatch(
    input: SatusehatNewbornNikPatchMapInput,
  ): SatusehatFhirJsonPatchOperation[] {
    return [
      {
        op: 'add',
        path: '/identifier/-',
        value: { system: NIK_IDENTIFIER_SYSTEM, use: 'official', value: input.nik },
      },
      { op: 'replace', path: '/name/0/text', value: input.fullName },
      { op: 'replace', path: '/birthDate', value: input.birthDate },
    ];
  }

  /**
   * A patient's home address for the SATUSEHAT Patient profile (P19-T10).
   *
   * The `administrativeCode` extension is emitted only when the record
   * carries the structured address, so a legacy row goes out as a plain
   * `line` and never as an extension full of empty codes. SATUSEHAT spells
   * the Kemendagri codes without their dots (`3171011001`, not
   * `31.71.01.1001`), and `rt`/`rw` travel as two codes rather than the one
   * `003/007` string the KTP prints. Nothing in the pipeline posts a Patient
   * resource yet — the integration resolves patients by NIK — so this is the
   * building block that create/update will call when it does.
   */
  mapPatientAddress(input: SatusehatPatientAddressMapInput): SatusehatFhirAddress {
    const hasChain = Boolean(
      input.provinceCode && input.regencyCode && input.districtCode && input.villageCode,
    );
    return {
      use: 'home',
      line: [input.street],
      ...(input.regencyName ? { city: input.regencyName } : {}),
      ...(input.postalCode ? { postalCode: input.postalCode } : {}),
      country: 'ID',
      ...(hasChain
        ? {
            extension: [
              {
                url: ADMINISTRATIVE_CODE_EXTENSION_URL,
                extension: this.buildAdministrativeCodeEntries(input),
              },
            ],
          }
        : {}),
    };
  }

  private buildAdministrativeCodeEntries(
    input: SatusehatPatientAddressMapInput,
  ): SatusehatFhirAdministrativeCodeEntry[] {
    const [rt, rw] = (input.rtRw ?? '').split('/');
    const entries: SatusehatFhirAdministrativeCodeEntry[] = [
      { url: 'province', valueCode: this.stripRegionCodeDots(input.provinceCode ?? '') },
      { url: 'city', valueCode: this.stripRegionCodeDots(input.regencyCode ?? '') },
      { url: 'district', valueCode: this.stripRegionCodeDots(input.districtCode ?? '') },
      { url: 'village', valueCode: this.stripRegionCodeDots(input.villageCode ?? '') },
    ];
    if (rt && rw) {
      entries.push({ url: 'rt', valueCode: rt }, { url: 'rw', valueCode: rw });
    }
    return entries;
  }

  private stripRegionCodeDots(code: string): string {
    return code.replace(/\./g, '');
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
      // A single Identifier, not an array: Composition.identifier is 0..1 in
      // R4, and the gateway's parser rejects the whole bundle as
      // `unparseable_resource` when it receives a list.
      identifier: {
        system: `${COMPOSITION_IDENTIFIER_SYSTEM_PREFIX}/${organizationId}`,
        use: 'official',
        value: input.encounterId,
      },
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
  /**
   * The set the platform enforces (P24-T12, spike §4): `recorded` is when the
   * row was written, `primarySource` says whether the dose was given here,
   * and the performer's `function` must agree with it — `AP` for a dose given
   * here, `EP` for one copied from a card (RuleNumber 10307). `reasonCode`,
   * `protocolApplied` and `location` are mandatory outright, so the caller
   * skips a row that cannot fill them rather than the mapper inventing values.
   * The location is the root site: no poli Location is registered yet.
   */
  mapImmunization(input: SatusehatImmunizationMapInput): SatusehatFhirImmunization {
    const organizationId = this.requireConfigValue(
      this.satusehatConfig.organizationId,
      'SATUSEHAT_ORGANIZATION_ID',
    );
    const locationId = this.requireConfigValue(
      this.satusehatConfig.locationId,
      'SATUSEHAT_LOCATION_ID',
    );
    const route = input.route ? IMMUNIZATION_ROUTE_CODES[input.route] : undefined;
    const site = input.site ? IMMUNIZATION_SITE_CODES[input.site] : undefined;
    const performerFunction = input.isHistorical
      ? IMMUNIZATION_PERFORMER_FUNCTIONS.ENTERING
      : IMMUNIZATION_PERFORMER_FUNCTIONS.ADMINISTERING;
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
      recorded: this.toFhirInstant(input.recordedAt),
      primarySource: !input.isHistorical,
      location: this.buildReference(`Location/${locationId}`, this.satusehatConfig.locationName),
      ...this.buildImmunizationBatch(input),
      ...(site && site.code
        ? { site: { coding: [{ system: ACT_SITE_SYSTEM, ...site }] } }
        : {}),
      ...(route
        ? { route: { coding: [{ system: ROUTE_OF_ADMINISTRATION_SYSTEM, ...route }] } }
        : {}),
      reasonCode: [
        { coding: [{ system: IMMUNIZATION_REASON_SYSTEM, ...IMMUNIZATION_REASON_CODES[input.reason] }] },
      ],
      performer: [
        {
          function: { coding: [{ system: PERFORMER_FUNCTION_SYSTEM, ...performerFunction }] },
          actor: this.buildReference(
            `Practitioner/${input.performerIhsNumber}`,
            input.performerName,
          ),
        },
      ],
      protocolApplied: [{ doseNumberPositiveInt: input.doseNumber }],
      ...(input.notes && input.notes.trim() !== '' ? { note: [{ text: input.notes }] } : {}),
    };
  }

  /**
   * Lot and expiry travel only with a dose given here. A historical dose is
   * sent without them even when the card showed one: staging accepted exactly
   * that shape (spike §4), and a historical dose carrying batch facts is a
   * shape nobody has tested against the platform.
   */
  private buildImmunizationBatch(
    input: SatusehatImmunizationMapInput,
  ): Pick<SatusehatFhirImmunization, 'lotNumber' | 'expirationDate'> {
    if (input.isHistorical) {
      return {};
    }
    return {
      ...(input.lotNumber ? { lotNumber: input.lotNumber } : {}),
      ...(input.expirationDate ? { expirationDate: input.expirationDate } : {}),
    };
  }

  /**
   * Maps one vital-signs row to LOINC-coded Observations — one resource per
   * measured column, skipping nulls, so a front-desk row with only weight and
   * blood pressure submits exactly three observations.
   */
  mapVitalSignsToObservations(input: SatusehatVitalSignsMapInput): SatusehatFhirObservation[] {
    return SATUSEHAT_VITAL_SIGN_DEFINITIONS.flatMap((definition) => {
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
      dispenseRequest: { quantity: this.buildDispenseQuantity(input.quantity, input.unit) },
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
      // The prescription it fulfils, not a `medicationdispense` namespace: the
      // published example uses one, but the gateway only accepts prescription,
      // prescription-item, claim-number or coverage-type here (rule 10389).
      identifier: [
        {
          system: `${PRESCRIPTION_IDENTIFIER_SYSTEM_PREFIX}/${organizationId}`,
          use: 'official',
          value: input.prescriptionId,
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
      quantity: this.buildDispenseQuantity(input.quantity, input.unit),
      whenHandedOver: this.toFhirInstant(input.dispensedAt),
      substitution: { wasSubstituted: false },
    };
  }

  /**
   * Maps one ordered test to a ServiceRequest. `status: completed` and
   * `intent: original-order` are fixed: the chain is only ever built from an
   * order whose results have been released, so by the time this is sent the
   * request has been fulfilled, and it was an original order rather than a
   * reflex or a repeat.
   *
   * The identifier is `{orderNumber}-{itemSeq}` so one national id survives a
   * resubmission of the same item — the sequence is the item's position in the
   * order, not its position in a sorted list.
   */
  mapLabItemToServiceRequest(input: SatusehatServiceRequestMapInput): SatusehatFhirServiceRequest {
    const organizationId = this.requireConfigValue(
      this.satusehatConfig.organizationId,
      'SATUSEHAT_ORGANIZATION_ID',
    );
    return {
      resourceType: 'ServiceRequest',
      identifier: [
        {
          system: `${SERVICE_REQUEST_IDENTIFIER_SYSTEM_PREFIX}/${organizationId}`,
          use: 'official',
          value: `${input.orderNumber}-${input.itemSeq}`,
        },
      ],
      status: 'completed',
      intent: 'original-order',
      category: [
        {
          coding: [
            {
              system: SNOMED_SYSTEM,
              code: LABORATORY_PROCEDURE_SNOMED_CODE,
              display: LABORATORY_PROCEDURE_SNOMED_DISPLAY,
            },
          ],
        },
      ],
      code: { coding: [this.buildLoincCoding(input.loincCode, input.loincDisplay)] },
      subject: this.buildReference(`Patient/${input.patientIhsNumber}`, input.patientName),
      encounter: { reference: input.encounterReference },
      occurrenceDateTime: this.toFhirInstant(input.orderedAt),
      ...(input.practitionerIhsNumber
        ? { requester: { reference: `Practitioner/${input.practitionerIhsNumber}` } }
        : {}),
      performer: [{ reference: `Organization/${organizationId}` }],
      ...(input.reasonCode
        ? {
            reasonCode: [
              {
                coding: [
                  {
                    system: ICD10_SYSTEM,
                    code: input.reasonCode,
                    ...(input.reasonDisplay ? { display: input.reasonDisplay } : {}),
                  },
                ],
              },
            ],
          }
        : {}),
    };
  }

  /**
   * Maps one tube to a Specimen. `status: available` because a rejected draw
   * never reaches this point — its items are waiting for a fresh one, and the
   * order cannot have been released on it.
   */
  mapLabSpecimen(input: SatusehatSpecimenMapInput): SatusehatFhirSpecimen {
    const organizationId = this.requireConfigValue(
      this.satusehatConfig.organizationId,
      'SATUSEHAT_ORGANIZATION_ID',
    );
    const specimenType = SPECIMEN_TYPE_SNOMED_CODES[input.specimenType];
    return {
      resourceType: 'Specimen',
      accessionIdentifier: {
        system: `${SPECIMEN_IDENTIFIER_SYSTEM_PREFIX}/${organizationId}`,
        use: 'official',
        value: input.accessionNumber,
      },
      status: 'available',
      ...(specimenType
        ? {
            type: {
              coding: [
                { system: SNOMED_SYSTEM, code: specimenType.code, display: specimenType.display },
              ],
            },
          }
        : {}),
      subject: this.buildReference(`Patient/${input.patientIhsNumber}`, input.patientName),
      ...(input.serviceRequestReferences.length > 0
        ? { request: input.serviceRequestReferences.map((reference) => ({ reference })) }
        : {}),
      collection: { collectedDateTime: this.toFhirInstant(input.collectedAt) },
    };
  }

  /**
   * Maps one released value to a laboratory Observation.
   *
   * `performer` is the Organization, never the analyst: a lab result is issued
   * by the laboratory, and the analyst is a system user without an IHS
   * practitioner number — the same reasoning MedicationDispense follows for
   * the pharmacist.
   */
  mapLabResultToObservation(input: SatusehatLabObservationMapInput): SatusehatFhirObservation {
    const organizationId = this.requireConfigValue(
      this.satusehatConfig.organizationId,
      'SATUSEHAT_ORGANIZATION_ID',
    );
    const interpretation = input.flag ? RESULT_FLAG_INTERPRETATION_CODES[input.flag] : undefined;
    const referenceRange = this.buildLabReferenceRange(input);
    return {
      resourceType: 'Observation',
      status: input.isAmendment ? 'amended' : 'final',
      category: [
        {
          coding: [
            { system: OBSERVATION_CATEGORY_SYSTEM, code: 'laboratory', display: 'Laboratory' },
          ],
        },
      ],
      code: { coding: [this.buildLoincCoding(input.loincCode, input.loincDisplay)] },
      subject: this.buildReference(`Patient/${input.patientIhsNumber}`, input.patientName),
      encounter: { reference: input.encounterReference },
      basedOn: [{ reference: input.serviceRequestReference }],
      ...(input.specimenReference ? { specimen: { reference: input.specimenReference } } : {}),
      effectiveDateTime: this.toFhirInstant(input.effectiveAt),
      issued: this.toFhirInstant(input.issuedAt),
      performer: [{ reference: `Organization/${organizationId}` }],
      ...this.buildLabObservationValue(input),
      ...(interpretation
        ? {
            interpretation: [
              {
                coding: [
                  {
                    system: OBSERVATION_INTERPRETATION_SYSTEM,
                    code: interpretation.code,
                    display: interpretation.display,
                  },
                ],
              },
            ],
          }
        : {}),
      ...(referenceRange ? { referenceRange: [referenceRange] } : {}),
    };
  }

  /**
   * Maps the order to the DiagnosticReport that gathers it. An order that was
   * one panel reports under that panel's LOINC; a mixed order reports under
   * the generic laboratory-report code, because no single LOINC describes
   * "these particular six tests".
   */
  mapLabOrderToDiagnosticReport(
    input: SatusehatDiagnosticReportMapInput,
  ): SatusehatFhirDiagnosticReport {
    const organizationId = this.requireConfigValue(
      this.satusehatConfig.organizationId,
      'SATUSEHAT_ORGANIZATION_ID',
    );
    return {
      resourceType: 'DiagnosticReport',
      identifier: [
        {
          system: `${DIAGNOSTIC_REPORT_IDENTIFIER_SYSTEM_PREFIX}/${organizationId}/lab`,
          use: 'official',
          value: input.orderNumber,
        },
      ],
      status: input.isAmendment ? 'amended' : 'final',
      category: [
        {
          coding: [{ system: DIAGNOSTIC_SERVICE_SECTION_SYSTEM, code: 'LAB', display: 'Laboratory' }],
        },
      ],
      code: {
        coding: [
          input.panelLoincCode
            ? this.buildLoincCoding(input.panelLoincCode, input.panelLoincDisplay)
            : this.buildLoincCoding(GENERIC_LAB_REPORT_LOINC_CODE, GENERIC_LAB_REPORT_LOINC_DISPLAY),
        ],
      },
      subject: this.buildReference(`Patient/${input.patientIhsNumber}`, input.patientName),
      encounter: { reference: input.encounterReference },
      ...(input.serviceRequestReferences.length > 0
        ? { basedOn: input.serviceRequestReferences.map((reference) => ({ reference })) }
        : {}),
      ...(input.specimenReferences.length > 0
        ? { specimen: input.specimenReferences.map((reference) => ({ reference })) }
        : {}),
      ...(input.observationReferences.length > 0
        ? { result: input.observationReferences.map((reference) => ({ reference })) }
        : {}),
      effectiveDateTime: this.toFhirInstant(input.effectiveAt),
      issued: this.toFhirInstant(input.issuedAt),
      performer: [{ reference: `Organization/${organizationId}` }],
      ...(input.conclusion ? { conclusion: input.conclusion } : {}),
    };
  }

  /**
   * Maps a laboratory-only visit to a minimal Encounter (P18-T10), sent inside
   * the lab bundle rather than referenced from it.
   *
   * `participant` is omitted, not filled with a stand-in: nobody attended, and
   * the national record should say so rather than name a practitioner who
   * never saw the patient. The Organization is the serviceProvider, which is
   * true — the clinic did perform the work.
   *
   * The identifier is the registration, so a resubmission updates the same
   * Encounter rather than creating a second visit for one blood draw.
   */
  mapLabOnlyVisitToEncounter(
    input: SatusehatLabOnlyEncounterMapInput,
  ): SatusehatFhirEncounter {
    const organizationId = this.requireConfigValue(
      this.satusehatConfig.organizationId,
      'SATUSEHAT_ORGANIZATION_ID',
    );
    const locationId = this.resolveLocationId(input.locationId);
    const period = {
      start: this.toFhirInstant(input.startedAt),
      end: this.toFhirInstant(input.endedAt),
    };
    return {
      resourceType: 'Encounter',
      identifier: [
        {
          system: `${ENCOUNTER_IDENTIFIER_SYSTEM_PREFIX}/${organizationId}`,
          use: 'official',
          value: input.registrationId,
        },
      ],
      status: 'finished',
      class: { system: ACT_ENCOUNTER_CODE_SYSTEM, code: 'AMB', display: 'ambulatory' },
      serviceType: {
        coding: [
          {
            system: SNOMED_SYSTEM,
            code: LABORATORY_SERVICE_SNOMED_CODE,
            display: LABORATORY_SERVICE_SNOMED_DISPLAY,
          },
        ],
      },
      subject: this.buildReference(`Patient/${input.patientIhsNumber}`, input.patientName),
      period,
      location: [{ location: { reference: `Location/${locationId}` } }],
      // Arrived and finished, with nothing in between: there was no
      // consultation to be in progress during.
      statusHistory: [{ status: 'finished', period }],
      serviceProvider: { reference: `Organization/${organizationId}` },
    };
  }

  private buildLoincCoding(code: string, display?: string): SatusehatFhirCoding {
    return { system: LOINC_SYSTEM, code, ...(display ? { display } : {}) };
  }

  /**
   * The one value form the test produced. A dimensionless number — no unit,
   * or UCUM's `1`, as urine specific gravity is recorded — goes out as its
   * decimal text. The gateway's UCUM table has no `1` (rules 10012, 10381,
   * 10382) and it rejects a quantity without a UCUM code just the same, so
   * text is the only form that carries the result unchanged.
   */
  private buildLabObservationValue(
    input: SatusehatLabObservationMapInput,
  ): Pick<SatusehatFhirObservation, 'valueQuantity' | 'valueString' | 'valueCodeableConcept'> {
    if (input.valueNumeric !== undefined) {
      return this.isDimensionlessUnit(input.unit)
        ? { valueString: String(input.valueNumeric) }
        : { valueQuantity: this.buildLabQuantity(input.valueNumeric, input.unit) };
    }
    if (input.valueCoded !== undefined) {
      return { valueCodeableConcept: { text: input.valueCoded } };
    }
    return { valueString: input.valueString ?? '' };
  }

  private buildLabQuantity(value: number, unit: string): SatusehatFhirQuantity {
    return { value, unit, system: UCUM_SYSTEM, code: unit };
  }

  private isDimensionlessUnit(
    unit: string | undefined,
  ): unit is typeof DIMENSIONLESS_UCUM_CODE | undefined {
    return unit === undefined || unit === DIMENSIONLESS_UCUM_CODE;
  }

  /**
   * The band the value was judged against. A qualitative range is sent as text
   * alone — "negatif" has no bounds — and a result with no band at all sends
   * none, rather than an empty one implying a range that did not apply. A
   * dimensionless band is text too, for the same reason its value is.
   */
  private buildLabReferenceRange(
    input: SatusehatLabObservationMapInput,
  ): SatusehatFhirObservationReferenceRange | null {
    if (this.isDimensionlessUnit(input.unit)) {
      const text = input.refText ?? this.describeBounds(input.refLow, input.refHigh);
      return text === undefined ? null : { text };
    }
    const low =
      input.refLow === undefined ? undefined : this.buildLabQuantity(input.refLow, input.unit);
    const high =
      input.refHigh === undefined ? undefined : this.buildLabQuantity(input.refHigh, input.unit);
    if (low === undefined && high === undefined && input.refText === undefined) {
      return null;
    }
    return {
      ...(low ? { low } : {}),
      ...(high ? { high } : {}),
      ...(input.refText ? { text: input.refText } : {}),
    };
  }

  /** A band as a report prints it — "1.005 - 1.03", or one side of it. */
  private describeBounds(low?: number, high?: number): string | undefined {
    if (low !== undefined && high !== undefined) {
      return `${low} - ${high}`;
    }
    if (low !== undefined) {
      return `>= ${low}`;
    }
    return high === undefined ? undefined : `<= ${high}`;
  }

  private buildDosageText(input: SatusehatMedicationRequestMapInput): string {
    const parts = [input.dosage, input.frequency, input.instructions].filter(
      (part): part is string => part !== undefined && part !== null && part.trim() !== '',
    );
    return parts.join(', ');
  }

  /**
   * A prescribed or dispensed quantity, coded as an orderable drug form when
   * the catalog unit is a dose form. The gateway rejects an uncoded unit, so
   * any other unit is dropped and the quantity goes out as a bare count.
   */
  private buildDispenseQuantity(quantity: number, unit?: string): SatusehatFhirCodedOrBareQuantity {
    const drugFormCode: string | undefined = unit ? ORDERABLE_DRUG_FORM_CODES[unit] : undefined;
    if (!drugFormCode) {
      return { value: quantity };
    }
    return {
      value: quantity,
      unit: drugFormCode,
      system: ORDERABLE_DRUG_FORM_SYSTEM,
      code: drugFormCode,
    };
  }

  /**
   * The ANC episode one pregnancy is reported under (P25-T08).
   *
   * `period.start` is the HPHT when the pregnancy has one, widened to an
   * instant by the caller: the platform refuses a date-only value
   * (Rule 10406). The identifier is our own pregnancy row, which is what makes
   * the episode findable again after a timeout.
   */
  mapAntenatalEpisodeOfCare(
    input: SatusehatAntenatalEpisodeMapInput,
  ): SatusehatFhirEpisodeOfCare {
    const organizationId = this.requireConfigValue(
      this.satusehatConfig.organizationId,
      'SATUSEHAT_ORGANIZATION_ID',
    );
    return {
      resourceType: 'EpisodeOfCare',
      identifier: [
        {
          system: buildSatusehatEpisodeOfCareIdentifierSystem(organizationId),
          use: 'official',
          value: input.pregnancyEpisodeId,
        },
      ],
      status: 'active',
      type: [
        {
          coding: [
            {
              system: SATUSEHAT_EPISODE_OF_CARE_TYPE_SYSTEM,
              code: SATUSEHAT_ANTENATAL_EPISODE_TYPE_CODE,
              display: SATUSEHAT_ANTENATAL_EPISODE_TYPE_DISPLAY,
            },
          ],
        },
      ],
      patient: this.buildReference(`Patient/${input.patientIhsNumber}`, input.patientName),
      managingOrganization: { reference: `Organization/${organizationId}` },
      period: { start: this.toFhirInstant(input.startedAt) },
    };
  }

  /**
   * The operation list that closes an episode (P25-T08).
   *
   * `/patient` is replaced although it does not change: the gateway validates
   * the operation list on its own and rejects one without a patient reference,
   * whatever else it carries.
   */
  mapAntenatalEpisodeFinishOperations(
    input: SatusehatAntenatalEpisodeFinishMapInput,
  ): SatusehatJsonPatchOperation[] {
    const start = this.toFhirInstant(input.startedAt);
    const end = this.toFhirInstant(input.endedAt);
    return [
      { op: 'replace', path: '/patient', value: { reference: `Patient/${input.patientIhsNumber}` } },
      { op: 'replace', path: '/status', value: 'finished' },
      { op: 'add', path: '/period/end', value: end },
      {
        op: 'add',
        path: '/statusHistory',
        value: [
          { status: 'active', period: { start, end } },
          { status: 'finished', period: { start: end } },
        ],
      },
    ];
  }

  /**
   * The obstetric, visit and foetal Observations of one antenatal visit
   * (P25-T08).
   *
   * Weight, height and blood pressure are not here: they go out as ordinary
   * vital signs, which the platform accepts for an ANC visit unchanged.
   */
  mapAntenatalObservations(
    input: SatusehatAntenatalObservationMapInput,
  ): SatusehatFhirObservation[] {
    return Object.entries(SATUSEHAT_ANTENATAL_OBSERVATION_DEFINITIONS).flatMap(
      ([field, definition]) => {
        const value = input.values[field as SatusehatAntenatalObservationField];
        if (value === undefined || value === null) {
          return [];
        }
        return [this.buildAntenatalObservation(input, definition, value)];
      },
    );
  }

  private buildAntenatalObservation(
    input: SatusehatAntenatalObservationMapInput,
    definition: SatusehatAntenatalObservationDefinition,
    value: number | string | Date,
  ): SatusehatFhirObservation {
    return {
      resourceType: 'Observation',
      status: 'final',
      category: [
        {
          coding: [
            {
              system: OBSERVATION_CATEGORY_SYSTEM,
              code: definition.category,
              display: ANTENATAL_OBSERVATION_CATEGORY_DISPLAYS[definition.category],
            },
          ],
        },
      ],
      code: {
        coding: [
          { system: definition.system, code: definition.code, display: definition.display },
        ],
      },
      subject: this.buildReference(`Patient/${input.patientIhsNumber}`, input.patientName),
      encounter: { reference: input.encounterReference },
      effectiveDateTime: this.toFhirInstant(input.recordedAt),
      issued: this.toFhirInstant(input.recordedAt),
      ...(input.practitionerIhsNumber
        ? { performer: [{ reference: `Practitioner/${input.practitionerIhsNumber}` }] }
        : {}),
      ...this.buildAntenatalObservationValue(definition, value),
    };
  }

  private buildAntenatalObservationValue(
    definition: SatusehatAntenatalObservationDefinition,
    value: number | string | Date,
  ): Pick<SatusehatFhirObservation, 'valueQuantity' | 'valueString' | 'valueDateTime'> {
    if (value instanceof Date) {
      return { valueDateTime: this.toFhirInstant(value) };
    }
    if (typeof value === 'number' && definition.unit && definition.ucumCode) {
      return {
        valueQuantity: {
          value,
          unit: definition.unit,
          system: UCUM_SYSTEM,
          code: definition.ucumCode,
        },
      };
    }
    return { valueString: String(value) };
  }

  private buildAntenatalEpisodeReference(
    input: SatusehatEncounterMapInput,
  ): Pick<SatusehatFhirEncounter, 'episodeOfCare'> {
    if (!input.antenatalEpisode) {
      return {};
    }
    return {
      episodeOfCare: [
        { reference: `EpisodeOfCare/${input.antenatalEpisode.satusehatEpisodeOfCareId}` },
      ],
    };
  }

  private buildAntenatalVisitIdentifier(
    input: SatusehatEncounterMapInput,
    organizationId: string,
  ): SatusehatFhirIdentifier[] {
    const visitCode = input.antenatalEpisode?.visitCode;
    if (!visitCode) {
      return [];
    }
    return [
      {
        system: buildSatusehatEpisodeOfCareIdentifierSystem(organizationId),
        use: 'official',
        value: visitCode,
      },
    ];
  }

  private buildObservation(
    input: SatusehatVitalSignsMapInput,
    definition: SatusehatVitalSignDefinition,
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
      // Required by SATUSEHAT (rule 10296). A vital sign is usable the moment
      // it is taken, so release and measurement are the same instant.
      issued: this.toFhirInstant(input.recordedAt),
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
   * How the stay ended (P24-T08, FR-IP-02). The coding is resolved by the
   * caller from the recorded disposition and the stay's length, because the
   * under/over-48-hour split on a death is arithmetic on two timestamps rather
   * than a mapping decision.
   */
  private buildHospitalization(
    input: SatusehatEncounterMapInput,
  ): Pick<SatusehatFhirEncounter, 'hospitalization'> | Record<string, never> {
    if (!input.admission) {
      return {};
    }
    const hospitalization: SatusehatFhirEncounterHospitalization = {
      dischargeDisposition: { coding: [input.admission.dischargeDisposition] },
    };
    return { hospitalization };
  }

  /**
   * Where the visit happened (FR-LOC-09, FR-IP-01).
   *
   * An outpatient visit names one Location: its poli, or whatever the caller
   * fell back to. An inpatient stay names every bed the patient occupied, in
   * order, each over the period it covered and carrying the room's service
   * class — that history is the point of reporting a stay rather than a visit.
   * A bed nobody has registered falls back to the same resolved Location the
   * outpatient path uses, so the entry still points somewhere real.
   *
   * A stay whose bed history could not be read falls back to the single entry:
   * one Location for the whole stay is what was sent before this existed, and
   * it beats reporting a stay with no place at all.
   */
  private buildEncounterLocations(
    input: SatusehatEncounterMapInput,
    fallbackLocationId: string,
  ): SatusehatFhirEncounterLocation[] {
    const admission = input.admission;
    if (admission === undefined || admission.beds.length === 0) {
      return [
        {
          // The configured display names the site, so it is only truthful
          // while the site is what the visit reports under (P24-T07). A poli's
          // Location travels as a bare reference; SATUSEHAT holds its name.
          location: this.buildReference(
            `Location/${fallbackLocationId}`,
            input.locationId === null ? this.satusehatConfig.locationName : undefined,
          ),
        },
      ];
    }
    return admission.beds.map((bed) => ({
      location: { reference: `Location/${bed.locationId ?? fallbackLocationId}` },
      period: {
        start: this.toFhirInstant(bed.startedAt),
        end: this.toFhirInstant(bed.endedAt ?? admission.dischargedAt),
      },
      ...(bed.serviceClassCode === null
        ? {}
        : {
            extension: [buildSatusehatEncounterServiceClassExtension(bed.serviceClassCode)],
          }),
    }));
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

  /**
   * The Location a visit reports under: the one the caller resolved (P24-T07),
   * else the deployment's configured site. A clinic that registered nothing
   * therefore submits exactly as it did before polis had Locations, and one
   * that configured nothing at all is still refused rather than sent an
   * Encounter with a dangling reference.
   */
  private resolveLocationId(resolvedLocationId: string | null): string {
    return (
      resolvedLocationId ??
      this.requireConfigValue(this.satusehatConfig.locationId, 'SATUSEHAT_LOCATION_ID')
    );
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
