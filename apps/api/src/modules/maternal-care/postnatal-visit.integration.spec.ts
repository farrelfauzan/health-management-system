import { randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';

import { NationalIdentifierCryptoService } from '../../common/crypto/national-identifier-crypto.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SatusehatEpisodeOfCareClient } from '../../common/satusehat/satusehat-episode-of-care.client';
import { SatusehatFhirMapper } from '../../common/satusehat/satusehat-fhir.mapper';
import { SatusehatPostnatalMapper } from '../../common/satusehat/satusehat-postnatal.mapper';
import { SatusehatPostnatalRepository } from '../satusehat/repository/satusehat-postnatal.repository';
import { SatusehatSubmissionRepository } from '../satusehat/repository/satusehat-submission.repository';
import { SatusehatPostnatalSubmissionService } from '../satusehat/service/satusehat-postnatal-submission.service';
import { PostnatalVisitRepository } from './repository/postnatal-visit.repository';
import { PostnatalEpisodeCloseService } from './service/postnatal-episode-close.service';
import { PostnatalEpisodeCloseWorker } from './service/postnatal-episode-close.worker';

/** 1 October 03:00 WIB — the ticket's acceptance birth. */
const BIRTH_AT = new Date('2026-10-01T03:00:00+07:00');
const PATIENT_IHS_NUMBER = 'P02478375538';

function buildConfigService(): ConfigService {
  const values: Record<string, string> = {
    SATUSEHAT_ORGANIZATION_ID: '10000004',
    SATUSEHAT_CLIENT_ID: 'client-id',
    SATUSEHAT_CLIENT_SECRET: 'client-secret',
    SATUSEHAT_LOCATION_ID: 'location-uuid',
    CLINIC_TIMEZONE: 'Asia/Jakarta',
  };
  return {
    get: jest.fn((key: string) => values[key] ?? process.env[key]),
  } as unknown as ConfigService;
}

/**
 * Nifas visits against Postgres (P25-T12). Two guarantees only the database
 * can give:
 *
 * - **The PNC episode id is stored on the pregnancy the moment it is known**,
 *   so the second nifas visit reads it back and neither searches nor creates.
 *   The platform refuses a second active PNC episode with no id in the
 *   refusal, which is what makes the stored id the thing that matters.
 * - **The day-42 sweep enqueues exactly one close**, even run again after that
 *   close was sent, and a racing sweep is stopped by the partial unique index.
 */
describe('Postnatal visits against Postgres', () => {
  let prisma: PrismaService;
  let postnatalVisitRepository: PostnatalVisitRepository;
  let submissionRepository: SatusehatSubmissionRepository;
  let postnatalSubmissionService: SatusehatPostnatalSubmissionService;
  const episodeOfCareClientMock = {
    findEpisodeIdByIdentifier: jest.fn(),
    findActiveEpisodeIdByPatient: jest.fn(),
    createEpisodeOfCare: jest.fn(),
    patchEpisodeOfCare: jest.fn(),
  };

  let userId: string;
  let specialtyId: string;
  let doctorId: string;
  let motherId: string;
  let pregnancyEpisodeId: string;
  const createdEncounterIds: string[] = [];
  const createdRegistrationIds: string[] = [];

  async function createFinishedEncounter(startedAt: Date): Promise<string> {
    const registration = await prisma.registration.create({
      data: { patientId: motherId, status: 'COMPLETED', checkedInAt: startedAt },
    });
    createdRegistrationIds.push(registration.id);
    const encounter = await prisma.encounter.create({
      data: {
        registrationId: registration.id,
        patientId: motherId,
        doctorId,
        status: 'FINISHED',
        startedAt,
        endedAt: new Date(startedAt.getTime() + 30 * 60_000),
      },
    });
    createdEncounterIds.push(encounter.id);
    return encounter.id;
  }

  beforeAll(async () => {
    const configService = buildConfigService();
    prisma = new PrismaService(new ConfigService());
    await prisma.$connect();
    const cryptoService = new NationalIdentifierCryptoService(new ConfigService());
    postnatalVisitRepository = new PostnatalVisitRepository(prisma);
    submissionRepository = new SatusehatSubmissionRepository(prisma, cryptoService);
    postnatalSubmissionService = new SatusehatPostnatalSubmissionService(
      configService,
      episodeOfCareClientMock as unknown as SatusehatEpisodeOfCareClient,
      new SatusehatPostnatalMapper(configService),
      new SatusehatFhirMapper(configService),
      new SatusehatPostnatalRepository(prisma, cryptoService),
    );
    const user = await prisma.user.create({
      data: { email: `postnatal-${randomUUID()}@example.test`, passwordHash: 'not-a-real-hash' },
    });
    userId = user.id;
    const specialty = await prisma.specialty.create({
      data: { name: `Postnatal Spec ${randomUUID()}` },
    });
    specialtyId = specialty.id;
    const doctor = await prisma.doctorProfile.create({
      data: {
        fullName: 'Bidan Nifas Spec',
        profession: 'MIDWIFE',
        licenseNumber: `PNC-${randomUUID().slice(0, 12)}`,
        specialtyId,
      },
    });
    doctorId = doctor.id;
    const mother = await prisma.patientProfile.create({
      data: {
        sex: 'FEMALE',
        mrn: `PNC-${randomUUID().slice(0, 18)}`,
        fullName: 'Ibu Nifas',
        dateOfBirth: new Date('1995-04-04'),
        phoneNumber: '081210000012',
        address: 'Jl. Nifas No. 12',
      },
    });
    motherId = mother.id;
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    const episode = await prisma.pregnancyEpisode.create({
      data: {
        patientId: motherId,
        status: 'DELIVERED',
        endReason: 'DELIVERY',
        endedAt: BIRTH_AT,
        lastMenstrualPeriodDate: new Date('2025-12-25T00:00:00.000Z'),
        estimatedDeliveryDate: new Date('2026-10-01T00:00:00.000Z'),
        eddSource: 'LMP',
        gravida: 1,
        para: 0,
        abortus: 0,
        satusehatEpisodeOfCareId: 'anc-episode-id',
        createdById: userId,
      },
    });
    pregnancyEpisodeId = episode.id;
    await prisma.deliveryRecord.create({
      data: {
        pregnancyEpisodeId,
        attendantDoctorId: doctorId,
        birthAt: BIRTH_AT,
        mode: 'SPONTANEOUS_VAGINAL',
        recordedById: userId,
      },
    });
  });

  afterEach(async () => {
    await prisma.satusehatSubmission.deleteMany({ where: { pregnancyEpisodeId } });
    await prisma.postnatalVisit.deleteMany({ where: { pregnancyEpisodeId } });
    await prisma.deliveryRecord.deleteMany({ where: { pregnancyEpisodeId } });
    await prisma.pregnancyEpisode.deleteMany({ where: { id: pregnancyEpisodeId } });
  });

  afterAll(async () => {
    await prisma.encounter.deleteMany({ where: { id: { in: createdEncounterIds } } });
    await prisma.registration.deleteMany({ where: { id: { in: createdRegistrationIds } } });
    await prisma.patientProfile.deleteMany({ where: { id: motherId } });
    await prisma.doctorProfile.deleteMany({ where: { id: doctorId } });
    await prisma.specialty.deleteMany({ where: { id: specialtyId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.$disconnect();
  });

  async function linkMotherVisit(startedAt: Date, visitCode: 'KF2' | 'KF3'): Promise<string> {
    const encounterId = await createFinishedEncounter(startedAt);
    await postnatalVisitRepository.createVisit({
      encounterId,
      subject: 'MOTHER',
      pregnancyEpisodeId,
      newbornCareRecordId: null,
      visitCode,
    });
    return encounterId;
  }

  it('creates the PNC episode at the first nifas visit and reuses it at the second', async () => {
    episodeOfCareClientMock.findEpisodeIdByIdentifier.mockResolvedValue(null);
    episodeOfCareClientMock.findActiveEpisodeIdByPatient.mockResolvedValue(null);
    episodeOfCareClientMock.createEpisodeOfCare.mockResolvedValue('pnc-episode-id');
    const firstEncounterId = await linkMotherVisit(new Date('2026-10-05T09:00:00+07:00'), 'KF2');
    const secondEncounterId = await linkMotherVisit(new Date('2026-10-15T09:00:00+07:00'), 'KF3');

    const firstBundle = await submissionRepository.findBundleData(firstEncounterId);
    const firstVisit = await postnatalSubmissionService.ensurePostnatalEpisode({
      postnatalVisit: firstBundle?.postnatalVisit ?? null,
      patientIhsNumber: PATIENT_IHS_NUMBER,
    });
    const secondBundle = await submissionRepository.findBundleData(secondEncounterId);
    const secondVisit = await postnatalSubmissionService.ensurePostnatalEpisode({
      postnatalVisit: secondBundle?.postnatalVisit ?? null,
      patientIhsNumber: PATIENT_IHS_NUMBER,
    });

    expect(episodeOfCareClientMock.createEpisodeOfCare).toHaveBeenCalledTimes(1);
    expect(firstVisit?.satusehatPostnatalEpisodeOfCareId).toBe('pnc-episode-id');
    // The second visit read the id back from the pregnancy row.
    expect(secondBundle?.postnatalVisit?.satusehatPostnatalEpisodeOfCareId).toBe('pnc-episode-id');
    expect(secondVisit?.satusehatPostnatalEpisodeOfCareId).toBe('pnc-episode-id');
    // The ANC episode of the same pregnancy is a different id, untouched.
    await expect(
      prisma.pregnancyEpisode.findUnique({
        where: { id: pregnancyEpisodeId },
        select: { satusehatEpisodeOfCareId: true, satusehatPostnatalEpisodeOfCareId: true },
      }),
    ).resolves.toEqual({
      satusehatEpisodeOfCareId: 'anc-episode-id',
      satusehatPostnatalEpisodeOfCareId: 'pnc-episode-id',
    });
    expect(
      postnatalSubmissionService.buildEncounterPostnatalInput(firstVisit).postnatalEpisode,
    ).toEqual({
      satusehatEpisodeOfCareId: 'pnc-episode-id',
      visitIdentifier: {
        system: 'http://terminology.kemkes.go.id/CodeSystem/episodeofcare/puerperium',
        value: 'KF2',
      },
    });
  });

  it('adopts the PNC episode another clinic opened instead of creating one', async () => {
    episodeOfCareClientMock.findEpisodeIdByIdentifier.mockResolvedValue(null);
    episodeOfCareClientMock.findActiveEpisodeIdByPatient.mockResolvedValue('their-pnc-id');
    const encounterId = await linkMotherVisit(new Date('2026-10-05T09:00:00+07:00'), 'KF2');

    const bundle = await submissionRepository.findBundleData(encounterId);
    await postnatalSubmissionService.ensurePostnatalEpisode({
      postnatalVisit: bundle?.postnatalVisit ?? null,
      patientIhsNumber: PATIENT_IHS_NUMBER,
    });

    expect(episodeOfCareClientMock.createEpisodeOfCare).not.toHaveBeenCalled();
    await expect(
      prisma.pregnancyEpisode.findUnique({
        where: { id: pregnancyEpisodeId },
        select: { satusehatPostnatalEpisodeOfCareId: true },
      }),
    ).resolves.toEqual({ satusehatPostnatalEpisodeOfCareId: 'their-pnc-id' });
  });

  describe('the day-42 sweep', () => {
    function buildWorker(): PostnatalEpisodeCloseWorker {
      const configService = buildConfigService();
      return new PostnatalEpisodeCloseWorker(
        new PostnatalEpisodeCloseService(postnatalVisitRepository, configService),
        configService,
      );
    }

    async function countCloses(): Promise<number> {
      return prisma.satusehatSubmission.count({
        where: { pregnancyEpisodeId, kind: 'POSTNATAL_EPISODE_FINISH' },
      });
    }

    beforeEach(async () => {
      await prisma.pregnancyEpisode.update({
        where: { id: pregnancyEpisodeId },
        data: { satusehatPostnatalEpisodeOfCareId: 'pnc-episode-id' },
      });
    });

    it('enqueues nothing while KF4 is still open on 12 November', async () => {
      await buildWorker().sweepOnce(new Date('2026-11-12T23:00:00+07:00'));

      await expect(countCloses()).resolves.toBe(0);
    });

    it('enqueues one close once 12 November has passed, and never a second', async () => {
      const worker = buildWorker();

      await worker.sweepOnce(new Date('2026-11-13T00:30:00+07:00'));
      await worker.sweepOnce(new Date('2026-11-13T01:30:00+07:00'));
      await expect(countCloses()).resolves.toBe(1);
      // Sent: the next sweep must not enqueue a second PATCH.
      await prisma.satusehatSubmission.updateMany({
        where: { pregnancyEpisodeId, kind: 'POSTNATAL_EPISODE_FINISH' },
        data: { status: 'SUBMITTED' },
      });
      await worker.sweepOnce(new Date('2026-11-14T00:30:00+07:00'));

      await expect(countCloses()).resolves.toBe(1);
      const [close] = await prisma.satusehatSubmission.findMany({
        where: { pregnancyEpisodeId, kind: 'POSTNATAL_EPISODE_FINISH' },
      });
      expect(close).toMatchObject({ encounterId: null, labOrderId: null });
    });

    it('lets the partial unique index refuse a second open close', async () => {
      await expect(postnatalVisitRepository.enqueueEpisodeClose(pregnancyEpisodeId)).resolves.toBe(
        true,
      );
      await expect(postnatalVisitRepository.enqueueEpisodeClose(pregnancyEpisodeId)).resolves.toBe(
        false,
      );
    });

    it('enqueues nothing for a birth whose PNC episode never reached the platform', async () => {
      await prisma.pregnancyEpisode.update({
        where: { id: pregnancyEpisodeId },
        data: { satusehatPostnatalEpisodeOfCareId: null },
      });

      await buildWorker().sweepOnce(new Date('2026-11-20T00:00:00+07:00'));

      await expect(countCloses()).resolves.toBe(0);
    });
  });

  it('refuses a KN code on a mother’s visit', async () => {
    const encounterId = await createFinishedEncounter(new Date('2026-10-02T09:00:00+07:00'));

    await expect(
      prisma.postnatalVisit.create({
        data: { encounterId, subject: 'MOTHER', pregnancyEpisodeId, visitCode: 'KN1' },
      }),
    ).rejects.toThrow();
  });
});
