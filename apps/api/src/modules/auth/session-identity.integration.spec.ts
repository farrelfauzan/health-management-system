import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthRepository } from './repository/auth.repository';

/**
 * The shell header's one database question, against real Postgres.
 *
 * The rules it encodes are all about *which* record answers, so a unit test
 * with a stubbed Prisma would only restate the query back to itself: a
 * clinician who is also a patient is greeted as the clinician, a guardian who
 * owns their children's records is greeted as themselves, and a retired
 * profile is no name at all. Each of those is an ordering or a filter the
 * database applies, so the database has to be the one asked.
 */
describe('Session identity against Postgres', () => {
  const TEST_MARKER = 'session-identity-spec';

  let prisma: PrismaService;
  let authRepository: AuthRepository;
  let specialtyId: string;

  async function createUser(suffix: string): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: `${TEST_MARKER}-${suffix}@example.test`,
        passwordHash: 'not-a-real-hash',
      },
    });
    return user.id;
  }

  async function createDoctorProfile(params: {
    ownerUserId: string;
    fullName: string;
    suffix: string;
    profession?: 'DOCTOR' | 'MIDWIFE';
    deletedAt?: Date;
  }): Promise<void> {
    await prisma.doctorProfile.create({
      data: {
        licenseNumber: `${TEST_MARKER}-${params.suffix}`,
        fullName: params.fullName,
        specialtyId,
        profession: params.profession ?? 'DOCTOR',
        ownerUserId: params.ownerUserId,
        ...(params.deletedAt ? { deletedAt: params.deletedAt } : {}),
      },
    });
  }

  async function createPatientProfile(params: {
    ownerUserId: string;
    fullName: string;
    suffix: string;
    createdAt: Date;
    deletedAt?: Date;
  }): Promise<void> {
    await prisma.patientProfile.create({
      data: {
        mrn: `${TEST_MARKER}-${params.suffix}`,
        fullName: params.fullName,
        dateOfBirth: new Date('1990-05-17T00:00:00.000Z'),
        sex: 'FEMALE',
        phoneNumber: '081200000000',
        address: 'Jl. Melati No. 1',
        ownerUserId: params.ownerUserId,
        createdAt: params.createdAt,
        ...(params.deletedAt ? { deletedAt: params.deletedAt } : {}),
      },
    });
  }

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService());
    await prisma.$connect();
    authRepository = new AuthRepository(prisma);
    const specialty = await prisma.specialty.create({
      data: { name: `${TEST_MARKER}-specialty` },
    });
    specialtyId = specialty.id;
  });

  afterAll(async () => {
    const users = await prisma.user.findMany({
      where: { email: { startsWith: TEST_MARKER } },
      select: { id: true },
    });
    const userIds = users.map((user) => user.id);
    await prisma.doctorProfile.deleteMany({ where: { ownerUserId: { in: userIds } } });
    await prisma.patientProfile.deleteMany({ where: { ownerUserId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: TEST_MARKER } } });
    await prisma.specialty.deleteMany({ where: { name: { startsWith: TEST_MARKER } } });
    await prisma.$disconnect();
  });

  it('answers with the name on the doctor profile', async () => {
    const userId = await createUser('doctor');
    await createDoctorProfile({
      ownerUserId: userId,
      fullName: 'dr. Siti Nurhaliza, Sp.OG',
      suffix: 'doctor',
    });

    await expect(authRepository.findSessionIdentity(userId)).resolves.toEqual({
      displayName: 'dr. Siti Nurhaliza, Sp.OG',
      clinicianProfession: 'DOCTOR',
    });
  });

  it('answers with the patient record when the account has no doctor profile', async () => {
    const userId = await createUser('patient');
    await createPatientProfile({
      ownerUserId: userId,
      fullName: 'Ibu Ratna',
      suffix: 'patient',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    await expect(authRepository.findSessionIdentity(userId)).resolves.toEqual({
      displayName: 'Ibu Ratna',
      clinicianProfession: null,
    });
  });

  it('greets a guardian as themselves, not as the child whose record they also own', async () => {
    const userId = await createUser('guardian');
    await createPatientProfile({
      ownerUserId: userId,
      fullName: 'Ibu Dewi',
      suffix: 'guardian-self',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    await createPatientProfile({
      ownerUserId: userId,
      fullName: 'Ananda Dewi',
      suffix: 'guardian-child',
      createdAt: new Date('2026-03-01T00:00:00.000Z'),
    });

    await expect(authRepository.findSessionIdentity(userId)).resolves.toEqual({
      displayName: 'Ibu Dewi',
      clinicianProfession: null,
    });
  });

  it('ignores a retired profile rather than greeting someone with a withdrawn name', async () => {
    const userId = await createUser('retired');
    await createDoctorProfile({
      ownerUserId: userId,
      fullName: 'dr. Retired',
      suffix: 'retired',
      deletedAt: new Date('2026-02-01T00:00:00.000Z'),
    });

    await expect(authRepository.findSessionIdentity(userId)).resolves.toEqual({
      displayName: null,
      clinicianProfession: null,
    });
  });

  it('answers with the profession on the profile, whatever role the account holds', async () => {
    // The case this exists for: a clinician invited as a midwife whose profile
    // was later corrected to DOCTOR. The role assignment is a separate,
    // deliberate act and is deliberately left alone, so the profile is the
    // only place the shell can learn what they actually are.
    const userId = await createUser('corrected');
    await createDoctorProfile({
      ownerUserId: userId,
      fullName: 'Olivia Kirana',
      suffix: 'corrected',
      profession: 'DOCTOR',
    });

    await expect(authRepository.findSessionIdentity(userId)).resolves.toEqual({
      displayName: 'Olivia Kirana',
      clinicianProfession: 'DOCTOR',
    });
  });

  it('answers with nulls for an account no clinical record names', async () => {
    const userId = await createUser('receptionist');

    await expect(authRepository.findSessionIdentity(userId)).resolves.toEqual({
      displayName: null,
      clinicianProfession: null,
    });
  });
});
