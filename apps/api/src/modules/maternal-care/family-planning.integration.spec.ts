import { randomUUID } from 'node:crypto';

import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuditService } from '../../common/audit/audit.service';
import { CurrentUser } from '../../common/auth/current-user.type';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EncounterAccessService } from '../emr/service/encounter-access.service';
import { FamilyPlanningRepository } from './repository/family-planning.repository';
import { FamilyPlanningAuthorityService } from './service/family-planning-authority.service';
import { FamilyPlanningService } from './service/family-planning.service';

const ONE_DAY_IN_MILLISECONDS = 86_400_000;

/**
 * The family planning course against Postgres (P25-T14).
 *
 * What only the database can say: the partial unique index that keeps one
 * live course per patient, the service and the course's due date moving in
 * one transaction, and the due list's predicate — overdue in, discontinued
 * out. Access and the authority gate are faked; their rules have unit specs.
 */
describe('Family planning against Postgres (P25-T14)', () => {
  let prisma: PrismaService;
  let service: FamilyPlanningService;
  let patientId: string;
  let otherPatientId: string;
  let providerDoctorId: string;
  let createdById: string;
  const currentUser = { sub: 'user-fp' } as CurrentUser;

  function toDateOnly(value: Date): string {
    return value.toISOString().slice(0, 10);
  }

  function clinicTodayPlus(days: number): string {
    const today = new Date(
      `${new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date())}T00:00:00.000Z`,
    );
    return toDateOnly(new Date(today.getTime() + days * ONE_DAY_IN_MILLISECONDS));
  }

  async function createPatient(fullName: string): Promise<string> {
    const patient = await prisma.patientProfile.create({
      data: {
        sex: 'FEMALE',
        mrn: `KB-${randomUUID().slice(0, 18)}`,
        fullName,
        dateOfBirth: new Date('1995-03-03'),
        phoneNumber: '081210000014',
        address: 'Jl. Melati No. 14',
      },
      select: { id: true },
    });
    return patient.id;
  }

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService());
    await prisma.$connect();
    const encounterAccessFake = {
      resolveScopeOrThrow: jest.fn().mockResolvedValue({ hasAny: true, hasOwn: false }),
      findActiveAssignmentForCaller: jest.fn(),
    } as unknown as EncounterAccessService;
    const authorityFake = {
      resolveMethodMandate: jest.fn().mockResolvedValue(null),
    } as unknown as FamilyPlanningAuthorityService;
    service = new FamilyPlanningService(
      new FamilyPlanningRepository(prisma),
      authorityFake,
      encounterAccessFake,
      { record: jest.fn() } as unknown as AuditService,
      { get: () => 'Asia/Jakarta' } as unknown as ConfigService,
    );
    const user = await prisma.user.create({
      data: { email: `kb-${randomUUID()}@example.test`, passwordHash: 'not-a-real-hash' },
    });
    createdById = user.id;
    patientId = await createPatient('Ibu Dewi');
    otherPatientId = await createPatient('Ibu Rina');
    const specialty = await prisma.specialty.findFirst({
      where: { deletedAt: null },
      select: { id: true },
    });
    if (specialty === null) {
      throw new Error('The specialty catalogue is empty; its migration seeds it');
    }
    const provider = await prisma.doctorProfile.create({
      data: {
        fullName: 'Bidan Sari, S.Tr.Keb.',
        profession: 'MIDWIFE',
        licenseNumber: `KB-${randomUUID().slice(0, 12)}`,
        specialtyId: specialty.id,
      },
      select: { id: true },
    });
    providerDoctorId = provider.id;
  });

  afterEach(async () => {
    await prisma.familyPlanningRecord.deleteMany({
      where: { patientId: { in: [patientId, otherPatientId] } },
    });
  });

  afterAll(async () => {
    await prisma.deliveryRecord.deleteMany({ where: { attendantDoctorId: providerDoctorId } });
    await prisma.satusehatSubmission.deleteMany({
      where: { pregnancyEpisode: { patientId } },
    });
    await prisma.pregnancyEpisode.deleteMany({ where: { patientId } });
    await prisma.doctorProfile.deleteMany({ where: { id: providerDoctorId } });
    await prisma.patientProfile.deleteMany({ where: { id: { in: [patientId, otherPatientId] } } });
    await prisma.user.deleteMany({ where: { id: createdById } });
    await prisma.$disconnect();
  });

  it('runs a course from start through a service to discontinuation', async () => {
    const started = await service.startCourse(
      patientId,
      {
        method: 'INJECTABLE_3_MONTH',
        acceptorType: 'NEW',
        startedOn: '2026-10-01',
        providerDoctorId,
      },
      currentUser,
    );
    expect(started).toEqual(
      expect.objectContaining({ nextDueOn: '2026-12-24', isLive: true, providerName: 'Bidan Sari, S.Tr.Keb.' }),
    );

    const served = await service.recordService(
      started.id,
      { servedOn: '2026-12-23', action: 'Suntik DMPA ulang' },
      currentUser,
    );
    expect(served.nextDueOn).toBe('2027-03-17');
    expect(served.services).toEqual([
      expect.objectContaining({ servedOn: '2026-12-23', nextDueOn: '2027-03-17' }),
    ]);

    const discontinued = await service.discontinueCourse(
      started.id,
      { discontinuedOn: '2027-03-17', reason: 'WANTS_PREGNANCY' },
      currentUser,
    );
    expect(discontinued).toEqual(
      expect.objectContaining({ isLive: false, discontinuationReason: 'WANTS_PREGNANCY' }),
    );

    const record = await service.getPatientFamilyPlanning(patientId, currentUser);
    expect(record.liveCourse).toBeNull();
    expect(record.courses).toHaveLength(1);
  });

  it('refuses a second live course with 409, and allows one after discontinuation', async () => {
    const payload = {
      method: 'PILL' as const,
      acceptorType: 'CONTINUING' as const,
      startedOn: '2026-10-01',
      providerDoctorId,
    };
    const first = await service.startCourse(patientId, payload, currentUser);
    const actualError = await service.startCourse(patientId, payload, currentUser).catch((err) => err);
    expect(actualError).toBeInstanceOf(ConflictException);
    expect((actualError as ConflictException).getResponse()).toEqual(
      expect.objectContaining({ code: 'FAMILY_PLANNING_COURSE_ACTIVE' }),
    );

    await service.discontinueCourse(
      first.id,
      { discontinuedOn: '2026-11-01', reason: 'METHOD_CHANGE' },
      currentUser,
    );
    await expect(
      service.startCourse(patientId, { ...payload, startedOn: '2026-11-01' }, currentUser),
    ).resolves.toEqual(expect.objectContaining({ isLive: true }));
  });

  it('lists overdue and soon-due courses, and leaves discontinued ones out', async () => {
    const overdue = await service.startCourse(
      patientId,
      {
        method: 'INJECTABLE_1_MONTH',
        acceptorType: 'CONTINUING',
        startedOn: clinicTodayPlus(-40),
        providerDoctorId,
      },
      currentUser,
    );
    const discontinued = await service.startCourse(
      otherPatientId,
      {
        method: 'INJECTABLE_3_MONTH',
        acceptorType: 'NEW',
        startedOn: clinicTodayPlus(-80),
        providerDoctorId,
      },
      currentUser,
    );
    await service.discontinueCourse(
      discontinued.id,
      { discontinuedOn: clinicTodayPlus(-1), reason: 'SIDE_EFFECT' },
      currentUser,
    );

    const actual = await service.listDue({ withinDays: 7 }, currentUser);
    const actualIds = actual.map((item) => item.familyPlanningRecordId);

    expect(actualIds).toContain(overdue.id);
    expect(actualIds).not.toContain(discontinued.id);
    expect(actual.find((item) => item.familyPlanningRecordId === overdue.id)).toEqual(
      expect.objectContaining({ daysUntilDue: -12, patientName: 'Ibu Dewi' }),
    );
  });

  it('puts a course due the week after next outside a 7-day window, inside a 14-day one', async () => {
    const course = await service.startCourse(
      patientId,
      {
        method: 'IUD',
        acceptorType: 'NEW',
        startedOn: clinicTodayPlus(0),
        providerDoctorId,
        nextDueOn: clinicTodayPlus(10),
      },
      currentUser,
    );
    const withinWeek = await service.listDue({ withinDays: 7 }, currentUser);
    const withinFortnight = await service.listDue({ withinDays: 14 }, currentUser);
    expect(withinWeek.map((item) => item.familyPlanningRecordId)).not.toContain(course.id);
    expect(withinFortnight.map((item) => item.familyPlanningRecordId)).toContain(course.id);
  });

  it('links KB pasca salin to the delivery, and stops offering that delivery', async () => {
    const episode = await prisma.pregnancyEpisode.create({
      data: {
        patientId,
        status: 'DELIVERED',
        endReason: 'DELIVERY',
        lastMenstrualPeriodDate: new Date(`${clinicTodayPlus(-280)}T00:00:00.000Z`),
        estimatedDeliveryDate: new Date(`${clinicTodayPlus(0)}T00:00:00.000Z`),
        eddSource: 'LMP',
        gravida: 1,
        para: 0,
        abortus: 0,
        endedAt: new Date(`${clinicTodayPlus(-3)}T08:00:00.000Z`),
        createdById,
      },
      select: { id: true },
    });
    const delivery = await prisma.deliveryRecord.create({
      data: {
        pregnancyEpisodeId: episode.id,
        attendantDoctorId: providerDoctorId,
        birthAt: new Date(`${clinicTodayPlus(-3)}T08:00:00.000Z`),
        mode: 'SPONTANEOUS_VAGINAL',
        recordedById: createdById,
      },
      select: { id: true },
    });

    const before = await service.getPatientFamilyPlanning(patientId, currentUser);
    expect(before.postDeliveryCandidate).toEqual(
      expect.objectContaining({ deliveryRecordId: delivery.id }),
    );

    const course = await service.startCourse(
      patientId,
      {
        method: 'INJECTABLE_3_MONTH',
        acceptorType: 'NEW',
        startedOn: clinicTodayPlus(0),
        providerDoctorId,
        deliveryRecordId: delivery.id,
      },
      currentUser,
    );
    expect(course.deliveryRecordId).toBe(delivery.id);

    await service.discontinueCourse(
      course.id,
      { discontinuedOn: clinicTodayPlus(0), reason: 'OTHER' },
      currentUser,
    );
    const after = await service.getPatientFamilyPlanning(patientId, currentUser);
    expect(after.postDeliveryCandidate).toBeNull();
  });
});
