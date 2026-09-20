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
