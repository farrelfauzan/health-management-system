import { randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../common/prisma/prisma.service';

/**
 * What the newborn link is worth only the database can say (P24-T10): twins
 * are two births in one minute and the clinic must be able to register both,
 * while the same twin must never be registered twice. Both facts live in a
 * partial unique index and a CHECK, so they are proven here against real
 * Postgres rather than against a mock that would agree with anything.
 */
describe('Newborn mother link against Postgres', () => {
  let prisma: PrismaService;

  const createdPatientIds: string[] = [];
  let motherId: string;

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService());
    await prisma.$connect();
    const mother = await prisma.patientProfile.create({
      data: {
        sex: 'FEMALE',
        mrn: `NB-${randomUUID().slice(0, 18)}`,
        fullName: 'Siti Aminah',
        dateOfBirth: new Date('1995-03-03'),
        phoneNumber: '081210000001',
        address: 'Jl. Merdeka No. 10',
      },
    });
    motherId = mother.id;
    createdPatientIds.push(mother.id);
  });

  afterAll(async () => {
    // Newborns first: the mother's row is what they restrict.
    await prisma.patientProfile.deleteMany({ where: { motherPatientId: motherId } });
    await prisma.patientProfile.deleteMany({ where: { id: { in: createdPatientIds } } });
    await prisma.$disconnect();
  });

  async function registerNewborn(birthOrder: number | null): Promise<string> {
    const newborn = await prisma.patientProfile.create({
      data: {
        sex: 'FEMALE',
        mrn: `NB-${randomUUID().slice(0, 18)}`,
        fullName: 'Bayi Ny. Siti Aminah',
        dateOfBirth: new Date('2026-09-20'),
        phoneNumber: '081210000001',
        address: 'Jl. Merdeka No. 10',
        motherPatientId: motherId,
        birthOrder,
      },
    });
    createdPatientIds.push(newborn.id);
    return newborn.id;
  }

  it('registers twins as birth orders 1 and 2 on the same date of birth', async () => {
    const firstTwinId = await registerNewborn(1);
    const secondTwinId = await registerNewborn(2);

    const twins = await prisma.patientProfile.findMany({
      where: { id: { in: [firstTwinId, secondTwinId] } },
      orderBy: { birthOrder: 'asc' },
      select: { birthOrder: true, dateOfBirth: true, motherPatientId: true },
    });
    expect(twins.map((twin) => twin.birthOrder)).toEqual([1, 2]);
    expect(twins[0]?.dateOfBirth).toEqual(twins[1]?.dateOfBirth);
    expect(twins.every((twin) => twin.motherPatientId === motherId)).toBe(true);
  });

  it('refuses the same twin twice', async () => {
    await registerNewborn(3);

    await expect(registerNewborn(3)).rejects.toThrow();
  });

  it('refuses a birth order below 1, which counts nothing', async () => {
    await expect(registerNewborn(0)).rejects.toThrow();
  });

  it('refuses a newborn with no birth order at all', async () => {
    await expect(registerNewborn(null)).rejects.toThrow();
  });

  it('refuses deleting a mother who has a child in the registry', async () => {
    await registerNewborn(4);

    await expect(prisma.patientProfile.delete({ where: { id: motherId } })).rejects.toThrow();
  });
});
