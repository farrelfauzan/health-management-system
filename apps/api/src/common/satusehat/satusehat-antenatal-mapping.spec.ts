import { ConfigService } from '@nestjs/config';

import { SatusehatFhirMapper } from './satusehat-fhir.mapper';
import { SatusehatFhirObservation } from './satusehat-fhir.types';

const ORGANIZATION_ID = '10000004';
const PATIENT_IHS_NUMBER = 'P02478375538';
const PREGNANCY_EPISODE_ID = 'b4d5e6f7-a8b9-4c0d-8e1f-2a3b4c5d6e7f';
/** HPHT, stored as the date columns store it: midnight UTC. */
const LAST_MENSTRUAL_PERIOD_DATE = new Date('2026-03-01T00:00:00.000Z');
const FIRST_VISIT_AT = new Date('2026-07-28T02:00:00.000Z');
const ENDED_AT = new Date('2026-12-06T22:10:00.000Z');

function buildMapper(): SatusehatFhirMapper {
  const values: Record<string, string> = {
    SATUSEHAT_ORGANIZATION_ID: ORGANIZATION_ID,
    SATUSEHAT_CLIENT_ID: 'client-id',
    SATUSEHAT_CLIENT_SECRET: 'client-secret',
    SATUSEHAT_LOCATION_ID: 'location-uuid',
  };
  return new SatusehatFhirMapper({
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService);
}

function findObservation(
  observations: SatusehatFhirObservation[],
  code: string,
): SatusehatFhirObservation | undefined {
  return observations.find((observation) => observation.code.coding[0]?.code === code);
}

describe('the ANC mapping (P25-T08)', () => {
  describe('mapAntenatalEpisodeOfCare', () => {
    it('codes the episode the way the live gateway accepts, not the way the playbook documents', () => {
      const actualEpisode = buildMapper().mapAntenatalEpisodeOfCare({
        pregnancyEpisodeId: PREGNANCY_EPISODE_ID,
        patientIhsNumber: PATIENT_IHS_NUMBER,
        patientName: 'Ibu Rina',
        startedAt: LAST_MENSTRUAL_PERIOD_DATE,
      });

      // Both of these were wrong in the published ANC playbook, and both are
      // rejected outright by the gateway (Rules 10110 and 10458), so the test
      // pins the values rather than the shape.
      expect(actualEpisode.type[0]?.coding[0]).toEqual({
        system: 'http://terminology.kemkes.go.id/CodeSystem/episodeofcare-type',
        code: 'ANC',
        display: 'Antenatal Care',
      });
      expect(actualEpisode.identifier[0]).toEqual({
        system: `http://sys-ids.kemkes.go.id/episode-of-care/${ORGANIZATION_ID}`,
        use: 'official',
        value: PREGNANCY_EPISODE_ID,
      });
      expect(actualEpisode.status).toBe('active');
      expect(actualEpisode.patient).toEqual({
        reference: `Patient/${PATIENT_IHS_NUMBER}`,
        display: 'Ibu Rina',
      });
    });

    it('sends period.start as an instant, because a date-only value is refused', () => {
      const actualEpisode = buildMapper().mapAntenatalEpisodeOfCare({
        pregnancyEpisodeId: PREGNANCY_EPISODE_ID,
        patientIhsNumber: PATIENT_IHS_NUMBER,
        startedAt: LAST_MENSTRUAL_PERIOD_DATE,
      });

      expect(actualEpisode.period.start).toBe('2026-03-01T00:00:00.000Z');
      expect(actualEpisode.period.end).toBeUndefined();
    });
  });

  describe('mapAntenatalEpisodeFinishOperations', () => {
    it('replaces the patient even though it does not change', () => {
      const actualOperations = buildMapper().mapAntenatalEpisodeFinishOperations({
        patientIhsNumber: PATIENT_IHS_NUMBER,
        startedAt: LAST_MENSTRUAL_PERIOD_DATE,
        endedAt: ENDED_AT,
      });

      // Without this operation the gateway answers "patient reference can't be
      // empty" whatever else the list carries: it validates the patch document
      // alone and never reads the stored resource.
      expect(actualOperations[0]).toEqual({
        op: 'replace',
        path: '/patient',
        value: { reference: `Patient/${PATIENT_IHS_NUMBER}` },
      });
    });

    it('closes the episode with its end instant and a two-entry status history', () => {
      const actualOperations = buildMapper().mapAntenatalEpisodeFinishOperations({
        patientIhsNumber: PATIENT_IHS_NUMBER,
        startedAt: LAST_MENSTRUAL_PERIOD_DATE,
        endedAt: ENDED_AT,
      });

      expect(actualOperations).toEqual([
        expect.objectContaining({ path: '/patient' }),
        { op: 'replace', path: '/status', value: 'finished' },
        { op: 'add', path: '/period/end', value: '2026-12-06T22:10:00.000Z' },
        {
          op: 'add',
          path: '/statusHistory',
          value: [
            {
              status: 'active',
              period: {
                start: '2026-03-01T00:00:00.000Z',
                end: '2026-12-06T22:10:00.000Z',
              },
            },
            { status: 'finished', period: { start: '2026-12-06T22:10:00.000Z' } },
          ],
        },
      ]);
    });
  });

  describe('mapAntenatalObservations', () => {
    function buildK3Observations(): SatusehatFhirObservation[] {
      return buildMapper().mapAntenatalObservations({
        patientIhsNumber: PATIENT_IHS_NUMBER,
        patientName: 'Ibu Rina',
        practitionerIhsNumber: 'N10000001',
        encounterReference: 'urn:uuid:11111111-1111-4111-8111-111111111111',
        recordedAt: FIRST_VISIT_AT,
        values: {
          gravida: 2,
          para: 1,
          abortus: 0,
          lastMenstrualPeriodDate: LAST_MENSTRUAL_PERIOD_DATE,
          estimatedDeliveryDate: new Date('2026-12-06T00:00:00.000Z'),
          prePregnancyWeightKg: 52,
          gestationalAgeWeeks: 21,
          trimester: 'Trimester 2',
          muacCm: 25,
          fundalHeightCm: 21,
          bloodType: 'O',
          rhesus: 'Positive',
          fetalHeartRateBpm: 140,
          fetalPresentation: 'CEPHALIC',
          fetalHeadEngagement: 'NOT_ENGAGED',
          estimatedFetalWeightGrams: 1200,
          fetalCount: 1,
        },
      });
    }

    it('sends one Observation per recorded measurement of a full K3 visit', () => {
      const actualObservations = buildK3Observations();

      expect(actualObservations).toHaveLength(17);
      expect(
        actualObservations.every(
          (observation) =>
            observation.encounter?.reference ===
              'urn:uuid:11111111-1111-4111-8111-111111111111' &&
            observation.performer?.[0]?.reference === 'Practitioner/N10000001',
        ),
      ).toBe(true);
    });

    it('sends a quantity with its UCUM unit, a date as a dateTime, and a coded answer as text', () => {
      const actualObservations = buildK3Observations();

      expect(findObservation(actualObservations, '11881-0')?.valueQuantity).toEqual({
        value: 21,
        unit: 'cm',
        system: 'http://unitsofmeasure.org',
        code: 'cm',
      });
      expect(findObservation(actualObservations, '8665-2')?.valueDateTime).toBe(
        '2026-03-01T00:00:00.000Z',
      );
      // Not a coding: the playbook's answer lists could not be verified, and
      // the gateway validates no code, so an invented one would read as
      // authoritative to the next clinic.
      expect(findObservation(actualObservations, '72155-5')?.valueString).toBe('CEPHALIC');
    });

    it('leaves out a measurement that was not recorded rather than sending it empty', () => {
      const actualObservations = buildMapper().mapAntenatalObservations({
        patientIhsNumber: PATIENT_IHS_NUMBER,
        encounterReference: 'urn:uuid:11111111-1111-4111-8111-111111111111',
        recordedAt: FIRST_VISIT_AT,
        values: { gravida: 1, para: 0, abortus: 0 },
      });

      expect(actualObservations.map((observation) => observation.code.coding[0]?.code)).toEqual([
        '11996-6',
        '11977-6',
        '69043-8',
      ]);
    });

    it('sends no weight or blood pressure of its own — the vital signs already carry them', () => {
      const actualObservations = buildK3Observations();
      const codes = actualObservations.map((observation) => observation.code.coding[0]?.code);

      expect(codes).not.toContain('29463-7');
      expect(codes).not.toContain('8480-6');
      expect(codes).toContain('56077-1');
    });
  });

  describe('the antenatal Encounter', () => {
    function buildEncounterInput(
      antenatalEpisode?: { satusehatEpisodeOfCareId: string; visitCode: string | null },
    ) {
      return {
        encounterId: 'e1d2c3b4-a596-4877-b8a9-c0d1e2f3a4b5',
        locationId: null,
        patientIhsNumber: PATIENT_IHS_NUMBER,
        practitionerIhsNumber: 'N10000001',
        arrivedAt: FIRST_VISIT_AT,
        startedAt: FIRST_VISIT_AT,
        endedAt: new Date('2026-07-28T02:40:00.000Z'),
        ...(antenatalEpisode ? { antenatalEpisode } : {}),
      };
    }

    it('references the episode and carries the K code as a second identifier', () => {
      const actualEncounter = buildMapper().mapEncounter(
        buildEncounterInput({ satusehatEpisodeOfCareId: 'episode-uuid', visitCode: 'K3' }),
      );

      expect(actualEncounter.episodeOfCare).toEqual([
        { reference: 'EpisodeOfCare/episode-uuid' },
      ]);
      expect(actualEncounter.identifier).toEqual([
        {
          system: `http://sys-ids.kemkes.go.id/episode-of-care/${ORGANIZATION_ID}`,
          use: 'official',
          value: 'K3',
        },
        {
          system: `http://sys-ids.kemkes.go.id/encounter/${ORGANIZATION_ID}`,
          use: 'official',
          value: 'e1d2c3b4-a596-4877-b8a9-c0d1e2f3a4b5',
        },
      ]);
    });

    it('reports a visit with no K code under its own identifier alone', () => {
      const actualEncounter = buildMapper().mapEncounter(
        buildEncounterInput({ satusehatEpisodeOfCareId: 'episode-uuid', visitCode: null }),
      );

      // The platform accepts this, so a 7th visit is not a special case.
      expect(actualEncounter.identifier).toHaveLength(1);
      expect(actualEncounter.episodeOfCare).toHaveLength(1);
    });

    it('leaves an ordinary visit exactly as it was before the ANC chain existed', () => {
      const actualEncounter = buildMapper().mapEncounter(buildEncounterInput());

      expect(actualEncounter.episodeOfCare).toBeUndefined();
      expect(actualEncounter.identifier).toHaveLength(1);
    });
  });
});
