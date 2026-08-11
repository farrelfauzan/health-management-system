import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../common/prisma/prisma.service';
import { buildPatientScopeWhere } from './repository/build-patient-scope-where';

/**
 * SJ-2 — the property only Postgres can prove: the scope fragment
 * {@link buildPatientScopeWhere} produces really keeps another actor's row
 * from leaving the database. Two patients and one assigned doctor are seeded;
 * every cross-tenant probe must come back empty at the SQL layer, before any
 * service code could leak it.
 */
describe('Patient scope where-clause against Postgres', () => {
  let prisma: PrismaService;

  const seedSuffix = `sj2-${Date.now()}`;
  const seededUserIds: string[] = [];
  const seededPatientIds: string[] = [];
  let seededSpecialtyId: string;
  let seededDoctorId: string;
  let patientOwnerUserId: string;
  let doctorUserId: string;
  let ownedPatientId: string;
  let otherPatientId: string;

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService());
    await prisma.$connect();
    const [patientOwner, otherOwner, doctorUser] = await Promise.all([
      prisma.user.create({
        data: { email: `patient-owner-${seedSuffix}@spec.local`, passwordHash: 'x' },
      }),
      prisma.user.create({
        data: { email: `other-owner-${seedSuffix}@spec.local`, passwordHash: 'x' },
      }),
      prisma.user.create({
        data: { email: `doctor-user-${seedSuffix}@spec.local`, passwordHash: 'x' },
      }),
    ]);
    patientOwnerUserId = patientOwner.id;
    doctorUserId = doctorUser.id;
    seededUserIds.push(patientOwner.id, otherOwner.id, doctorUser.id);
    const specialty = await prisma.specialty.create({
      data: { name: `Scope Spec ${seedSuffix}` },
    });
    seededSpecialtyId = specialty.id;
    const doctor = await prisma.doctorProfile.create({
      data: {
        licenseNumber: `LIC-${seedSuffix}`,
        fullName: 'Dr Scope Spec',
        specialtyId: specialty.id,
        ownerUserId: doctorUser.id,
      },
    });
    seededDoctorId = doctor.id;
    const ownedPatient = await prisma.patientProfile.create({
      data: {
        mrn: `MRN-${seedSuffix}-A`,
        fullName: 'Owned Patient',
        phoneNumber: '0800000001',
        ownerUserId: patientOwner.id,
      },
    });
    const otherPatient = await prisma.patientProfile.create({
      data: {
        mrn: `MRN-${seedSuffix}-B`,
        fullName: 'Other Patient',
        phoneNumber: '0800000002',
        ownerUserId: otherOwner.id,
      },
    });
    ownedPatientId = ownedPatient.id;
    otherPatientId = otherPatient.id;
    seededPatientIds.push(ownedPatient.id, otherPatient.id);
    // The doctor treats only the *other* owner's patient, so the doctor path
    // and the owner path are provably distinct rows.
    await prisma.doctorPatient.create({
      data: { doctorId: doctor.id, patientId: otherPatient.id },
    });
  });

  afterAll(async () => {
    await prisma.doctorPatient.deleteMany({ where: { doctorId: seededDoctorId } });
    await prisma.patientProfile.deleteMany({ where: { id: { in: seededPatientIds } } });
    await prisma.doctorProfile.deleteMany({ where: { id: seededDoctorId } });
    await prisma.specialty.deleteMany({ where: { id: seededSpecialtyId } });
    await prisma.user.deleteMany({ where: { id: { in: seededUserIds } } });
    await prisma.$disconnect();
  });

  function findPatientWithScope(
    patientId: string,
    actorUserId: string,
    ownership: 'CARE' | 'SELF',
  ): Promise<{ id: string } | null> {
    return prisma.patientProfile.findFirst({
      where: {
        id: patientId,
        deletedAt: null,
        AND: [buildPatientScopeWhere({ actor: { userId: actorUserId, scope: 'OWN' }, ownership })],
      },
      select: { id: true },
    });
  }

  it('keeps another owner\'s row inside the database on a self-scoped probe', async () => {
    const actualRow = await findPatientWithScope(otherPatientId, patientOwnerUserId, 'SELF');
    expect(actualRow).toBeNull();
  });

  it('returns the caller\'s own row under self ownership', async () => {
    const actualRow = await findPatientWithScope(ownedPatientId, patientOwnerUserId, 'SELF');
    expect(actualRow).toEqual({ id: ownedPatientId });
  });

  it('reaches an assigned patient through care ownership', async () => {
    const actualRow = await findPatientWithScope(otherPatientId, doctorUserId, 'CARE');
    expect(actualRow).toEqual({ id: otherPatientId });
  });

  it('keeps unassigned patients away from a doctor under care ownership', async () => {
    const actualRow = await findPatientWithScope(ownedPatientId, doctorUserId, 'CARE');
    expect(actualRow).toBeNull();
  });

  it('never lets a doctor assignment satisfy self ownership', async () => {
    const actualRow = await findPatientWithScope(otherPatientId, doctorUserId, 'SELF');
    expect(actualRow).toBeNull();
  });

  it('stops reaching a patient once the assignment is closed', async () => {
    await prisma.doctorPatient.updateMany({
      where: { doctorId: seededDoctorId, patientId: otherPatientId },
      data: { unassignedAt: new Date() },
    });
    const actualRow = await findPatientWithScope(otherPatientId, doctorUserId, 'CARE');
    expect(actualRow).toBeNull();
  });

  it('lists exactly the rows an own-scope care actor is connected to', async () => {
    const actualRows = await prisma.patientProfile.findMany({
      where: {
        id: { in: seededPatientIds },
        deletedAt: null,
        AND: [
          buildPatientScopeWhere({
            actor: { userId: patientOwnerUserId, scope: 'OWN' },
            ownership: 'CARE',
          }),
        ],
      },
      select: { id: true },
    });
    expect(actualRows).toEqual([{ id: ownedPatientId }]);
  });
});
