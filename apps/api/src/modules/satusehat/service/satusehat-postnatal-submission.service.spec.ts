import { SatusehatPostnatalVisit } from '@hms/shared-types';
import { ConfigService } from '@nestjs/config';

import { SatusehatEpisodeOfCareClient } from '../../../common/satusehat/satusehat-episode-of-care.client';
import { SatusehatFhirMapper } from '../../../common/satusehat/satusehat-fhir.mapper';
import { SatusehatPostnatalMapper } from '../../../common/satusehat/satusehat-postnatal.mapper';
import { SatusehatPostnatalRepository } from '../repository/satusehat-postnatal.repository';
import { SatusehatPostnatalSubmissionService } from './satusehat-postnatal-submission.service';

const ORGANIZATION_ID = '10000004';
const PATIENT_IHS_NUMBER = 'P02478375538';
const PREGNANCY_EPISODE_ID = 'pregnancy-1';
const BIRTH_AT = new Date('2026-09-30T20:00:00.000Z');

function buildVisit(overrides: Partial<SatusehatPostnatalVisit> = {}): SatusehatPostnatalVisit {
  return {
    subject: 'MOTHER',
    visitCode: 'KF2',
    pregnancyEpisodeId: PREGNANCY_EPISODE_ID,
    satusehatPostnatalEpisodeOfCareId: null,
    birthAt: BIRTH_AT,
    examination: null,
    ...overrides,
  };
}

describe('SatusehatPostnatalSubmissionService', () => {
  const configService = {
    get: jest.fn((key: string) =>
      ({
        SATUSEHAT_ORGANIZATION_ID: ORGANIZATION_ID,
        SATUSEHAT_CLIENT_ID: 'client-id',
        SATUSEHAT_CLIENT_SECRET: 'client-secret',
        SATUSEHAT_LOCATION_ID: 'location-uuid',
      })[key],
    ),
  } as unknown as ConfigService;
  const clientMock = {
    findEpisodeIdByIdentifier: jest.fn(),
    findActiveEpisodeIdByPatient: jest.fn(),
    createEpisodeOfCare: jest.fn(),
    patchEpisodeOfCare: jest.fn(),
  };
  const repositoryMock = { savePostnatalEpisodeOfCareId: jest.fn() };
  const service = new SatusehatPostnatalSubmissionService(
    configService,
    clientMock as unknown as SatusehatEpisodeOfCareClient,
    new SatusehatPostnatalMapper(configService),
    new SatusehatFhirMapper(configService),
    repositoryMock as unknown as SatusehatPostnatalRepository,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates the PNC episode at the first nifas visit and stores its id', async () => {
    clientMock.findEpisodeIdByIdentifier.mockResolvedValue(null);
    clientMock.findActiveEpisodeIdByPatient.mockResolvedValue(null);
    clientMock.createEpisodeOfCare.mockResolvedValue('pnc-episode-id');

    const actualVisit = await service.ensurePostnatalEpisode({
      postnatalVisit: buildVisit(),
      patientIhsNumber: PATIENT_IHS_NUMBER,
    });

    // The identifier search is narrowed to PNC: the ANC episode of the same
    // pregnancy carries the same identifier.
    expect(clientMock.findEpisodeIdByIdentifier).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      PREGNANCY_EPISODE_ID,
      'PNC',
    );
    expect(clientMock.createEpisodeOfCare).toHaveBeenCalledWith(
      expect.objectContaining({ period: { start: BIRTH_AT.toISOString() } }),
    );
    expect(repositoryMock.savePostnatalEpisodeOfCareId).toHaveBeenCalledWith({
      pregnancyEpisodeId: PREGNANCY_EPISODE_ID,
      satusehatEpisodeOfCareId: 'pnc-episode-id',
    });
    expect(actualVisit?.satusehatPostnatalEpisodeOfCareId).toBe('pnc-episode-id');
  });

  it("adopts another clinic's open PNC episode rather than posting a refused duplicate", async () => {
    clientMock.findEpisodeIdByIdentifier.mockResolvedValue(null);
    clientMock.findActiveEpisodeIdByPatient.mockResolvedValue('their-episode-id');

    await service.ensurePostnatalEpisode({
      postnatalVisit: buildVisit(),
      patientIhsNumber: PATIENT_IHS_NUMBER,
    });

    expect(clientMock.findActiveEpisodeIdByPatient).toHaveBeenCalledWith(PATIENT_IHS_NUMBER, 'PNC');
    expect(clientMock.createEpisodeOfCare).not.toHaveBeenCalled();
  });

  it('touches no episode for a visit outside every window, or for a baby', async () => {
    await service.ensurePostnatalEpisode({
      postnatalVisit: buildVisit({ visitCode: null }),
      patientIhsNumber: PATIENT_IHS_NUMBER,
    });
    await service.ensurePostnatalEpisode({
      postnatalVisit: buildVisit({ subject: 'NEWBORN', visitCode: 'KN1' }),
      patientIhsNumber: PATIENT_IHS_NUMBER,
    });

    expect(clientMock.findEpisodeIdByIdentifier).not.toHaveBeenCalled();
    expect(clientMock.createEpisodeOfCare).not.toHaveBeenCalled();
  });

  it('puts KF under puerperium with the episode, and KN under neonate without one', () => {
    expect(
      service.buildEncounterPostnatalInput(buildVisit({ satusehatPostnatalEpisodeOfCareId: 'pnc' })),
    ).toEqual({
      postnatalEpisode: {
        satusehatEpisodeOfCareId: 'pnc',
        visitIdentifier: {
          system: 'http://terminology.kemkes.go.id/CodeSystem/episodeofcare/puerperium',
          value: 'KF2',
        },
      },
    });
    expect(
      service.buildEncounterPostnatalInput(buildVisit({ subject: 'NEWBORN', visitCode: 'KN1' })),
    ).toEqual({
      postnatalEpisode: {
        satusehatEpisodeOfCareId: null,
        visitIdentifier: {
          system: 'http://terminology.kemkes.go.id/CodeSystem/episodeofcare/neonate',
          value: 'KN1',
        },
      },
    });
  });

  it('closes the episode at the delivery plus 42 days, with the patient in the patch', async () => {
    await service.finishPostnatalEpisode({
      finishData: {
        pregnancyEpisodeId: PREGNANCY_EPISODE_ID,
        patientId: 'mother-1',
        patientIhsNumber: PATIENT_IHS_NUMBER,
        satusehatPostnatalEpisodeOfCareId: 'pnc-episode-id',
        birthAt: BIRTH_AT,
      },
      patientIhsNumber: PATIENT_IHS_NUMBER,
    });

    const [episodeId, operations] = clientMock.patchEpisodeOfCare.mock.calls[0] as [
      string,
      Array<{ op: string; path: string; value: unknown }>,
    ];
    expect(episodeId).toBe('pnc-episode-id');
    expect(operations).toEqual(
      expect.arrayContaining([
        { op: 'replace', path: '/patient', value: { reference: `Patient/${PATIENT_IHS_NUMBER}` } },
        { op: 'replace', path: '/status', value: 'finished' },
        { op: 'add', path: '/period/end', value: '2026-11-11T20:00:00.000Z' },
      ]),
    );
  });
});
