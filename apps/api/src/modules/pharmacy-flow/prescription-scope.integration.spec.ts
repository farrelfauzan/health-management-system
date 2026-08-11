import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../common/prisma/prisma.service';
import { buildPrescriptionScopeWhere } from './repository/build-prescription-scope-where';

/**
 * SJ-2 — the property only Postgres can prove for prescriptions: the
 * participant-side scope fragment really keeps another actor's rows inside
 * the database. Mirrors the appointment proof: patient-side reach,
 * doctor-side reach, and denial for a non-participant.
 */
describe('Prescription scope where-clause against Postgres', () => {
  let prisma: PrismaService;

  const seedSuffix = `sj2-rx-${Date.now()}`;
  const seededUserIds: string[] = [];
  const seededPatientIds: string[] = [];
  const seededPrescriptionIds: string[] = [];
  let seededSpecialtyId: string;
  let seededDoctorId: string;
  let patientOwnerUserId: string;
  let doctorUserId: string;
  let outsiderUserId: string;
  let ownPatientPrescriptionId: string;
  let foreignPatientPrescriptionId: string;

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
      data: { name: `Rx Scope Spec ${seedSuffix}` },
    });
    seededSpecialtyId = specialty.id;
    const doctor = await prisma.doctorProfile.create({
      data: {
        licenseNumber: `LIC-${seedSuffix}`,
        fullName: 'Dr Rx Scope Spec',
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
    const [ownPatientPrescription, foreignPatientPrescription] = await Promise.all([
      prisma.prescription.create({
        data: { patientId: ownedPatient.id, doctorId: doctor.id },
      }),
      prisma.prescription.create({
        data: { patientId: foreignPatient.id, doctorId: doctor.id },
      }),
    ]);
    ownPatientPrescriptionId = ownPatientPrescription.id;
    foreignPatientPrescriptionId = foreignPatientPrescription.id;
    seededPrescriptionIds.push(ownPatientPrescription.id, foreignPatientPrescription.id);
  });

  afterAll(async () => {
    await prisma.prescription.deleteMany({ where: { id: { in: seededPrescriptionIds } } });
    await prisma.patientProfile.deleteMany({ where: { id: { in: seededPatientIds } } });
    await prisma.doctorProfile.deleteMany({ where: { id: seededDoctorId } });
    await prisma.specialty.deleteMany({ where: { id: seededSpecialtyId } });
    await prisma.user.deleteMany({ where: { id: { in: seededUserIds } } });
    await prisma.$disconnect();
  });

  function listPrescriptionsWithScope(actorUserId: string): Promise<Array<{ id: string }>> {
    return prisma.prescription.findMany({
      where: {
        id: { in: seededPrescriptionIds },
        deletedAt: null,
        AND: [buildPrescriptionScopeWhere({ userId: actorUserId, scope: 'OWN' })],
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  it('reaches a prescription through the owned patient side only', async () => {
    const actualRows = await listPrescriptionsWithScope(patientOwnerUserId);
    expect(actualRows).toEqual([{ id: ownPatientPrescriptionId }]);
  });

  it('reaches every prescription on the prescribing doctor side', async () => {
    const actualRows = await listPrescriptionsWithScope(doctorUserId);
    expect(actualRows).toEqual([
      { id: ownPatientPrescriptionId },
      { id: foreignPatientPrescriptionId },
    ]);
  });

  it('keeps every prescription away from a non-participant', async () => {
    const actualRows = await listPrescriptionsWithScope(outsiderUserId);
    expect(actualRows).toEqual([]);
  });
});
