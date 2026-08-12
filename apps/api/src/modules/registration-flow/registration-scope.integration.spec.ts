import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../common/prisma/prisma.service';
import { buildRegistrationScopeWhere } from './repository/build-registration-scope-where';

/**
 * SJ-2 — the property only Postgres can prove for registrations: the
 * patient-side scope fragment really keeps another patient's rows inside the
 * database. Two owned patients, two registrations, one outsider.
 */
describe('Registration scope where-clause against Postgres', () => {
  let prisma: PrismaService;

  const seedSuffix = `sj2-reg-${Date.now()}`;
  const seededUserIds: string[] = [];
  const seededPatientIds: string[] = [];
  const seededRegistrationIds: string[] = [];
  let ownerAUserId: string;
  let outsiderUserId: string;
  let ownerARegistrationId: string;

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService());
    await prisma.$connect();
    const [ownerA, ownerB, outsider] = await Promise.all([
      prisma.user.create({
        data: { email: `owner-a-${seedSuffix}@spec.local`, passwordHash: 'x' },
      }),
      prisma.user.create({
        data: { email: `owner-b-${seedSuffix}@spec.local`, passwordHash: 'x' },
      }),
      prisma.user.create({
        data: { email: `outsider-${seedSuffix}@spec.local`, passwordHash: 'x' },
      }),
    ]);
    ownerAUserId = ownerA.id;
    outsiderUserId = outsider.id;
    seededUserIds.push(ownerA.id, ownerB.id, outsider.id);
    const [patientA, patientB] = await Promise.all([
      prisma.patientProfile.create({
        data: {
          mrn: `MRN-${seedSuffix}-A`,
          fullName: 'Patient A',
          phoneNumber: '0800000001',
          ownerUserId: ownerA.id,
        },
      }),
      prisma.patientProfile.create({
        data: {
          mrn: `MRN-${seedSuffix}-B`,
          fullName: 'Patient B',
          phoneNumber: '0800000002',
          ownerUserId: ownerB.id,
        },
      }),
    ]);
    seededPatientIds.push(patientA.id, patientB.id);
    const [registrationA, registrationB] = await Promise.all([
      prisma.registration.create({
        data: { patientId: patientA.id, queueDate: new Date('2027-04-01T00:00:00.000Z') },
      }),
      prisma.registration.create({
        data: { patientId: patientB.id, queueDate: new Date('2027-04-01T00:00:00.000Z') },
      }),
    ]);
    ownerARegistrationId = registrationA.id;
    seededRegistrationIds.push(registrationA.id, registrationB.id);
  });

  afterAll(async () => {
    await prisma.registration.deleteMany({ where: { id: { in: seededRegistrationIds } } });
    await prisma.patientProfile.deleteMany({ where: { id: { in: seededPatientIds } } });
    await prisma.user.deleteMany({ where: { id: { in: seededUserIds } } });
    await prisma.$disconnect();
  });

  function listRegistrationsWithScope(actorUserId: string): Promise<Array<{ id: string }>> {
    return prisma.registration.findMany({
      where: {
        id: { in: seededRegistrationIds },
        deletedAt: null,
        AND: [buildRegistrationScopeWhere({ userId: actorUserId, scope: 'OWN' })],
      },
      select: { id: true },
    });
  }

  it('reaches only the registrations of patients the actor owns', async () => {
    const actualRows = await listRegistrationsWithScope(ownerAUserId);
    expect(actualRows).toEqual([{ id: ownerARegistrationId }]);
  });

  it('keeps every registration away from a non-owner', async () => {
    const actualRows = await listRegistrationsWithScope(outsiderUserId);
    expect(actualRows).toEqual([]);
  });

  it('keeps another patient\'s registration inside the database on a by-ID probe', async () => {
    const foreignRegistrationId = seededRegistrationIds.find(
      (id) => id !== ownerARegistrationId,
    ) as string;
    const actualRow = await prisma.registration.findFirst({
      where: {
        id: foreignRegistrationId,
        deletedAt: null,
        AND: [buildRegistrationScopeWhere({ userId: ownerAUserId, scope: 'OWN' })],
      },
      select: { id: true },
    });
    expect(actualRow).toBeNull();
  });
});
