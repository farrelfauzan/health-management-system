import { randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../common/prisma/prisma.service';
import { MaternalCareRepository } from './repository/maternal-care.repository';
import { PregnancyEpisodeConflictError } from './repository/pregnancy-episode-conflict.error';

/**
 * What the pregnancy episode is worth only the database can say (P25-T06).
 *
 * Two guarantees live in DDL rather than in application code, and a mocked
 * repository would agree with whatever this spec asserted:
 *
 * - **One ACTIVE episode per patient**, held by a partial unique index. Two
 *   tabs can open two episodes in the same millisecond, and the second one
 *   would otherwise be recorded and quietly start renumbering the first one's
 *   visits.
 * - **GPA adds up**, held by a CHECK. This pregnancy is counted in `gravida`,
 *   so the ones that already ended can be at most one fewer.
 *
 * The partial half matters as much as the unique half: a woman who has been
 * pregnant before must be able to be pregnant again.
 */
describe('Pregnancy episode against Postgres', () => {
  let prisma: PrismaService;
  let repository: MaternalCareRepository;

  const createdPatientIds: string[] = [];
  let patientId: string;
  let createdById: string;

  async function createEpisode(overrides: Record<string, unknown> = {}) {
    return repository.createEpisode({
      patientId,
      lastMenstrualPeriodDate: new Date('2026-02-02T00:00:00.000Z'),
      estimatedDeliveryDate: new Date('2026-11-09T00:00:00.000Z'),
      eddSource: 'LMP',
      gravida: 2,
      para: 1,
      abortus: 0,
      prePregnancyWeightKg: 54.5,
      bloodType: 'O',
      rhesus: '+',
      riskNotes: null,
      createdById,
      ...overrides,
    });
  }

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService());
    await prisma.$connect();
    repository = new MaternalCareRepository(prisma);
    const user = await prisma.user.create({
      data: {
        email: `anc-${randomUUID()}@example.test`,
        passwordHash: 'not-a-real-hash',
      },
    });
    createdById = user.id;
    const patient = await prisma.patientProfile.create({
      data: {
        sex: 'FEMALE',
        mrn: `ANC-${randomUUID().slice(0, 18)}`,
        fullName: 'Ibu Rina',
        dateOfBirth: new Date('1996-05-05'),
        phoneNumber: '081210000002',
        address: 'Jl. Kenanga No. 3',
      },
    });
    patientId = patient.id;
    createdPatientIds.push(patient.id);
  });

  afterAll(async () => {
    await prisma.pregnancyEpisode.deleteMany({ where: { patientId: { in: createdPatientIds } } });
    await prisma.patientProfile.deleteMany({ where: { id: { in: createdPatientIds } } });
    await prisma.user.deleteMany({ where: { id: createdById } });
    await prisma.$disconnect();
  });

  afterEach(async () => {
    await prisma.pregnancyEpisode.deleteMany({ where: { patientId } });
  });

  it('opens an episode and reads it back as the active one', async () => {
    const created = await createEpisode();

    const active = await repository.findActiveEpisodeByPatientId(patientId);
    expect(active?.id).toBe(created.id);
    expect(active).toMatchObject({ status: 'ACTIVE', gravida: 2, para: 1, abortus: 0 });
    // Decimal comes back as a Prisma Decimal; the repository is what turns it
    // into a number the contract can carry.
    expect(active?.prePregnancyWeightKg).toBe(54.5);
  });

  it('refuses a second active episode for the same patient', async () => {
    await createEpisode();

    await expect(createEpisode()).rejects.toBeInstanceOf(PregnancyEpisodeConflictError);
  });

  it('allows a new pregnancy once the previous episode has ended', async () => {
    const first = await createEpisode();
    await repository.endEpisode({
      id: first.id,
      reason: 'MISCARRIAGE',
      endedAt: new Date('2026-04-01T00:00:00.000Z'),
    });

    const second = await createEpisode({ gravida: 3, para: 1, abortus: 1 });

    expect(second.id).not.toBe(first.id);
    const history = await repository.listEpisodesByPatientId(patientId);
    expect(history).toHaveLength(2);
  });

  describe('closing the SATUSEHAT episode (P25-T08)', () => {
    afterEach(async () => {
      await prisma.satusehatSubmission.deleteMany({
        where: { pregnancyEpisode: { patientId } },
      });
    });

    it('enqueues one close, in the transaction that ends the pregnancy', async () => {
      const episode = await createEpisode();
      await prisma.pregnancyEpisode.update({
        where: { id: episode.id },
        data: { satusehatEpisodeOfCareId: 'episode-on-the-platform' },
      });

      await repository.endEpisode({
        id: episode.id,
        reason: 'DELIVERY',
        endedAt: new Date('2026-11-09T03:10:00.000Z'),
      });

      const enqueued = await prisma.satusehatSubmission.findMany({
        where: { pregnancyEpisodeId: episode.id },
      });
      expect(enqueued).toHaveLength(1);
      expect(enqueued[0]).toMatchObject({
        kind: 'EPISODE_OF_CARE_FINISH',
        status: 'PENDING',
        encounterId: null,
        labOrderId: null,
      });
    });

    it('enqueues nothing for a pregnancy that never reached the platform', async () => {
      const episode = await createEpisode();

      await repository.endEpisode({
        id: episode.id,
        reason: 'MISCARRIAGE',
        endedAt: new Date('2026-04-01T00:00:00.000Z'),
      });

      // No episode id means nothing on the platform to close, and a row for it
      // would fail on every attempt for ever.
      await expect(
        prisma.satusehatSubmission.count({ where: { pregnancyEpisodeId: episode.id } }),
      ).resolves.toBe(0);
    });

    it('does not enqueue a second close beside one still waiting', async () => {
      const episode = await createEpisode();
      await prisma.pregnancyEpisode.update({
        where: { id: episode.id },
        data: { satusehatEpisodeOfCareId: 'episode-on-the-platform' },
      });
      await repository.endEpisode({
        id: episode.id,
        reason: 'DELIVERY',
        endedAt: new Date('2026-11-09T03:10:00.000Z'),
      });

      // The end date corrected before the worker ran. The pending row re-reads
      // the pregnancy when it is picked up, so it sends the corrected date —
      // and the partial unique index would refuse a second open row anyway.
      await repository.endEpisode({
        id: episode.id,
        reason: 'DELIVERY',
        endedAt: new Date('2026-11-09T04:25:00.000Z'),
      });

      await expect(
        prisma.satusehatSubmission.count({ where: { pregnancyEpisodeId: episode.id } }),
      ).resolves.toBe(1);
    });
  });

  it('refuses GPA that does not add up', async () => {
    // G1 P1 A0 says one pregnancy, one of which already ended in a birth —
    // while this one is still running.
    await expect(createEpisode({ gravida: 1, para: 1, abortus: 0 })).rejects.toThrow();
  });

  it('accepts a first pregnancy as G1 P0 A0', async () => {
    const created = await createEpisode({ gravida: 1, para: 0, abortus: 0 });

    expect(created).toMatchObject({ gravida: 1, para: 0, abortus: 0 });
  });

  it('keeps the HPHT as the calendar date it was entered as', async () => {
    const created = await createEpisode();

    expect(created.lastMenstrualPeriodDate?.toISOString().slice(0, 10)).toBe('2026-02-02');
  });
});
