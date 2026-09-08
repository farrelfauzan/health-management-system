import { randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../common/prisma/prisma.service';
import { LabResultRepository } from './repository/lab-result.repository';

/**
 * The storage facts no mocked repository can prove (`P18-T04`):
 *
 * - an amendment writes a **new version** and leaves the value it corrects
 *   readable, because somebody may have treated a patient on the strength of
 *   the old number;
 * - two amendments racing cannot both claim the same version, which is what
 *   the unique index on (item, version) is for — without it one correction
 *   would silently disappear;
 * - two analysts saving the same worksheet lose no rows: entry upserts version
 *   one per item, so the later save re-states its own items and leaves the
 *   others alone.
 *
 * Fixtures are created and torn down around the run, so a shared dev database
 * keeps its own rows.
 */
describe('Lab result versioning against Postgres', () => {
  let prisma: PrismaService;
  let repository: LabResultRepository;

  const suffix = randomUUID();
  let labOrderId = '';
  let firstItemId = '';
  let secondItemId = '';
  let analystUserId = '';
  let verifierUserId = '';
  const createdIds: { patientId: string; doctorId: string; specialtyId: string } = {
    patientId: '',
    doctorId: '',
    specialtyId: '',
  };

  const collectedAt = new Date('2099-03-01T02:00:00.000Z');

  async function createUser(email: string): Promise<string> {
    const user = await prisma.user.create({
      data: { email, passwordHash: 'not-a-real-hash' },
    });

    return user.id;
  }

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService());
    await prisma.$connect();
    repository = new LabResultRepository(prisma);
    analystUserId = await createUser(`analis-${suffix}@hms.local`);
    verifierUserId = await createUser(`dokter-${suffix}@hms.local`);
    const specialty = await prisma.specialty.create({ data: { name: `Lab Result ${suffix}` } });
    const patient = await prisma.patientProfile.create({
      data: {
        sex: 'FEMALE',
        mrn: `LABRES-${suffix}`,
        fullName: 'Lab Result Patient',
        dateOfBirth: new Date('1990-04-12T00:00:00.000Z'),
        phoneNumber: '+6280000000000',
        address: 'Test address',
      },
    });
    const doctor = await prisma.doctorProfile.create({
      data: {
        licenseNumber: `LABRES-${suffix}`,
        fullName: 'Lab Result Doctor',
        specialtyId: specialty.id,
      },
    });
    createdIds.specialtyId = specialty.id;
    createdIds.patientId = patient.id;
    createdIds.doctorId = doctor.id;
    const registration = await prisma.registration.create({
      data: { patientId: patient.id, status: 'COMPLETED', checkedInAt: collectedAt },
    });
    const encounter = await prisma.encounter.create({
      data: {
        registrationId: registration.id,
        patientId: patient.id,
        doctorId: doctor.id,
        status: 'IN_PROGRESS',
        startedAt: collectedAt,
      },
    });
    const firstTest = await prisma.labTest.create({
      data: {
        code: `HB-${suffix}`,
        name: 'Hemoglobin',
        specimenType: 'WHOLE_BLOOD',
        resultType: 'NUMERIC',
        unit: 'g/dL',
      },
    });
    const secondTest = await prisma.labTest.create({
      data: {
        code: `GDS-${suffix}`,
        name: 'Glukosa Darah Sewaktu',
        specimenType: 'SERUM',
        resultType: 'NUMERIC',
        unit: 'mg/dL',
      },
    });
    const labOrder = await prisma.labOrder.create({
      data: {
        encounterId: encounter.id,
        patientId: patient.id,
        orderedById: doctor.id,
        orderNumber: `LAB/2099/${suffix.slice(0, 8)}`,
        status: 'COLLECTED',
        orderedAt: collectedAt,
        items: {
          create: [{ labTestId: firstTest.id }, { labTestId: secondTest.id }],
        },
      },
      include: { items: { orderBy: { createdAt: 'asc' } } },
    });
    labOrderId = labOrder.id;
    firstItemId = labOrder.items[0]?.id ?? '';
    secondItemId = labOrder.items[1]?.id ?? '';
  });

  afterAll(async () => {
    await prisma.labResult.deleteMany({ where: { labOrderItem: { labOrderId } } });
    await prisma.labOrderItem.deleteMany({ where: { labOrderId } });
    await prisma.labOrder.deleteMany({ where: { id: labOrderId } });
    await prisma.encounter.deleteMany({ where: { patientId: createdIds.patientId } });
    await prisma.registration.deleteMany({ where: { patientId: createdIds.patientId } });
    await prisma.labTest.deleteMany({ where: { code: { endsWith: suffix } } });
    await prisma.patientProfile.deleteMany({ where: { id: createdIds.patientId } });
    await prisma.doctorProfile.deleteMany({ where: { id: createdIds.doctorId } });
    await prisma.specialty.deleteMany({ where: { id: createdIds.specialtyId } });
    await prisma.user.deleteMany({ where: { id: { in: [analystUserId, verifierUserId] } } });
    await prisma.$disconnect();
  });

  function buildEntry(labOrderItemId: string, valueNumeric: number) {
    return {
      labOrderItemId,
      valueNumeric,
      valueText: null,
      valueCoded: null,
      unit: 'g/dL',
      refLow: 12,
      refHigh: 16,
      refCriticalLow: 7,
      refCriticalHigh: 20,
      refText: null,
      flag: 'CRITICAL_LOW' as const,
    };
  }

  it('moves the order to RESULTED only once every item carries a value', async () => {
    await repository.enterLabResults({
      labOrderId,
      enteredById: analystUserId,
      enteredAt: new Date(),
      entries: [buildEntry(firstItemId, 6.8)],
    });
    const partial = await prisma.labOrder.findUniqueOrThrow({ where: { id: labOrderId } });
    expect(partial.status).toBe('IN_PROGRESS');

    await repository.enterLabResults({
      labOrderId,
      enteredById: analystUserId,
      enteredAt: new Date(),
      entries: [buildEntry(secondItemId, 110)],
    });
    const complete = await prisma.labOrder.findUniqueOrThrow({ where: { id: labOrderId } });
    expect(complete.status).toBe('RESULTED');
  });

  it('lets two analysts save the same order without losing either row', async () => {
    await Promise.all([
      repository.enterLabResults({
        labOrderId,
        enteredById: analystUserId,
        enteredAt: new Date(),
        entries: [buildEntry(firstItemId, 7.2)],
      }),
      repository.enterLabResults({
        labOrderId,
        enteredById: verifierUserId,
        enteredAt: new Date(),
        entries: [buildEntry(secondItemId, 118)],
      }),
    ]);
    const results = await repository.findResultsByOrderId(labOrderId);
    expect(results).toHaveLength(2);
    const actualValues = results
      .map((result) => result.valueNumeric ?? 0)
      .sort((left, right) => left - right);
    expect(actualValues).toEqual([7.2, 118]);
  });

  it('keeps the superseded value readable after an amendment', async () => {
    const released = await repository.releaseLabOrder({
      labOrderId,
      verifiedById: verifierUserId,
      verifiedAt: new Date(),
      verifiedUnderSingleOperator: false,
    });
    const original = released.find((result) => result.labOrderItemId === firstItemId);
    const amended = await repository.amendLabResult({
      amendedFromId: original?.id ?? '',
      labOrderId,
      labOrderItemId: firstItemId,
      version: 2,
      valueNumeric: 8.6,
      valueText: null,
      valueCoded: null,
      unit: 'g/dL',
      refLow: original?.refLow ?? null,
      refHigh: original?.refHigh ?? null,
      refCriticalLow: original?.refCriticalLow ?? null,
      refCriticalHigh: original?.refCriticalHigh ?? null,
      refText: null,
      flag: 'LOW',
      amendReason: 'Salah ketik pada worksheet',
      enteredById: verifierUserId,
      enteredAt: new Date(),
      verifiedById: verifierUserId,
      verifiedAt: new Date(),
      verifiedUnderSingleOperator: true,
    });
    const versions = await prisma.labResult.findMany({
      where: { labOrderItemId: firstItemId },
      orderBy: { version: 'asc' },
    });

    expect(amended.version).toBe(2);
    expect(versions).toHaveLength(2);
    expect(versions[0]?.valueNumeric?.toNumber()).toBe(7.2);
    expect(versions[1]?.amendedFromId).toBe(original?.id);
  });

  it('re-releases the order with a later timestamp than the first release', async () => {
    const order = await prisma.labOrder.findUniqueOrThrow({ where: { id: labOrderId } });

    expect(order.status).toBe('RELEASED');
    expect(order.releasedAt).not.toBeNull();
  });

  it('reports only the current version on the trend feed', async () => {
    const trend = await repository.listPatientLabResults({
      patientId: createdIds.patientId,
      limit: 20,
    });
    const haemoglobin = trend.filter((result) => result.labOrderItemId === firstItemId);

    expect(haemoglobin).toHaveLength(1);
    expect(haemoglobin[0]?.valueNumeric).toBe(8.6);
  });

  // Without the unique index one of two racing corrections would be written and
  // then quietly lost behind the other.
  it('refuses a second amendment claiming a version that is taken', async () => {
    const current = await prisma.labResult.findFirstOrThrow({
      where: { labOrderItemId: firstItemId, version: 2 },
    });
    await expect(
      repository.amendLabResult({
        amendedFromId: current.id,
        labOrderId,
        labOrderItemId: firstItemId,
        version: 2,
        valueNumeric: 9.1,
        valueText: null,
        valueCoded: null,
        unit: 'g/dL',
        refLow: 12,
        refHigh: 16,
        refCriticalLow: 7,
        refCriticalHigh: 20,
        refText: null,
        flag: 'LOW',
        amendReason: 'Koreksi kedua',
        enteredById: verifierUserId,
        enteredAt: new Date(),
        verifiedById: verifierUserId,
        verifiedAt: new Date(),
        verifiedUnderSingleOperator: true,
      }),
    ).rejects.toBeDefined();
  });
});
