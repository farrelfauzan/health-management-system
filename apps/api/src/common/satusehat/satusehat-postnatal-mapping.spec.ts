import { ConfigService } from '@nestjs/config';

import { SATUSEHAT_PNC_PROBE_FIXTURES } from '../../modules/satusehat/fixtures/satusehat-pnc-probe-fixtures';
import { SatusehatFhirMapper } from './satusehat-fhir.mapper';
import { SatusehatPostnatalMapper } from './satusehat-postnatal.mapper';

const ORGANIZATION_ID = '10000004';
const PATIENT_IHS_NUMBER = 'P02478375538';
const PRACTITIONER_IHS_NUMBER = '10009880728';
const PREGNANCY_EPISODE_ID = 'b4d5e6f7-a8b9-4c0d-8e1f-2a3b4c5d6e7f';
const BIRTH_AT = new Date('2026-09-11T08:00:00.000Z');
const RECORDED_AT = new Date('2026-09-16T03:00:00.000Z');

function buildConfig(): ConfigService {
  const values: Record<string, string> = {
    SATUSEHAT_ORGANIZATION_ID: ORGANIZATION_ID,
    SATUSEHAT_CLIENT_ID: 'client-id',
    SATUSEHAT_CLIENT_SECRET: 'client-secret',
    SATUSEHAT_LOCATION_ID: 'location-uuid',
  };
  return { get: jest.fn((key: string) => values[key]) } as unknown as ConfigService;
}

/**
 * The PNC mapping (P25-T12), pinned to what the staging sandbox accepted
 * rather than to the playbook, which named the type system with `https://` —
 * refused by the gateway.
 */
describe('the PNC mapping (P25-T12)', () => {
  const postnatalMapper = new SatusehatPostnatalMapper(buildConfig());

  it('codes the episode the way the sandbox accepted it', () => {
    const actualEpisode = postnatalMapper.mapPostnatalEpisodeOfCare({
      pregnancyEpisodeId: PREGNANCY_EPISODE_ID,
      patientIhsNumber: PATIENT_IHS_NUMBER,
      startedAt: BIRTH_AT,
    });

    expect(actualEpisode.type[0]?.coding[0]).toEqual(SATUSEHAT_PNC_PROBE_FIXTURES.episodeOfCareType);
    expect(actualEpisode.identifier[0]).toEqual({
      system: SATUSEHAT_PNC_PROBE_FIXTURES.episodeOfCareIdentifierSystem.replace('<org>', ORGANIZATION_ID),
      use: 'official',
      value: PREGNANCY_EPISODE_ID,
    });
    expect(actualEpisode.status).toBe('active');
    expect(actualEpisode.period).toEqual({ start: BIRTH_AT.toISOString() });
  });

  it('maps every recorded nifas finding to the coding and value the sandbox accepted', () => {
    const actualObservations = postnatalMapper.mapPostnatalObservations({
      patientIhsNumber: PATIENT_IHS_NUMBER,
      practitionerIhsNumber: PRACTITIONER_IHS_NUMBER,
      encounterReference: 'urn:uuid:encounter',
      recordedAt: RECORDED_AT,
      values: {
        deliveryDate: BIRTH_AT,
        vaginalBleeding: false,
        bloodLossMl: 50,
        perineumCondition: 'Jahitan utuh, tidak bengkak',
        perinealInfectionSigns: false,
        caesareanWoundInfectionSigns: false,
        breastCondition: 'NORMAL',
        uterineContraction: true,
        lochiaColour: 'SEROSA',
        lochiaOdour: false,
        breastMilkProduction: 'PRESENT',
        urination: true,
        defecation: true,
      },
    });

    expect(actualObservations).toHaveLength(SATUSEHAT_PNC_PROBE_FIXTURES.observations.length);
    for (const expected of SATUSEHAT_PNC_PROBE_FIXTURES.observations) {
      const actual = actualObservations.find(
        (observation) => observation.code.coding[0]?.code === expected.code.code,
      );
      expect(actual?.code.coding[0]).toEqual(expected.code);
      expect(actual).toMatchObject(expected.value);
      expect(actual?.encounter).toEqual({ reference: 'urn:uuid:encounter' });
      expect(actual?.performer).toEqual([{ reference: `Practitioner/${PRACTITIONER_IHS_NUMBER}` }]);
    }
  });

  it('leaves out a finding that was not examined', () => {
    const actualObservations = postnatalMapper.mapPostnatalObservations({
      patientIhsNumber: PATIENT_IHS_NUMBER,
      encounterReference: 'urn:uuid:encounter',
      recordedAt: RECORDED_AT,
      values: { deliveryDate: BIRTH_AT },
    });

    expect(actualObservations.map((observation) => observation.code.coding[0]?.code)).toEqual([
      '93857-1',
    ]);
  });

  describe('the Encounter', () => {
    const fhirMapper = new SatusehatFhirMapper(buildConfig());
    const baseInput = {
      encounterId: 'encounter-uuid',
      locationId: 'location-uuid',
      patientIhsNumber: PATIENT_IHS_NUMBER,
      practitionerIhsNumber: PRACTITIONER_IHS_NUMBER,
      arrivedAt: RECORDED_AT,
      startedAt: RECORDED_AT,
      endedAt: RECORDED_AT,
    };

    it('carries the KF identifier beside its own and references the PNC episode', () => {
      const actualEncounter = fhirMapper.mapEncounter({
        ...baseInput,
        postnatalEpisode: {
          satusehatEpisodeOfCareId: 'pnc-episode-id',
          visitIdentifier: SATUSEHAT_PNC_PROBE_FIXTURES.kfIdentifier,
        },
      });

      expect(actualEncounter.identifier).toEqual([
        { ...SATUSEHAT_PNC_PROBE_FIXTURES.kfIdentifier, use: 'official' },
        {
          system: `http://sys-ids.kemkes.go.id/encounter/${ORGANIZATION_ID}`,
          use: 'official',
          value: 'encounter-uuid',
        },
      ]);
      expect(actualEncounter.episodeOfCare).toEqual([{ reference: 'EpisodeOfCare/pnc-episode-id' }]);
    });

    it('sends a KN visit with its identifier and no episode reference', () => {
      const actualEncounter = fhirMapper.mapEncounter({
        ...baseInput,
        postnatalEpisode: {
          satusehatEpisodeOfCareId: null,
          visitIdentifier: SATUSEHAT_PNC_PROBE_FIXTURES.knIdentifier,
        },
      });

      expect(actualEncounter.identifier[0]).toEqual({
        ...SATUSEHAT_PNC_PROBE_FIXTURES.knIdentifier,
        use: 'official',
      });
      expect(actualEncounter.episodeOfCare).toBeUndefined();
    });
  });
});
