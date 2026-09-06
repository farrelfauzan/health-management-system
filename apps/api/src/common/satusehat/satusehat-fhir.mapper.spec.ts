import { ConfigService } from '@nestjs/config';

import { SatusehatFhirMapper } from './satusehat-fhir.mapper';
import { SatusehatError } from './satusehat.error';
import {
  SatusehatAllergyMapInput,
  SatusehatCompositionSectionInput,
  SatusehatProcedureMapInput,
  SatusehatVitalSignsMapInput,
} from './satusehat-fhir.types';

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

  describe('mapEncounter for an inpatient stay', () => {
    const admittedAt = new Date('2026-07-28T02:30:00.000Z');
    const dischargedAt = new Date('2026-07-30T04:00:00.000Z');

    it('reports class IMP over the admission period with a hospitalization element', () => {
      const actualEncounter = mapper.mapEncounter({
        ...buildEncounterInput(),
        admission: { admittedAt, dischargedAt },
      });

      expect(actualEncounter.class).toEqual({
        system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
        code: 'IMP',
        display: 'inpatient encounter',
      });
      expect(actualEncounter.period).toEqual({
        start: '2026-07-28T01:30:00.000Z',
        end: '2026-07-30T04:00:00.000Z',
      });
      expect(actualEncounter.hospitalization).toEqual({
        dischargeDisposition: {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/discharge-disposition',
              code: 'home',
              display: 'Home',
            },
          ],
        },
      });
    });

    it('runs in-progress from admission to discharge', () => {
      const actualEncounter = mapper.mapEncounter({
        ...buildEncounterInput(),
        admission: { admittedAt, dischargedAt },
      });

      expect(actualEncounter.statusHistory).toEqual([
        {
          status: 'arrived',
          period: { start: '2026-07-28T01:30:00.000Z', end: '2026-07-28T02:30:00.000Z' },
        },
        {
          status: 'in-progress',
          period: { start: '2026-07-28T02:30:00.000Z', end: '2026-07-30T04:00:00.000Z' },
        },
        {
          status: 'finished',
          period: { start: '2026-07-30T04:00:00.000Z', end: '2026-07-30T04:00:00.000Z' },
        },
      ]);
    });

    it('clamps an admission stamped before the encounter opened', () => {
      const actualEncounter = mapper.mapEncounter({
        ...buildEncounterInput(),
        admission: { admittedAt: new Date('2026-07-28T00:00:00.000Z'), dischargedAt },
      });

      expect(actualEncounter.statusHistory[1]?.period.start).toBe('2026-07-28T02:00:00.000Z');
    });

    it('clamps a discharge stamped before the encounter opened', () => {
      const actualEncounter = mapper.mapEncounter({
        ...buildEncounterInput(),
        admission: { admittedAt, dischargedAt: new Date('2026-07-27T00:00:00.000Z') },
      });

      expect(actualEncounter.period.end).toBe('2026-07-28T02:00:00.000Z');
    });

    it('leaves an outpatient visit ambulatory with no hospitalization element', () => {
      const actualEncounter = mapper.mapEncounter(buildEncounterInput());

      expect(actualEncounter.class.code).toBe('AMB');
      expect(actualEncounter.hospitalization).toBeUndefined();
      expect(actualEncounter.period.end).toBe('2026-07-28T02:20:00.000Z');
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

  describe('mapProcedure', () => {
    function buildProcedureInput(overrides: Partial<SatusehatProcedureMapInput> = {}) {
      return {
        procedureId: '7c1f0f2a-4b3d-4e5f-9a8b-0c1d2e3f4a5b',
        icd9cmCode: '93.94',
        icd9cmDisplay: 'Respiratory medication administered by nebulizer',
        patientIhsNumber: 'P02478375538',
        patientName: 'Budi Santoso',
        practitionerIhsNumber: 'N10000001',
        practitionerName: 'dr. Sari Wulandari',
        encounterReference: 'urn:uuid:encounter-entry',
        performedAt: new Date('2026-07-28T02:10:00.000Z'),
        encounterStartedAt: startedAt,
        encounterEndedAt: endedAt,
        notes: 'Nebulisasi 10 menit',
        ...overrides,
      };
    }

    it('maps an ICD-9-CM-coded procedure to a completed Procedure', () => {
      const actualProcedure = mapper.mapProcedure(buildProcedureInput());

      expect(actualProcedure).toEqual({
        resourceType: 'Procedure',
        identifier: [
          {
            system: 'http://sys-ids.kemkes.go.id/procedure/10000004',
            use: 'official',
            value: '7c1f0f2a-4b3d-4e5f-9a8b-0c1d2e3f4a5b',
          },
        ],
        status: 'completed',
        code: {
          coding: [
            {
              system: 'http://hl7.org/fhir/sid/icd-9-cm',
              code: '93.94',
              display: 'Respiratory medication administered by nebulizer',
            },
          ],
        },
        subject: { reference: 'Patient/P02478375538', display: 'Budi Santoso' },
        encounter: { reference: 'urn:uuid:encounter-entry' },
        performedPeriod: {
          start: '2026-07-28T02:10:00.000Z',
          end: '2026-07-28T02:10:00.000Z',
        },
        performer: [
          {
            actor: { reference: 'Practitioner/N10000001', display: 'dr. Sari Wulandari' },
          },
        ],
        note: [{ text: 'Nebulisasi 10 menit' }],
      });
    });

    it('omits the note when the procedure carries none', () => {
      const actualProcedure = mapper.mapProcedure(buildProcedureInput({ notes: undefined }));

      expect(actualProcedure.note).toBeUndefined();
    });

    it('omits the note when the recorded text is only whitespace', () => {
      const actualProcedure = mapper.mapProcedure(buildProcedureInput({ notes: '   ' }));

      expect(actualProcedure.note).toBeUndefined();
    });

    it('omits the performer when the doctor has no IHS practitioner number', () => {
      const actualProcedure = mapper.mapProcedure(
        buildProcedureInput({ practitionerIhsNumber: undefined }),
      );

      expect(actualProcedure.performer).toBeUndefined();
    });

    it('clamps a procedure performed before the encounter opened to the encounter start', () => {
      const actualProcedure = mapper.mapProcedure(
        buildProcedureInput({ performedAt: new Date('2026-07-28T01:00:00.000Z') }),
      );

      expect(actualProcedure.performedPeriod).toEqual({
        start: '2026-07-28T02:00:00.000Z',
        end: '2026-07-28T02:00:00.000Z',
      });
    });

    it('clamps a procedure performed after the encounter closed to the encounter end', () => {
      const actualProcedure = mapper.mapProcedure(
        buildProcedureInput({ performedAt: new Date('2026-07-28T05:00:00.000Z') }),
      );

      expect(actualProcedure.performedPeriod).toEqual({
        start: '2026-07-28T02:20:00.000Z',
        end: '2026-07-28T02:20:00.000Z',
      });
    });
  });

  describe('mapImmunization', () => {
    function buildImmunizationInput(overrides: Record<string, unknown> = {}) {
      return {
        immunizationId: '3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f',
        kfaCode: '93000123',
        vaccineName: 'Vaksin DPT-HB-Hib',
        patientIhsNumber: 'P02478375538',
        patientName: 'Budi Santoso',
        encounterReference: 'urn:uuid:encounter-entry',
        occurredAt: startedAt,
        lotNumber: 'LOT-DPT-2026-04',
        expirationDate: '2027-04-30',
        doseNumber: 3,
        route: 'IM' as const,
        site: 'LEFT_THIGH' as const,
        performerIhsNumber: 'N10000001',
        performerName: 'dr. Sari Wulandari',
        ...overrides,
      };
    }

    it('maps a KFA-coded vaccination to a completed Immunization', () => {
      const actualImmunization = mapper.mapImmunization(buildImmunizationInput());

      expect(actualImmunization).toEqual({
        resourceType: 'Immunization',
        identifier: [
          {
            system: 'http://sys-ids.kemkes.go.id/immunization/10000004',
            use: 'official',
            value: '3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f',
          },
        ],
        status: 'completed',
        vaccineCode: {
          coding: [
            {
              system: 'http://sys-ids.kemkes.go.id/kfa',
              code: '93000123',
              display: 'Vaksin DPT-HB-Hib',
            },
          ],
        },
        patient: { reference: 'Patient/P02478375538', display: 'Budi Santoso' },
        encounter: { reference: 'urn:uuid:encounter-entry' },
        occurrenceDateTime: '2026-07-28T02:00:00.000Z',
        lotNumber: 'LOT-DPT-2026-04',
        expirationDate: '2027-04-30',
        site: {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/v3-ActSite',
              code: 'LT',
              display: 'Left thigh',
            },
          ],
        },
        route: {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/v3-RouteOfAdministration',
              code: 'IM',
              display: 'Injection, intramuscular',
            },
          ],
        },
        performer: [
          { actor: { reference: 'Practitioner/N10000001', display: 'dr. Sari Wulandari' } },
        ],
        protocolApplied: [{ doseNumberPositiveInt: 3 }],
      });
    });

    it('omits the dose when none was recorded, rather than sending 1', () => {
      const actualImmunization = mapper.mapImmunization(
        buildImmunizationInput({ doseNumber: undefined }),
      );

      expect(actualImmunization.protocolApplied).toBeUndefined();
    });

    it('omits the lot and expiry a nurse copying from a card may not have', () => {
      const actualImmunization = mapper.mapImmunization(
        buildImmunizationInput({ lotNumber: undefined, expirationDate: undefined }),
      );

      expect(actualImmunization.lotNumber).toBeUndefined();
      expect(actualImmunization.expirationDate).toBeUndefined();
    });

    it('omits site OTHER, because v3 has no code for "somewhere else"', () => {
      const actualImmunization = mapper.mapImmunization(
        buildImmunizationInput({ site: 'OTHER' }),
      );

      expect(actualImmunization.site).toBeUndefined();
    });

    it.each([
      ['SC' as const, 'SQ'],
      ['ID' as const, 'IDINJ'],
      ['ORAL' as const, 'PO'],
      ['NASAL' as const, 'NASINHL'],
    ])('maps route %s to the v3 code %s', (route, expectedCode) => {
      const actualImmunization = mapper.mapImmunization(buildImmunizationInput({ route }));

      expect(actualImmunization.route?.coding[0]?.code).toBe(expectedCode);
    });
  });

  describe('mapAllergyToAllergyIntolerance', () => {
    function buildAllergyInput(overrides: Partial<SatusehatAllergyMapInput> = {}) {
      return {
        allergyId: '9d2e1a3b-5c4f-4e6a-8b7c-0d1e2f3a4b5c',
        substance: 'Amoksisilin',
        reaction: 'Ruam dan gatal seluruh badan',
        severity: 'SEVERE' as const,
        patientIhsNumber: 'P02478375538',
        patientName: 'Budi Santoso',
        encounterReference: 'urn:uuid:encounter-entry',
        recordedAt: startedAt,
        recorderIhsNumber: 'N10000001',
        recorderName: 'dr. Sari Wulandari',
        ...overrides,
      };
    }

    it('maps a recorded allergy to a confirmed, active AllergyIntolerance', () => {
      const actualAllergy = mapper.mapAllergyToAllergyIntolerance(buildAllergyInput());

      expect(actualAllergy).toEqual({
        resourceType: 'AllergyIntolerance',
        identifier: [
          {
            system: 'http://sys-ids.kemkes.go.id/allergy/10000004',
            use: 'official',
            value: '9d2e1a3b-5c4f-4e6a-8b7c-0d1e2f3a4b5c',
          },
        ],
        clinicalStatus: {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical',
              code: 'active',
              display: 'Active',
            },
          ],
        },
        verificationStatus: {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification',
              code: 'confirmed',
              display: 'Confirmed',
            },
          ],
        },
        code: { text: 'Amoksisilin' },
        criticality: 'high',
        patient: { reference: 'Patient/P02478375538', display: 'Budi Santoso' },
        encounter: { reference: 'urn:uuid:encounter-entry' },
        recordedDate: '2026-07-28T02:00:00.000Z',
        recorder: { reference: 'Practitioner/N10000001', display: 'dr. Sari Wulandari' },
        reaction: [{ description: 'Ruam dan gatal seluruh badan' }],
      });
    });

    it('sends the substance as text with no coding — a guessed allergen code is worse than none', () => {
      const actualAllergy = mapper.mapAllergyToAllergyIntolerance(buildAllergyInput());

      expect(actualAllergy.code.coding).toBeUndefined();
    });

    it.each([
      ['SEVERE' as const, 'high' as const],
      ['MODERATE' as const, 'low' as const],
      ['MILD' as const, 'low' as const],
    ])('maps severity %s to criticality %s', (severity, expectedCriticality) => {
      const actualAllergy = mapper.mapAllergyToAllergyIntolerance(
        buildAllergyInput({ severity }),
      );

      expect(actualAllergy.criticality).toBe(expectedCriticality);
    });

    it('omits the reaction element when none was recorded', () => {
      const actualAllergy = mapper.mapAllergyToAllergyIntolerance(
        buildAllergyInput({ reaction: undefined }),
      );

      expect(actualAllergy.reaction).toBeUndefined();
    });

    it('omits the recorder when the row predates this encounter', () => {
      const actualAllergy = mapper.mapAllergyToAllergyIntolerance(
        buildAllergyInput({ recorderIhsNumber: undefined }),
      );

      expect(actualAllergy.recorder).toBeUndefined();
    });
  });

  describe('mapComposition', () => {
    function buildCompositionInput(sections: SatusehatCompositionSectionInput[]) {
      return {
        encounterId: 'e1d2c3b4-a596-4877-b8a9-c0d1e2f3a4b5',
        patientIhsNumber: 'P02478375538',
        patientName: 'Budi Santoso',
        practitionerIhsNumber: 'N10000001',
        practitionerName: 'dr. Sari Wulandari',
        encounterReference: 'urn:uuid:encounter-entry',
        endedAt,
        sections,
      };
    }

    it('titles the document and codes it as the rawat-jalan resume', () => {
      const actualComposition = mapper.mapComposition(
        buildCompositionInput([{ title: 'Anamnesis', narrative: 'Batuk 3 hari' }]),
      );

      expect(actualComposition.title).toBe('Resume Medis Rawat Jalan');
      expect(actualComposition.type.coding[0]).toEqual({
        system: 'http://loinc.org',
        code: '18842-5',
        display: 'Discharge summary',
      });
      expect(actualComposition.custodian).toEqual({ reference: 'Organization/10000004' });
      expect(actualComposition.date).toBe('2026-07-28T02:20:00.000Z');
      expect(actualComposition.author[0]?.reference).toBe('Practitioner/N10000001');
    });

    it('renders typed markup as literal characters, not tags', () => {
      const actualComposition = mapper.mapComposition(
        buildCompositionInput([
          { title: 'Rencana', narrative: 'Lanjutkan <b>amoksisilin</b> & kontrol' },
        ]),
      );

      expect(actualComposition.section[0]?.text?.div).toBe(
        '<div xmlns="http://www.w3.org/1999/xhtml"><p>Lanjutkan &lt;b&gt;amoksisilin&lt;/b&gt; &amp; kontrol</p></div>',
      );
    });

    it('omits a section with neither narrative nor entries', () => {
      const actualComposition = mapper.mapComposition(
        buildCompositionInput([
          { title: 'Anamnesis', narrative: 'Batuk 3 hari' },
          { title: 'Tindakan', entryReferences: [] },
          { title: 'Rencana', narrative: '   ' },
        ]),
      );

      expect(actualComposition.section.map((section) => section.title)).toEqual(['Anamnesis']);
    });

    it('points a section at the bundle-local entries it summarises', () => {
      const actualComposition = mapper.mapComposition(
        buildCompositionInput([
          { title: 'Diagnosis', entryReferences: ['urn:uuid:cond-1', 'urn:uuid:cond-2'] },
        ]),
      );

      expect(actualComposition.section[0]?.entry).toEqual([
        { reference: 'urn:uuid:cond-1' },
        { reference: 'urn:uuid:cond-2' },
      ]);
    });
  });

  describe('mapClinicalImpression', () => {
    function buildImpressionInput(overrides: Record<string, unknown> = {}) {
      return {
        encounterId: 'e1d2c3b4-a596-4877-b8a9-c0d1e2f3a4b5',
        patientIhsNumber: 'P02478375538',
        patientName: 'Budi Santoso',
        practitionerIhsNumber: 'N10000001',
        practitionerName: 'dr. Sari Wulandari',
        encounterReference: 'urn:uuid:encounter-entry',
        endedAt,
        summary: 'ISPA viral, perbaikan diharapkan dalam 5 hari',
        findingReferences: ['urn:uuid:cond-1'],
        prognosis: 'BONAM' as const,
        ...overrides,
      };
    }

    it('carries the assessment narrative, the findings and the prognosis', () => {
      const actualImpression = mapper.mapClinicalImpression(buildImpressionInput());

      expect(actualImpression.summary).toBe('ISPA viral, perbaikan diharapkan dalam 5 hari');
      expect(actualImpression.finding).toEqual([
        { itemReference: { reference: 'urn:uuid:cond-1' } },
      ]);
      expect(actualImpression.prognosisCodeableConcept).toEqual([
        {
          coding: [
            { system: 'http://snomed.info/sct', code: '170968001', display: 'Prognosis good' },
          ],
          text: 'BONAM',
        },
      ]);
    });

    it.each([
      ['BONAM' as const, '170968001'],
      ['DUBIA_AD_BONAM' as const, '170969009'],
      ['DUBIA_AD_MALAM' as const, '170970005'],
      ['MALAM' as const, '170970005'],
    ])('maps %s to SNOMED %s', (prognosis, expectedCode) => {
      const actualImpression = mapper.mapClinicalImpression(buildImpressionInput({ prognosis }));

      expect(actualImpression.prognosisCodeableConcept?.[0]?.coding?.[0]?.code).toBe(expectedCode);
    });

    it('keeps the recorded term in text where two values share one SNOMED grade', () => {
      const actualImpression = mapper.mapClinicalImpression(
        buildImpressionInput({ prognosis: 'MALAM' }),
      );

      expect(actualImpression.prognosisCodeableConcept?.[0]?.text).toBe('MALAM');
    });

    it('omits the prognosis element when none was recorded', () => {
      const actualImpression = mapper.mapClinicalImpression(
        buildImpressionInput({ prognosis: undefined }),
      );

      expect(actualImpression.prognosisCodeableConcept).toBeUndefined();
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
