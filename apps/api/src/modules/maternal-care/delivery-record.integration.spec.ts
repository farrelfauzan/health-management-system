import { randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../common/prisma/prisma.service';
import { DeliveryRecordRepository } from './repository/delivery-record.repository';

/**
 * What recording a birth is worth only the database can say (P25-T09).
 *
 * Three guarantees live in DDL and in one transaction, and a mocked repository
 * would agree with whatever this spec asserted:
 *
 * - **The birth and the end of the pregnancy are one write.** A birth that
 *   saved while the episode stayed ACTIVE would let a second pregnancy be
 *   opened for a woman who has just given birth.
 * - **The stages are ordered by a CHECK**, so a record that gets past the
 *   schema still cannot claim a placenta delivered before the baby.
 * - **A baby's position is unique per birth**, in whichever column holds it.
 */
describe('Delivery records against Postgres', () => {
  let prisma: PrismaService;
  let repository: DeliveryRecordRepository;

  const createdEpisodeIds: string[] = [];
  const createdPatientIds: string[] = [];
  let patientId: string;
  let createdById: string;
  let attendantDoctorId: string;

  async function createEpisode(): Promise<string> {
    const episode = await prisma.pregnancyEpisode.create({
      data: {
        patientId,
        lastMenstrualPeriodDate: new Date('2026-02-02T00:00:00.000Z'),
        estimatedDeliveryDate: new Date('2026-11-09T00:00:00.000Z'),
        eddSource: 'LMP',
        gravida: 2,
        para: 1,
        abortus: 0,
        createdById,
      },
      select: { id: true },
    });
    createdEpisodeIds.push(episode.id);
    return episode.id;
  }

  function buildPayload(pregnancyEpisodeId: string, overrides: Record<string, unknown> = {}) {
    return {
      pregnancyEpisodeId,
      attendantDoctorId,
      admissionId: null,
      labourOnsetAt: new Date('2026-11-08T18:40:00.000Z'),
      fullDilatationAt: new Date('2026-11-08T19:50:00.000Z'),
      birthAt: new Date('2026-11-08T20:10:00.000Z'),
      placentaDeliveredAt: new Date('2026-11-08T20:22:00.000Z'),
      postpartumMonitoringEndedAt: new Date('2026-11-08T22:25:00.000Z'),
      mode: 'SPONTANEOUS_VAGINAL' as const,
      episiotomy: false,
      perinealTearGrade: 'NONE' as const,
      uterotonicMedicationId: null,
      uterotonicGivenAt: null,
      bloodLossMl: 250,
      placentaComplete: true,
      referredOut: false,
      referralReason: null,
      notes: null,
      recordedById: createdById,
      ...overrides,
    };
  }

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService());
    await prisma.$connect();
    repository = new DeliveryRecordRepository(prisma);
    const user = await prisma.user.create({
      data: { email: `delivery-${randomUUID()}@example.test`, passwordHash: 'not-a-real-hash' },
    });
    createdById = user.id;
    const patient = await prisma.patientProfile.create({
      data: {
        sex: 'FEMALE',
        mrn: `DEL-${randomUUID().slice(0, 18)}`,
        fullName: 'Ibu Rina',
        dateOfBirth: new Date('1996-05-05'),
        phoneNumber: '081210000003',
        address: 'Jl. Kenanga No. 3',
      },
    });
    patientId = patient.id;
    createdPatientIds.push(patient.id);
    const specialty = await prisma.specialty.findFirst({
      where: { deletedAt: null },
      select: { id: true },
    });
    if (specialty === null) {
      throw new Error('The seeded specialty catalogue is empty; run pnpm db:seed');
    }
    const attendant = await prisma.doctorProfile.create({
      data: {
        fullName: 'Bidan Siti Rahma, S.Tr.Keb.',
        profession: 'MIDWIFE',
        licenseNumber: `DEL-${randomUUID().slice(0, 12)}`,
        specialtyId: specialty.id,
      },
      select: { id: true },
    });
    attendantDoctorId = attendant.id;
  });

  afterEach(async () => {
    await prisma.deliveryRecord.deleteMany({
      where: { pregnancyEpisodeId: { in: createdEpisodeIds } },
    });
    await prisma.satusehatSubmission.deleteMany({
      where: { pregnancyEpisodeId: { in: createdEpisodeIds } },
    });
    await prisma.pregnancyEpisode.deleteMany({ where: { id: { in: createdEpisodeIds } } });
    createdEpisodeIds.length = 0;
  });

  afterAll(async () => {
    await prisma.doctorProfile.deleteMany({ where: { id: attendantDoctorId } });
    await prisma.patientProfile.deleteMany({ where: { id: { in: createdPatientIds } } });
    await prisma.user.deleteMany({ where: { id: createdById } });
    await prisma.$disconnect();
  });

  it('ends the pregnancy as DELIVERED in the same write that records the birth', async () => {
    const episodeId = await createEpisode();

    await repository.createDelivery(buildPayload(episodeId));

    await expect(
      prisma.pregnancyEpisode.findUnique({
        where: { id: episodeId },
        select: { status: true, endReason: true, endedAt: true },
      }),
    ).resolves.toEqual({
      status: 'DELIVERED',
      endReason: 'DELIVERY',
      endedAt: new Date('2026-11-08T20:10:00.000Z'),
    });
  });

  it('leaves the pregnancy untouched when the birth cannot be written', async () => {
    const episodeId = await createEpisode();

    // A placenta delivered before the baby: refused by the CHECK, inside the
    // transaction that would otherwise have ended the pregnancy.
    await expect(
      repository.createDelivery(
        buildPayload(episodeId, {
          placentaDeliveredAt: new Date('2026-11-08T19:00:00.000Z'),
        }),
      ),
    ).rejects.toThrow();

    await expect(
      prisma.pregnancyEpisode.findUnique({
        where: { id: episodeId },
        select: { status: true, endedAt: true },
      }),
    ).resolves.toEqual({ status: 'ACTIVE', endedAt: null });
  });

  it('moves the end of the pregnancy when the birth time is corrected', async () => {
    const episodeId = await createEpisode();
    const delivery = await repository.createDelivery(buildPayload(episodeId));

    await repository.updateDelivery(delivery.id, { birthAt: '2026-11-08T20:05:00.000Z' });

    await expect(
      prisma.pregnancyEpisode.findUnique({
        where: { id: episodeId },
        select: { endedAt: true },
      }),
    ).resolves.toEqual({ endedAt: new Date('2026-11-08T20:05:00.000Z') });
  });

  it('refuses a correction that would put the birth after the placenta', async () => {
    const episodeId = await createEpisode();
    const delivery = await repository.createDelivery(buildPayload(episodeId));

    // The request schema sees only the field being changed and cannot judge
    // this; the CHECK sees the whole row. Moving the birth to 20:45 would put
    // it after the placenta delivered at 20:22.
    await expect(
      repository.updateDelivery(delivery.id, { birthAt: '2026-11-08T20:45:00.000Z' }),
    ).rejects.toThrow();

    await expect(
      prisma.pregnancyEpisode.findUnique({
        where: { id: episodeId },
        select: { endedAt: true },
      }),
    ).resolves.toEqual({ endedAt: new Date('2026-11-08T20:10:00.000Z') });
  });

  it('enqueues no SATUSEHAT close for a pregnancy that never reached the platform', async () => {
    const episodeId = await createEpisode();

    await repository.createDelivery(buildPayload(episodeId));

    await expect(
      prisma.satusehatSubmission.count({ where: { pregnancyEpisodeId: episodeId } }),
    ).resolves.toBe(0);
  });

  it('enqueues exactly one close for a pregnancy the platform holds', async () => {
    const episodeId = await createEpisode();
    await prisma.pregnancyEpisode.update({
      where: { id: episodeId },
      data: { satusehatEpisodeOfCareId: 'episode-on-the-platform' },
    });

    await repository.createDelivery(buildPayload(episodeId));

    const enqueued = await prisma.satusehatSubmission.findMany({
      where: { pregnancyEpisodeId: episodeId },
      select: { kind: true, status: true },
    });
    expect(enqueued).toEqual([{ kind: 'EPISODE_OF_CARE_FINISH', status: 'PENDING' }]);
  });

  it('refuses a second birth for one pregnancy', async () => {
    const episodeId = await createEpisode();
    await repository.createDelivery(buildPayload(episodeId));

    await expect(repository.createDelivery(buildPayload(episodeId))).rejects.toThrow();
  });

  describe('a baby carries one position per birth', () => {
    it('refuses two stillbirths at the same position', async () => {
      const episodeId = await createEpisode();
      const delivery = await repository.createDelivery(buildPayload(episodeId));
      await repository.createNewborn(delivery.id, {
        outcome: 'STILLBIRTH',
        stillbirthOrder: 1,
        sex: 'MALE',
      });

      await expect(
        repository.createNewborn(delivery.id, {
          outcome: 'STILLBIRTH',
          stillbirthOrder: 1,
          sex: 'FEMALE',
        }),
      ).rejects.toThrow();
    });

    it('refuses a live baby carrying a stillbirth order, at the database too', async () => {
      const episodeId = await createEpisode();
      const delivery = await repository.createDelivery(buildPayload(episodeId));

      await expect(
        repository.createNewborn(delivery.id, {
          outcome: 'LIVE_BIRTH',
          stillbirthOrder: 1,
          sex: 'FEMALE',
        }),
      ).rejects.toThrow();
    });

    it('reads the taken positions from both columns at once', async () => {
      const episodeId = await createEpisode();
      const delivery = await repository.createDelivery(buildPayload(episodeId));
      await repository.createNewborn(delivery.id, {
        outcome: 'STILLBIRTH',
        stillbirthOrder: 2,
        sex: 'MALE',
      });

      await expect(repository.listTakenBirthOrders(delivery.id)).resolves.toEqual([2]);
    });
  });
});
