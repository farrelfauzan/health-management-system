import { SatusehatFhirCodeableConcept, SatusehatFhirExtension } from './satusehat-fhir.types';

const SERVICE_CLASS_EXTENSION_URL =
  'https://fhir.kemkes.go.id/r4/StructureDefinition/LocationServiceClass';
const INPATIENT_SERVICE_CLASS_SYSTEM =
  'http://terminology.kemkes.go.id/CodeSystem/locationServiceClass-Inpatient';
const UPGRADE_CLASS_SYSTEM = 'http://terminology.kemkes.go.id/CodeSystem/locationUpgradeClass';
/**
 * The published guide's narrative calls this sub-extension
 * `upgradeClassIndicator` and its own example calls it `upgradeClass` (PRD
 * §13.2, UNVERIFIED). The narrative wins here because it is the normative
 * text; a sandbox submission settles it, and only this constant changes.
 */
const UPGRADE_CLASS_EXTENSION_NAME = 'upgradeClassIndicator';
/**
 * Every stay we report keeps the class it was admitted into. `naik-kelas` and
 * `turun-kelas` need the class the patient is entitled to, which the clinic
 * does not record (FR-IP-04, open question Q7), and guessing an upgrade from a
 * bed move would put a billing claim in the national record.
 */
const UNCHANGED_UPGRADE_CLASS_CODE = 'kelas-tetap';
const SERVICE_CLASS_DISPLAY: Readonly<Record<string, string>> = {
  '1': 'Kelas 1',
  '2': 'Kelas 2',
  '3': 'Kelas 3',
  vip: 'Kelas VIP',
  vvip: 'Kelas VVIP',
};

/**
 * The inpatient service class as a Location resource carries it (P24-T06):
 * the class alone, with no upgrade indicator — a Location describes the bed,
 * not one patient's stay in it.
 */
export function buildSatusehatServiceClassExtension(code: string): SatusehatFhirExtension {
  return {
    url: SERVICE_CLASS_EXTENSION_URL,
    valueCodeableConcept: buildServiceClassConcept(code),
  };
}

/**
 * The same class as one entry of an inpatient `Encounter.location[]` carries
 * it (P24-T08, FR-IP-01): the class plus the upgrade indicator, because here
 * it describes what the patient was given for that part of the stay.
 */
export function buildSatusehatEncounterServiceClassExtension(code: string): SatusehatFhirExtension {
  return {
    url: SERVICE_CLASS_EXTENSION_URL,
    extension: [
      { url: 'serviceClass', valueCodeableConcept: buildServiceClassConcept(code) },
      {
        url: UPGRADE_CLASS_EXTENSION_NAME,
        valueCodeableConcept: {
          coding: [
            {
              system: UPGRADE_CLASS_SYSTEM,
              code: UNCHANGED_UPGRADE_CLASS_CODE,
              display: 'Kelas tetap',
            },
          ],
        },
      },
    ],
  };
}

function buildServiceClassConcept(code: string): SatusehatFhirCodeableConcept {
  return {
    coding: [
      {
        system: INPATIENT_SERVICE_CLASS_SYSTEM,
        code,
        display: SERVICE_CLASS_DISPLAY[code] ?? code,
      },
    ],
  };
}
