import { randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';

import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EncounterAccessService } from '../emr/service/encounter-access.service';
import { NotificationRepository } from '../notification/repository/notification.repository';
import { NotificationHrefService } from '../notification/service/notification-href.service';
import { NotificationService } from '../notification/service/notification.service';
import { DeliveryRecordRepository } from './repository/delivery-record.repository';
import { ShkScreeningRepository } from './repository/shk-screening.repository';
import { ShkRecallNotificationService } from './service/shk-recall-notification.service';
import { ShkScreeningService } from './service/shk-screening.service';

/**
 * SHK screening against Postgres (P25-T10).
 *
 * What only the database can say: that a live baby's first sample is written
 * in the transaction that records her, that a stillborn baby gets none, that a
 * corrected birth time moves the windows nobody has sampled against yet, and
 * that a recall reaches each clinician exactly once — the attendant is also a
 * clinician, and a mocked notification repository would happily count her
 * twice without anyone noticing.
 *
 * CI never seeds, so the clinician grant is built here from its permission
 * key rather than read from the seeded DOCTOR role.
 */
describe('SHK screening against Postgres', () => {
  let prisma: PrismaService;
  let deliveryRepository: DeliveryRecordRepository;
  let service: ShkScreeningService;

  const createdEpisodeIds: string[] = [];
  const createdUserIds: string[] = [];
  let patientId: string;
  let recorderId: string;
  let attendantDoctorId: string;
  let attendantUserId: string;
  let otherClinicianUserId: string;
  let bystanderUserId: string;
  let roleId: string;

  const BIRTH_AT = new Date('2026-09-30T20:00:00.000Z');

  async function createUser(label: string): Promise<string> {
    const user = await prisma.user.create({
      data: { email: `shk-${label}-${randomUUID()}@example.test`, passwordHash: 'not-a-real-hash' },
      select: { id: true },
    });
    createdUserIds.push(user.id);
    return user.id;
  }

  async function upsertPermission(
    permissionKey: string,
    resource: string,
    action: string,
    scope: 'ANY' | 'OWN',
  ): Promise<string> {
    const permission = await prisma.permission.upsert({
      where: { permissionKey },
      update: {},
      create: { permissionKey, resource, action, scope },
      select: { id: true },
    });
    return permission.id;
  }

  async function createDeliveryWithBaby(outcome: 'LIVE_BIRTH' | 'STILLBIRTH') {
    const episode = await prisma.pregnancyEpisode.create({
      data: {
        patientId,
        lastMenstrualPeriodDate: new Date('2026-01-01T00:00:00.000Z'),
        estimatedDeliveryDate: new Date('2026-10-08T00:00:00.000Z'),
        eddSource: 'LMP',
        gravida: 1,
        para: 0,
        abortus: 0,
        createdById: recorderId,
      },
      select: { id: true },
    });
    createdEpisodeIds.push(episode.id);
    const delivery = await deliveryRepository.createDelivery({
      pregnancyEpisodeId: episode.id,
      attendantDoctorId,
      admissionId: null,
      labourOnsetAt: null,
      fullDilatationAt: null,
      birthAt: BIRTH_AT,
      placentaDeliveredAt: null,
      postpartumMonitoringEndedAt: null,
      mode: 'SPONTANEOUS_VAGINAL',
      episiotomy: false,
      perinealTearGrade: 'NONE',
      uterotonicMedicationId: null,
      uterotonicGivenAt: null,
      bloodLossMl: null,
      placentaComplete: null,
      referredOut: false,
      referralReason: null,
      notes: null,
      recordedById: recorderId,
    });
    const newborn = await deliveryRepository.createNewborn(delivery.id, {
      outcome,
      sex: 'FEMALE',
      stillbirthOrder: outcome === 'STILLBIRTH' ? 1 : null,
    });
    return { deliveryId: delivery.id, newbornId: newborn.id };
  }

  async function listScreenings(newbornCareRecordId: string) {
    return prisma.shkScreening.findMany({
      where: { newbornCareRecordId },
      orderBy: { sequence: 'asc' },
    });
  }

  async function readFirstScreening(newbornCareRecordId: string) {
    const [first] = await listScreenings(newbornCareRecordId);
    if (first === undefined) {
      throw new Error('Expected a first SHK sample');
    }
    return first;
  }

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService());
    await prisma.$connect();
    deliveryRepository = new DeliveryRecordRepository(prisma);
    const notificationRepository = new NotificationRepository(prisma);
    const encounterAccess = {
      resolveScopeOrThrow: async () => ({ hasAny: true, hasOwn: false }),
    } as unknown as EncounterAccessService;
    const audit = { record: async () => undefined } as unknown as AuditService;
    service = new ShkScreeningService(
      new ShkScreeningRepository(prisma),
      encounterAccess,
      new ShkRecallNotificationService(
        new NotificationService(notificationRepository),
        new NotificationHrefService(notificationRepository),
      ),
      audit,
    );
    recorderId = await createUser('recorder');
    attendantUserId = await createUser('attendant');
    otherClinicianUserId = await createUser('clinician');
    bystanderUserId = await createUser('bystander');
    const clinicianPermissionIds = [
      await upsertPermission('encounter.write:own', 'Encounter', 'write', 'OWN'),
      await upsertPermission('portal.doctor-access:any', 'Portal', 'doctor-access', 'ANY'),
    ];
    const role = await prisma.role.create({
      data: {
        code: `SHK_TEST_${randomUUID().slice(0, 8)}`,
        name: 'SHK test clinician',
        permissions: {
          create: clinicianPermissionIds.map((permissionId) => ({ permissionId })),
        },
      },
      select: { id: true },
    });
    roleId = role.id;
    await prisma.userRole.createMany({
      data: [attendantUserId, otherClinicianUserId].map((userId) => ({ userId, roleId })),
    });
    const patient = await prisma.patientProfile.create({
      data: {
        sex: 'FEMALE',
        mrn: `SHK-${randomUUID().slice(0, 18)}`,
        fullName: 'Ibu Wulan',
        dateOfBirth: new Date('1998-03-03'),
        phoneNumber: '081210000033',
        address: 'Jl. Melati No. 3',
      },
    });
    patientId = patient.id;
    const specialty = await prisma.specialty.findFirst({
      where: { deletedAt: null },
      select: { id: true },
    });
    if (specialty === null) {
      throw new Error('The seeded specialty catalogue is empty; run pnpm db:seed');
    }
    const attendant = await prisma.doctorProfile.create({
      data: {
        fullName: 'Bidan Ayu Lestari, S.Tr.Keb.',
        profession: 'MIDWIFE',
        licenseNumber: `SHK-${randomUUID().slice(0, 12)}`,
        specialtyId: specialty.id,
        ownerUserId: attendantUserId,
      },
      select: { id: true },
    });
    attendantDoctorId = attendant.id;
  });

  afterEach(async () => {
    await prisma.notification.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.shkScreening.deleteMany({
      where: { newbornCareRecord: { deliveryRecord: { pregnancyEpisodeId: { in: createdEpisodeIds } } } },
    });
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
    await prisma.patientProfile.deleteMany({ where: { id: patientId } });
    await prisma.userRole.deleteMany({ where: { roleId } });
    await prisma.role.deleteMany({ where: { id: roleId } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  it('writes sequence 1, due 48 to 72 hours after birth, with a live baby', async () => {
    // Given a baby born 1 Oct 03:00 WIB (30 Sep 20:00 UTC)
    const { newbornId } = await createDeliveryWithBaby('LIVE_BIRTH');

    // Then her first sample is due 3 Oct 03:00 until 4 Oct 03:00 WIB
    const screenings = await listScreenings(newbornId);
    expect(screenings).toHaveLength(1);
    expect(screenings[0]).toMatchObject({
      sequence: 1,
      dueFrom: new Date('2026-10-02T20:00:00.000Z'),
      dueUntil: new Date('2026-10-03T20:00:00.000Z'),
      sampleTakenAt: null,
      result: null,
    });
  });

  it('writes no sample for a stillborn baby', async () => {
    const { newbornId } = await createDeliveryWithBaby('STILLBIRTH');

    await expect(listScreenings(newbornId)).resolves.toHaveLength(0);
  });

  it('moves an untaken window when the birth time is corrected', async () => {
    const { deliveryId, newbornId } = await createDeliveryWithBaby('LIVE_BIRTH');

    await deliveryRepository.updateDelivery(deliveryId, { birthAt: '2026-09-30T22:30:00.000Z' });

    const screening = await readFirstScreening(newbornId);
    expect(screening.dueFrom).toEqual(new Date('2026-10-02T22:30:00.000Z'));
    expect(screening.dueUntil).toEqual(new Date('2026-10-03T22:30:00.000Z'));
  });

  it('keeps a taken sample on the window it was taken against', async () => {
    const { deliveryId, newbornId } = await createDeliveryWithBaby('LIVE_BIRTH');
    const first = await readFirstScreening(newbornId);
    await service.recordSample(
      first.id,
      { takenAt: '2026-10-03T01:00:00.000Z' },
      { sub: recorderId } as never,
    );

    await deliveryRepository.updateDelivery(deliveryId, { birthAt: '2026-09-30T22:30:00.000Z' });

    const screening = await readFirstScreening(newbornId);
    expect(screening.dueFrom).toEqual(new Date('2026-10-02T20:00:00.000Z'));
  });

  it('opens sequence 2 on RECALL and tells each clinician once', async () => {
    const { newbornId } = await createDeliveryWithBaby('LIVE_BIRTH');
    const first = await readFirstScreening(newbornId);
    const actor = { sub: recorderId } as never;
    await service.recordSample(first.id, { takenAt: '2026-10-03T01:00:00.000Z' }, actor);
    await service.recordSent(
      first.id,
      { sentAt: '2026-10-03T04:00:00.000Z', laboratoryName: 'Labkesda Provinsi' },
      actor,
    );

    await service.recordResult(
      first.id,
      { receivedAt: '2026-10-10T02:00:00.000Z', result: 'RECALL', notes: null },
      actor,
    );

    const screenings = await listScreenings(newbornId);
    expect(screenings.map((row) => row.sequence)).toEqual([1, 2]);
    expect(screenings[1]).toMatchObject({
      dueFrom: new Date('2026-10-10T02:00:00.000Z'),
      sampleTakenAt: null,
    });
    const notifications = await prisma.notification.findMany({
      where: { userId: { in: createdUserIds }, type: 'SHK_RECALL' },
      select: { userId: true, href: true, titleKey: true },
    });
    // The attendant is a clinician too: one row, not two. The recorder and
    // the bystander hold no clinician grant and are not told.
    expect(notifications.map((row) => row.userId).sort()).toEqual(
      [attendantUserId, otherClinicianUserId].sort(),
    );
    expect(notifications.every((row) => row.titleKey === 'shkRecall.title')).toBe(true);
    expect(notifications[0]?.href).toBe(`/doctor/patients/${patientId}?tab=pregnancy`);
    expect(createdUserIds).toContain(bystanderUserId);
  });

  it('closes the baby on NORMAL without a repeat or a notification', async () => {
    const { newbornId } = await createDeliveryWithBaby('LIVE_BIRTH');
    const first = await readFirstScreening(newbornId);
    const actor = { sub: recorderId } as never;
    await service.recordSample(first.id, { takenAt: '2026-10-03T01:00:00.000Z' }, actor);

    await service.recordResult(
      first.id,
      { receivedAt: '2026-10-10T02:00:00.000Z', result: 'NORMAL' },
      actor,
    );

    await expect(listScreenings(newbornId)).resolves.toHaveLength(1);
    await expect(
      prisma.notification.count({ where: { userId: { in: createdUserIds } } }),
    ).resolves.toBe(0);
  });
});
