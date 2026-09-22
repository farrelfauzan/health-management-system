import { randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';

import { NationalIdentifierCryptoService } from '../../common/crypto/national-identifier-crypto.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OwnAccountRepository } from './repository/own-account.repository';

/**
 * Sixteen-digit placeholders that are nobody's number. Distinct per test:
 * `users.nik_index` is unique, and rows live until `afterAll`.
 */
const NIK_PLACEHOLDER = '0000000000000000';
const REPLACED_NIK_PLACEHOLDER = '0000000000000011';
const REPLACEMENT_NIK_PLACEHOLDER = '0000000000000012';
const SHARED_NIK_PLACEHOLDER = '0000000000000021';

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
    repository = new OwnAccountRepository(
      prisma,
      new NationalIdentifierCryptoService(new ConfigService()),
    );
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

  it('stores an operator NIK only as ciphertext and blind index, and reads it back masked (P24-T15)', async () => {
    const userId = await createUser('Rani Putri');

    await expect(repository.saveAccountNik({ userId, nik: NIK_PLACEHOLDER })).resolves.toBe(
      'SAVED',
    );

    const stored = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { nikCiphertext: true, nikIndex: true, nikLast4: true, nikKeyVersion: true },
    });
    expect(stored.nikCiphertext).not.toBeNull();
    expect(stored.nikCiphertext).not.toContain(NIK_PLACEHOLDER);
    expect(stored.nikIndex).not.toBeNull();
    expect(stored.nikIndex).not.toContain(NIK_PLACEHOLDER);
    expect(stored.nikLast4).toBe('0000');
    expect(stored.nikKeyVersion).toBe(1);
    await expect(repository.findAccountById(userId)).resolves.toMatchObject({ nikLast4: '0000' });
  });

  it('replaces an operator NIK in place, keeping one per account', async () => {
    const userId = await createUser('Rani Putri');
    await repository.saveAccountNik({ userId, nik: REPLACED_NIK_PLACEHOLDER });

    await expect(
      repository.saveAccountNik({ userId, nik: REPLACEMENT_NIK_PLACEHOLDER }),
    ).resolves.toBe('SAVED');

    await expect(repository.findAccountById(userId)).resolves.toMatchObject({ nikLast4: '0012' });
  });

  it('refuses a second account with the same NIK', async () => {
    const firstUserId = await createUser('Rani Putri');
    const secondUserId = await createUser('Dewi Lestari');
    await repository.saveAccountNik({ userId: firstUserId, nik: SHARED_NIK_PLACEHOLDER });

    await expect(
      repository.saveAccountNik({ userId: secondUserId, nik: SHARED_NIK_PLACEHOLDER }),
    ).resolves.toBe('DUPLICATE_NIK');

    await expect(repository.findAccountById(secondUserId)).resolves.toMatchObject({
      nikLast4: null,
    });
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
});
