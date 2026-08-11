import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../common/prisma/prisma.service';
import { buildAppointmentScopeWhere } from './repository/build-appointment-scope-where';
import { buildSessionScopeWhere } from './repository/build-session-scope-where';

/**
 * SJ-2 — the property only Postgres can prove for appointments: the scope
 * fragments really keep another actor's rows inside the database. Ownership
 * is participant-side for appointments (patient owner or doctor owner) and
 * doctor-side only for sessions; both are exercised against seeded rows.
 */
describe('Appointment scope where-clauses against Postgres', () => {
  let prisma: PrismaService;

  const seedSuffix = `sj2-appt-${Date.now()}`;
  const seededUserIds: string[] = [];
  const seededPatientIds: string[] = [];
  const seededAppointmentIds: string[] = [];
  let seededSpecialtyId: string;
  let seededDoctorId: string;
  let seededSessionId: string;
  let patientOwnerUserId: string;
  let doctorUserId: string;
  let outsiderUserId: string;
  let ownParticipantAppointmentId: string;
  let foreignPatientAppointmentId: string;

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService());
    await prisma.$connect();
    const [patientOwner, doctorUser, outsider] = await Promise.all([
      prisma.user.create({
        data: { email: `patient-owner-${seedSuffix}@spec.local`, passwordHash: 'x' },
      }),
      prisma.user.create({
        data: { email: `doctor-user-${seedSuffix}@spec.local`, passwordHash: 'x' },
      }),
      prisma.user.create({
        data: { email: `outsider-${seedSuffix}@spec.local`, passwordHash: 'x' },
      }),
    ]);
    patientOwnerUserId = patientOwner.id;
    doctorUserId = doctorUser.id;
    outsiderUserId = outsider.id;
    seededUserIds.push(patientOwner.id, doctorUser.id, outsider.id);
    const specialty = await prisma.specialty.create({
      data: { name: `Appt Scope Spec ${seedSuffix}` },
    });
    seededSpecialtyId = specialty.id;
    const doctor = await prisma.doctorProfile.create({
      data: {
        licenseNumber: `LIC-${seedSuffix}`,
        fullName: 'Dr Appt Scope Spec',
        specialtyId: specialty.id,
        ownerUserId: doctorUser.id,
      },
    });
    seededDoctorId = doctor.id;
    const [ownedPatient, foreignPatient] = await Promise.all([
      prisma.patientProfile.create({
        data: {
          mrn: `MRN-${seedSuffix}-A`,
          fullName: 'Owned Patient',
          phoneNumber: '0800000001',
          ownerUserId: patientOwner.id,
        },
      }),
      prisma.patientProfile.create({
        data: {
          mrn: `MRN-${seedSuffix}-B`,
          fullName: 'Foreign Patient',
          phoneNumber: '0800000002',
        },
      }),
    ]);
    seededPatientIds.push(ownedPatient.id, foreignPatient.id);
    const [ownParticipantAppointment, foreignPatientAppointment] = await Promise.all([
      prisma.appointment.create({
        data: {
          patientId: ownedPatient.id,
          doctorId: doctor.id,
          scheduledAt: new Date('2027-03-01T09:00:00.000Z'),
        },
      }),
      prisma.appointment.create({
        data: {
          patientId: foreignPatient.id,
          doctorId: doctor.id,
          scheduledAt: new Date('2027-03-01T10:00:00.000Z'),
        },
      }),
    ]);
    ownParticipantAppointmentId = ownParticipantAppointment.id;
    foreignPatientAppointmentId = foreignPatientAppointment.id;
    seededAppointmentIds.push(ownParticipantAppointment.id, foreignPatientAppointment.id);
    const session = await prisma.appointmentSession.create({
      data: {
        doctorId: doctor.id,
        sessionDate: new Date('2027-03-01T00:00:00.000Z'),
        startTime: '08:00',
        endTime: '12:00',
      },
    });
    seededSessionId = session.id;
  });

  afterAll(async () => {
    await prisma.appointment.deleteMany({ where: { id: { in: seededAppointmentIds } } });
    await prisma.appointmentSession.deleteMany({ where: { id: seededSessionId } });
    await prisma.patientProfile.deleteMany({ where: { id: { in: seededPatientIds } } });
    await prisma.doctorProfile.deleteMany({ where: { id: seededDoctorId } });
    await prisma.specialty.deleteMany({ where: { id: seededSpecialtyId } });
    await prisma.user.deleteMany({ where: { id: { in: seededUserIds } } });
    await prisma.$disconnect();
  });

  function findAppointmentWithScope(
    appointmentId: string,
    actorUserId: string,
  ): Promise<{ id: string } | null> {
    return prisma.appointment.findFirst({
      where: {
        id: appointmentId,
        deletedAt: null,
        AND: [buildAppointmentScopeWhere({ userId: actorUserId, scope: 'OWN' })],
      },
      select: { id: true },
    });
  }

  it('reaches an appointment through the owned patient side', async () => {
    const actualRow = await findAppointmentWithScope(
      ownParticipantAppointmentId,
      patientOwnerUserId,
    );
    expect(actualRow).toEqual({ id: ownParticipantAppointmentId });
  });

  it('reaches every appointment on the owned doctor side', async () => {
    const actualRows = await prisma.appointment.findMany({
      where: {
        id: { in: seededAppointmentIds },
        deletedAt: null,
        AND: [buildAppointmentScopeWhere({ userId: doctorUserId, scope: 'OWN' })],
      },
      select: { id: true },
      orderBy: { scheduledAt: 'asc' },
    });
    expect(actualRows).toEqual([
      { id: ownParticipantAppointmentId },
      { id: foreignPatientAppointmentId },
    ]);
  });

  it('keeps another patient\'s appointment inside the database', async () => {
    const actualRow = await findAppointmentWithScope(
      foreignPatientAppointmentId,
      patientOwnerUserId,
    );
    expect(actualRow).toBeNull();
  });

  it('keeps every appointment away from a non-participant', async () => {
    const actualRows = await prisma.appointment.findMany({
      where: {
        id: { in: seededAppointmentIds },
        deletedAt: null,
        AND: [buildAppointmentScopeWhere({ userId: outsiderUserId, scope: 'OWN' })],
      },
      select: { id: true },
    });
    expect(actualRows).toEqual([]);
  });

  it('reaches a session only through the owning doctor user', async () => {
    const doctorRow = await prisma.appointmentSession.findFirst({
      where: {
        id: seededSessionId,
        AND: [buildSessionScopeWhere({ userId: doctorUserId, scope: 'OWN' })],
      },
      select: { id: true },
    });
    const patientRow = await prisma.appointmentSession.findFirst({
      where: {
        id: seededSessionId,
        AND: [buildSessionScopeWhere({ userId: patientOwnerUserId, scope: 'OWN' })],
      },
      select: { id: true },
    });
    expect(doctorRow).toEqual({ id: seededSessionId });
    expect(patientRow).toBeNull();
  });
});
