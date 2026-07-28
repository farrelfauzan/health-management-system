import { ConfigService } from '@nestjs/config';

import { SatusehatFhirMapper } from './satusehat-fhir.mapper';
import { SatusehatError } from './satusehat.error';
import { SatusehatVitalSignsMapInput } from './satusehat-fhir.types';

function buildConfigService(overrides: Record<string, string> = {}): ConfigService {
  const values: Record<string, string> = {
    SATUSEHAT_ORGANIZATION_ID: '10000004',
    SATUSEHAT_CLIENT_ID: 'client-id',
    SATUSEHAT_CLIENT_SECRET: 'client-secret',
    SATUSEHAT_LOCATION_ID: 'location-uuid',
    SATUSEHAT_LOCATION_NAME: 'Ruang Periksa Umum',
    ...overrides,
  };
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

const arrivedAt = new Date('2026-07-28T01:30:00.000Z');
const startedAt = new Date('2026-07-28T02:00:00.000Z');
const endedAt = new Date('2026-07-28T02:20:00.000Z');

function buildEncounterInput() {
  return {
    encounterId: 'e1d2c3b4-a596-4877-b8a9-c0d1e2f3a4b5',
    patientIhsNumber: 'P02478375538',
    patientName: 'Budi Santoso',
    practitionerIhsNumber: 'N10000001',
    practitionerName: 'dr. Sari Wulandari',
    arrivedAt,
    startedAt,
    endedAt,
  };
}

function buildVitalSignsInput(
  overrides: Partial<SatusehatVitalSignsMapInput> = {},
): SatusehatVitalSignsMapInput {
  return {
    patientIhsNumber: 'P02478375538',
    practitionerIhsNumber: 'N10000001',
    encounterReference: 'urn:uuid:encounter-entry',
    recordedAt: startedAt,
    heightCm: 165,
    weightKg: 60.5,
    systolicBloodPressure: 120,
    diastolicBloodPressure: 80,
    pulseRate: 72,
    respiratoryRate: 18,
    temperatureCelsius: 36.8,
    oxygenSaturation: 98,
    ...overrides,
  };
}

describe('SatusehatFhirMapper', () => {
  const mapper = new SatusehatFhirMapper(buildConfigService());

  describe('mapEncounter', () => {
    it('maps a finished encounter with the mandated status history', () => {
      const actualEncounter = mapper.mapEncounter(buildEncounterInput());

      expect(actualEncounter.resourceType).toBe('Encounter');
      expect(actualEncounter.identifier).toEqual([
        {
          system: 'http://sys-ids.kemkes.go.id/encounter/10000004',
          use: 'official',
          value: 'e1d2c3b4-a596-4877-b8a9-c0d1e2f3a4b5',
        },
      ]);
      expect(actualEncounter.status).toBe('finished');
      expect(actualEncounter.class).toEqual({
        system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
        code: 'AMB',
        display: 'ambulatory',
      });
      expect(actualEncounter.subject).toEqual({
        reference: 'Patient/P02478375538',
        display: 'Budi Santoso',
      });
      expect(actualEncounter.participant[0]?.individual).toEqual({
        reference: 'Practitioner/N10000001',
        display: 'dr. Sari Wulandari',
      });
      expect(actualEncounter.location).toEqual([
        { location: { reference: 'Location/location-uuid', display: 'Ruang Periksa Umum' } },
      ]);
      expect(actualEncounter.period).toEqual({
        start: '2026-07-28T01:30:00.000Z',
        end: '2026-07-28T02:20:00.000Z',
      });
      expect(actualEncounter.statusHistory).toEqual([
        {
          status: 'arrived',
          period: { start: '2026-07-28T01:30:00.000Z', end: '2026-07-28T02:00:00.000Z' },
        },
        {
          status: 'in-progress',
          period: { start: '2026-07-28T02:00:00.000Z', end: '2026-07-28T02:20:00.000Z' },
        },
        {
          status: 'finished',
          period: { start: '2026-07-28T02:20:00.000Z', end: '2026-07-28T02:20:00.000Z' },
        },
      ]);
      expect(actualEncounter.serviceProvider).toEqual({ reference: 'Organization/10000004' });
      expect(actualEncounter.diagnosis).toBeUndefined();
    });

    it('ranks condition references in the encounter diagnosis list', () => {
      const actualEncounter = mapper.mapEncounter({
        ...buildEncounterInput(),
        conditionReferences: [
          { reference: 'urn:uuid:condition-primary', rank: 1 },
          { reference: 'urn:uuid:condition-secondary', rank: 2 },
        ],
      });

      expect(actualEncounter.diagnosis).toEqual([
        {
          condition: { reference: 'urn:uuid:condition-primary' },
          use: {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/diagnosis-role',
                code: 'DD',
                display: 'Discharge diagnosis',
              },
            ],
          },
          rank: 1,
        },
        {
          condition: { reference: 'urn:uuid:condition-secondary' },
          use: {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/diagnosis-role',
                code: 'DD',
                display: 'Discharge diagnosis',
              },
            ],
          },
          rank: 2,
        },
      ]);
    });

    it('clamps a check-in stamped after the encounter opened', () => {
      const actualEncounter = mapper.mapEncounter({
        ...buildEncounterInput(),
        arrivedAt: new Date('2026-07-28T02:05:00.000Z'),
      });

      expect(actualEncounter.period.start).toBe('2026-07-28T02:00:00.000Z');
      expect(actualEncounter.statusHistory[0]?.period).toEqual({
        start: '2026-07-28T02:00:00.000Z',
        end: '2026-07-28T02:00:00.000Z',
      });
    });

    it('throws SATUSEHAT_NOT_CONFIGURED when the location is not registered', () => {
      const unconfiguredMapper = new SatusehatFhirMapper(
        buildConfigService({ SATUSEHAT_LOCATION_ID: '' }),
      );

      const actualError = (() => {
        try {
          unconfiguredMapper.mapEncounter(buildEncounterInput());
          return null;
        } catch (err) {
          return err;
        }
      })();

      expect(actualError).toBeInstanceOf(SatusehatError);
      expect((actualError as SatusehatError).code).toBe('SATUSEHAT_NOT_CONFIGURED');
      expect((actualError as SatusehatError).message).toContain('SATUSEHAT_LOCATION_ID');
    });
  });

  describe('mapDiagnosisToCondition', () => {
    it('maps a diagnosis snapshot to an encounter-diagnosis Condition', () => {
      const actualCondition = mapper.mapDiagnosisToCondition({
        icd10Code: 'J06.9',
        icd10Display: 'Acute upper respiratory infection, unspecified',
        patientIhsNumber: 'P02478375538',
        patientName: 'Budi Santoso',
        encounterReference: 'urn:uuid:encounter-entry',
        recordedAt: startedAt,
      });

      expect(actualCondition).toEqual({
        resourceType: 'Condition',
        clinicalStatus: {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
              code: 'active',
              display: 'Active',
            },
          ],
        },
        category: [
          {
            coding: [
              {
                system: 'http://terminology.hl7.org/CodeSystem/condition-category',
                code: 'encounter-diagnosis',
                display: 'Encounter Diagnosis',
              },
            ],
          },
        ],
        code: {
          coding: [
            {
              system: 'http://hl7.org/fhir/sid/icd-10',
              code: 'J06.9',
              display: 'Acute upper respiratory infection, unspecified',
            },
          ],
        },
        subject: { reference: 'Patient/P02478375538', display: 'Budi Santoso' },
        encounter: { reference: 'urn:uuid:encounter-entry' },
        recordedDate: '2026-07-28T02:00:00.000Z',
      });
    });
  });

  describe('medication mapping', () => {
    it('maps a KFA-coded catalog item to a Medication with the type extension', () => {
      const actualMedication = mapper.mapMedicationToResource({
        medicationCode: 'PARA-500',
        kfaCode: '93001019',
        name: 'Paracetamol 500 mg Tablet',
      });

      expect(actualMedication).toEqual({
        resourceType: 'Medication',
        identifier: [
          {
            system: 'http://sys-ids.kemkes.go.id/medication/10000004',
            use: 'official',
            value: 'PARA-500',
          },
        ],
        status: 'active',
        code: {
          coding: [
            {
              system: 'http://sys-ids.kemkes.go.id/kfa',
              code: '93001019',
              display: 'Paracetamol 500 mg Tablet',
            },
          ],
        },
        extension: [
          {
            url: 'https://fhir.kemkes.go.id/r4/StructureDefinition/MedicationType',
            valueCodeableConcept: {
              coding: [
                {
                  system: 'https://terminology.kemkes.go.id/CodeSystem/medication-type',
                  code: 'NC',
                  display: 'Non-compound',
                },
              ],
            },
          },
        ],
      });
    });

    it('maps a prescription item to a MedicationRequest with dual identifiers and textual dosage', () => {
      const actualRequest = mapper.mapPrescriptionItemToMedicationRequest({
        prescriptionId: 'presc-1',
        prescriptionItemId: 'presc-item-1',
        medicationReference: 'urn:uuid:medication-entry',
        medicationDisplay: 'Paracetamol 500 mg Tablet',
        patientIhsNumber: 'P02478375538',
        practitionerIhsNumber: 'N10000001',
        encounterReference: 'urn:uuid:encounter-entry',
        dosage: '500 mg',
        frequency: '3x sehari',
        instructions: 'Sesudah makan',
        quantity: 15,
        unit: 'TABLET',
        authoredOn: startedAt,
      });

      expect(actualRequest.identifier).toEqual([
        {
          system: 'http://sys-ids.kemkes.go.id/prescription/10000004',
          use: 'official',
          value: 'presc-1',
        },
        {
          system: 'http://sys-ids.kemkes.go.id/prescription-item/10000004',
          use: 'official',
          value: 'presc-item-1',
        },
      ]);
      expect(actualRequest.status).toBe('completed');
      expect(actualRequest.intent).toBe('order');
      expect(actualRequest.dosageInstruction).toEqual([
        { sequence: 1, text: '500 mg, 3x sehari, Sesudah makan' },
      ]);
      expect(actualRequest.dispenseRequest.quantity).toEqual({ value: 15, unit: 'TABLET' });
      expect(actualRequest.authoredOn).toBe('2026-07-28T02:00:00.000Z');
      expect(actualRequest.substitution).toEqual({ allowedBoolean: false });
    });

    it('maps a dispense item to a MedicationDispense performed by the Organization', () => {
      const actualDispense = mapper.mapDispenseItemToMedicationDispense({
        dispenseRecordId: 'disp-1',
        dispenseItemId: 'disp-item-1',
        medicationReference: 'urn:uuid:medication-entry',
        medicationDisplay: 'Paracetamol 500 mg Tablet',
        patientIhsNumber: 'P02478375538',
        encounterReference: 'urn:uuid:encounter-entry',
        medicationRequestReference: 'urn:uuid:request-entry',
        quantity: 15,
        unit: 'TABLET',
        dispensedAt: endedAt,
      });

      expect(actualDispense.identifier).toEqual([
        {
          system: 'http://sys-ids.kemkes.go.id/medicationdispense/10000004',
          use: 'official',
          value: 'disp-1',
        },
        {
          system: 'http://sys-ids.kemkes.go.id/prescription-item/10000004',
          use: 'official',
          value: 'disp-item-1',
        },
      ]);
      expect(actualDispense.performer).toEqual([
        { actor: { reference: 'Organization/10000004' } },
      ]);
      expect(actualDispense.authorizingPrescription).toEqual([
        { reference: 'urn:uuid:request-entry' },
      ]);
      expect(actualDispense.context).toEqual({ reference: 'urn:uuid:encounter-entry' });
      expect(actualDispense.whenHandedOver).toBe('2026-07-28T02:20:00.000Z');
      expect(actualDispense.substitution).toEqual({ wasSubstituted: false });
    });

    it('drops empty dosage parts and the authorizingPrescription when absent', () => {
      const actualRequest = mapper.mapPrescriptionItemToMedicationRequest({
        prescriptionId: 'presc-1',
        prescriptionItemId: 'presc-item-2',
        medicationReference: 'urn:uuid:medication-entry',
        medicationDisplay: 'Amoxicillin',
        patientIhsNumber: 'P02478375538',
        practitionerIhsNumber: 'N10000001',
        encounterReference: 'urn:uuid:encounter-entry',
        dosage: '500 mg',
        frequency: '3x sehari',
        quantity: 15,
      });
      const actualDispense = mapper.mapDispenseItemToMedicationDispense({
        dispenseRecordId: 'disp-1',
        dispenseItemId: 'disp-item-2',
        medicationReference: 'urn:uuid:medication-entry',
        medicationDisplay: 'Amoxicillin',
        patientIhsNumber: 'P02478375538',
        encounterReference: 'urn:uuid:encounter-entry',
        quantity: 15,
        dispensedAt: endedAt,
      });

      expect(actualRequest.dosageInstruction[0]?.text).toBe('500 mg, 3x sehari');
      expect(actualRequest.dispenseRequest.quantity).toEqual({ value: 15 });
      expect(actualDispense.authorizingPrescription).toBeUndefined();
      expect(actualDispense.quantity).toEqual({ value: 15 });
    });
  });

  describe('mapVitalSignsToObservations', () => {
    it('maps a full vitals row to eight LOINC-coded observations', () => {
      const actualObservations = mapper.mapVitalSignsToObservations(buildVitalSignsInput());

      expect(actualObservations).toHaveLength(8);
      const actualCodings = actualObservations.map((observation) => ({
        loincCode: observation.code.coding[0]?.code,
        value: observation.valueQuantity.value,
        unit: observation.valueQuantity.unit,
        ucumCode: observation.valueQuantity.code,
      }));
      expect(actualCodings).toEqual([
        { loincCode: '8302-2', value: 165, unit: 'cm', ucumCode: 'cm' },
        { loincCode: '29463-7', value: 60.5, unit: 'kg', ucumCode: 'kg' },
        { loincCode: '8480-6', value: 120, unit: 'mmHg', ucumCode: 'mm[Hg]' },
        { loincCode: '8462-4', value: 80, unit: 'mmHg', ucumCode: 'mm[Hg]' },
        { loincCode: '8867-4', value: 72, unit: 'beats/minute', ucumCode: '/min' },
        { loincCode: '9279-1', value: 18, unit: 'breaths/minute', ucumCode: '/min' },
        { loincCode: '8310-5', value: 36.8, unit: 'C', ucumCode: 'Cel' },
        { loincCode: '2708-6', value: 98, unit: '%', ucumCode: '%' },
      ]);
      const firstObservation = actualObservations[0];
      expect(firstObservation?.status).toBe('final');
      expect(firstObservation?.category[0]?.coding[0]?.code).toBe('vital-signs');
      expect(firstObservation?.code.coding[0]?.system).toBe('http://loinc.org');
      expect(firstObservation?.valueQuantity.system).toBe('http://unitsofmeasure.org');
      expect(firstObservation?.subject).toEqual({ reference: 'Patient/P02478375538' });
      expect(firstObservation?.encounter).toEqual({ reference: 'urn:uuid:encounter-entry' });
      expect(firstObservation?.performer).toEqual([{ reference: 'Practitioner/N10000001' }]);
      expect(firstObservation?.effectiveDateTime).toBe('2026-07-28T02:00:00.000Z');
    });

    it('skips null measurements so a sparse row maps to fewer observations', () => {
      const actualObservations = mapper.mapVitalSignsToObservations(
        buildVitalSignsInput({
          heightCm: null,
          pulseRate: null,
          respiratoryRate: null,
          temperatureCelsius: null,
          oxygenSaturation: null,
        }),
      );

      expect(actualObservations.map((observation) => observation.code.coding[0]?.code)).toEqual([
        '29463-7',
        '8480-6',
        '8462-4',
      ]);
    });

    it('omits the performer when no practitioner IHS number is available', () => {
      const actualObservations = mapper.mapVitalSignsToObservations(
        buildVitalSignsInput({ practitionerIhsNumber: undefined }),
      );

      expect(actualObservations[0]?.performer).toBeUndefined();
    });
  });
});
