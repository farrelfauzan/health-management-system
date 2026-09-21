import { randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../common/prisma/prisma.service';
import { OwnAccountRepository } from './repository/own-account.repository';

/**
 * What renaming an account is worth only the database can say (P20-T05).
 *
 * The mirror onto `doctor_profiles.full_name` is one transaction, and a mocked
 * repository would agree with whatever this spec asserted. While that column
 * still exists it is what the doctor directory and every clinical document
 * read, so a rename that wrote only `users.full_name` would leave a doctor
 * called one thing on their account and another on the letters they sign.
 */
describe('Own account against Postgres', () => {
  let prisma: PrismaService;
  let repository: OwnAccountRepository;

  const createdUserIds: string[] = [];
  const createdDoctorIds: string[] = [];

  async function createUser(fullName: string | null): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: `account-${randomUUID()}@example.test`,
        passwordHash: 'not-a-real-hash',
        fullName,
      },
      select: { id: true },
    });
    createdUserIds.push(user.id);
    return user.id;
  }

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService());
    await prisma.$connect();
    repository = new OwnAccountRepository(prisma);
  });

  afterAll(async () => {
    await prisma.doctorProfile.deleteMany({ where: { id: { in: createdDoctorIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  it('reads an account that has never been named', async () => {
    const userId = await createUser(null);

    await expect(repository.findAccountById(userId)).resolves.toMatchObject({
      id: userId,
      fullName: null,
    });
  });

  it('writes the account name and mirrors it onto the doctor profile the account owns', async () => {
    const userId = await createUser('dr. Olivia Kirana');
    const specialty = await prisma.specialty.findFirst({
      where: { deletedAt: null },
      select: { id: true },
    });
    if (specialty === null) {
      throw new Error('The seeded specialty catalogue is empty; run pnpm db:seed');
    }
    const doctor = await prisma.doctorProfile.create({
      data: {
        fullName: 'dr. Olivia Kirana',
        profession: 'DOCTOR',
        licenseNumber: `ACC-${randomUUID().slice(0, 12)}`,
        specialtyId: specialty.id,
        ownerUserId: userId,
      },
      select: { id: true },
    });
    createdDoctorIds.push(doctor.id);

    await repository.renameAccount({ userId, fullName: 'dr. Olivia Kirana, Sp.OG' });

    await expect(
      prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } }),
    ).resolves.toEqual({ fullName: 'dr. Olivia Kirana, Sp.OG' });
    await expect(
      prisma.doctorProfile.findUnique({ where: { id: doctor.id }, select: { fullName: true } }),
    ).resolves.toEqual({ fullName: 'dr. Olivia Kirana, Sp.OG' });
  });

  it('renames an account that owns no profile without touching anybody else', async () => {
    const pharmacistId = await createUser(null);
    const otherId = await createUser('Nama Lain');

    await repository.renameAccount({ userId: pharmacistId, fullName: 'Rani Putri, S.Farm., Apt.' });

    await expect(
      prisma.user.findUnique({ where: { id: pharmacistId }, select: { fullName: true } }),
    ).resolves.toEqual({ fullName: 'Rani Putri, S.Farm., Apt.' });
    await expect(
      prisma.user.findUnique({ where: { id: otherId }, select: { fullName: true } }),
    ).resolves.toEqual({ fullName: 'Nama Lain' });
  });

  it('grants every human role the key the self-service route is guarded by', async () => {
    const grants = await prisma.rolePermission.findMany({
      where: { permission: { permissionKey: 'user.update:own' } },
      select: { role: { select: { code: true } } },
    });
    const roleCodes = grants.map((grant) => grant.role.code).sort();

    // SUPER_ADMIN holds it through the catalogue-wide grant, which writes a row
    // like any other. The two service-account roles are deliberately absent:
    // nobody is behind them to have a name.
    expect(roleCodes).toEqual([
      'ADMIN',
      'DOCTOR',
      'LAB_TECHNICIAN',
      'MIDWIFE',
      'PATIENT',
      'PHARMACIST',
      'SUPER_ADMIN',
    ]);
    expect(roleCodes).not.toContain('BPJS_ANTREAN_SYSTEM');
    expect(roleCodes).not.toContain('CUSTOMER_SERVICE_CHANNEL');
  });
});
