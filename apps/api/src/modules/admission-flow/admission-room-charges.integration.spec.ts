import { INestApplication, VersioningType } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { PrismaService } from '../../common/prisma/prisma.service';
import { PermissionScope } from '../../generated/prisma/client';

/**
 * IMP-15 end to end: discharging a stay raises the accommodation invoice.
 *
 * The timestamps are fixed instants in the past, written as UTC with Jakarta
 * (UTC+7) in mind — 17:00Z is midnight in the clinic. Fixed rather than
 * relative to `now`, because the number of midnights a stay crosses is exactly
 * what is under test, and a clock-relative fixture would make it depend on the
 * hour CI happens to run.
 *
 * The stay deliberately spans a transfer between room classes: two nights in
 * Kelas 1, then two in a VIP room.
 */
describe('Admission room charges against Postgres', () => {
  const TEST_MARKER = 'imp15-room-charges-spec';
  const JWT_SECRET = process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret';
  const CLERK_USER_ID = 'b1aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3';
  const CLERK_ROLE_CODE = 'IMP15_SPEC_CLERK';
  const SPECIALTY_ID = 'b2aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3';
  const DOCTOR_ID = 'b3aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3';
  const PATIENT_ID = 'b4aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3';
  const OTHER_PATIENT_ID = 'b5aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3';

  const ADMITTED_AT = '2026-08-01T03:00:00.000Z';
  const TRANSFERRED_AT = '2026-08-03T07:00:00.000Z';
  const DISCHARGED_AT = '2026-08-05T02:00:00.000Z';

  const KELAS_1_NIGHTLY_PRICE = 300_000;
  const VIP_NIGHTLY_PRICE = 800_000;

  type CatalogSeed = {
    permissionKey: string;
    resource: string;
    action: string;
    scope: PermissionScope;
  };

  const CLERK_PERMISSIONS: readonly CatalogSeed[] = [
    { permissionKey: 'bed.read:any', resource: 'Bed', action: 'read', scope: 'ANY' },
    { permissionKey: 'admission.read:any', resource: 'Admission', action: 'read', scope: 'ANY' },
    { permissionKey: 'admission.admit:any', resource: 'Admission', action: 'admit', scope: 'ANY' },
    {
      permissionKey: 'admission.transfer:any',
      resource: 'Admission',
      action: 'transfer',
      scope: 'ANY',
    },
    {
      permissionKey: 'admission.discharge:any',
      resource: 'Admission',
      action: 'discharge',
      scope: 'ANY',
    },
    { permissionKey: 'invoice.read:any', resource: 'Invoice', action: 'read', scope: 'ANY' },
  ];

  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let clerkToken: string;
  let kelas1BedId: string;
  let vipBedId: string;
  let kelas3BedId: string;
  let kelas1ClassId: string;
  let vipClassId: string;

  function asClerk(method: 'get' | 'post', path: string) {
    return request(app.getHttpServer())[method](path).set('Authorization', `Bearer ${clerkToken}`);
  }

  async function seedFixtures(): Promise<void> {
    await prisma.user.upsert({
      where: { id: CLERK_USER_ID },
      update: { isActive: true, deletedAt: null },
      create: {
        id: CLERK_USER_ID,
        email: `${TEST_MARKER}@example.test`,
        passwordHash: 'not-a-hash',
        isActive: true,
      },
    });
    for (const entry of CLERK_PERMISSIONS) {
      await prisma.permission.upsert({
        where: { permissionKey: entry.permissionKey },
        update: {},
        create: entry,
      });
    }
    const permissions = await prisma.permission.findMany({
      where: { permissionKey: { in: CLERK_PERMISSIONS.map((entry) => entry.permissionKey) } },
      select: { id: true },
    });
    const role = await prisma.role.upsert({
      where: { code: CLERK_ROLE_CODE },
      update: { deletedAt: null },
      create: { code: CLERK_ROLE_CODE, name: `${TEST_MARKER} clerk`, isSystem: false },
    });
    await prisma.rolePermission.createMany({
      data: permissions.map((permission) => ({ roleId: role.id, permissionId: permission.id })),
      skipDuplicates: true,
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: CLERK_USER_ID, roleId: role.id } },
      update: { deletedAt: null, unassignedAt: null },
      create: { userId: CLERK_USER_ID, roleId: role.id },
    });

    await prisma.specialty.upsert({
      where: { id: SPECIALTY_ID },
      update: { deletedAt: null },
      create: { id: SPECIALTY_ID, name: `${TEST_MARKER} Penyakit Dalam` },
    });
    await prisma.doctorProfile.upsert({
      where: { id: DOCTOR_ID },
      update: { isActive: true, deletedAt: null },
      create: {
        id: DOCTOR_ID,
        licenseNumber: `${TEST_MARKER}-STR`,
        fullName: 'dr. Siti Rahayu, Sp.PD',
        specialtyId: SPECIALTY_ID,
        isActive: true,
      },
    });
    for (const [patientId, mrn] of [
      [PATIENT_ID, `${TEST_MARKER}-1`],
      [OTHER_PATIENT_ID, `${TEST_MARKER}-2`],
    ] as const) {
      await prisma.patientProfile.upsert({
        where: { id: patientId },
        update: { status: 'OUT_PATIENT', deletedAt: null },
        create: {
          id: patientId,
          mrn,
          fullName: `${TEST_MARKER} patient`,
          dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
          sex: 'FEMALE',
          phoneNumber: '081200000000',
          address: 'Jl. Uji Coba No. 1',
          status: 'OUT_PATIENT',
        },
      });
    }

    const [kelas1, vip, kelas3] = await Promise.all([
      prisma.roomClass.create({ data: { code: 'IMP15-KELAS-1', name: 'Kelas 1' } }),
      prisma.roomClass.create({ data: { code: 'IMP15-VIP', name: 'VIP' } }),
      prisma.roomClass.create({ data: { code: 'IMP15-KELAS-3', name: 'Kelas 3' } }),
    ]);
    kelas1ClassId = kelas1.id;
    vipClassId = vip.id;
    const ward = await prisma.ward.create({ data: { code: 'IMP15-MELATI', name: 'Bangsal Melati' } });
    const kelas1Room = await prisma.room.create({
      data: { wardId: ward.id, roomClassId: kelas1.id, code: '201', name: 'Kamar 201' },
    });
    const vipRoom = await prisma.room.create({
      data: { wardId: ward.id, roomClassId: vip.id, code: 'VIP-1', name: 'Kamar VIP 1' },
    });
    const kelas3Room = await prisma.room.create({
      data: { wardId: ward.id, roomClassId: kelas3.id, code: '301', name: 'Kamar 301' },
    });
    kelas1BedId = (await prisma.bed.create({ data: { roomId: kelas1Room.id, code: 'A' } })).id;
    vipBedId = (await prisma.bed.create({ data: { roomId: vipRoom.id, code: 'A' } })).id;
    kelas3BedId = (await prisma.bed.create({ data: { roomId: kelas3Room.id, code: 'A' } })).id;

    // Kelas 3 is deliberately left unpriced, so the gap path is exercised by
    // an absence rather than by deleting a row mid-spec.
    for (const [code, roomClassId, label, price] of [
      ['IMP15-AKOM-K1', kelas1.id, 'Kelas 1', KELAS_1_NIGHTLY_PRICE],
      ['IMP15-AKOM-VIP', vip.id, 'VIP', VIP_NIGHTLY_PRICE],
    ] as const) {
      await prisma.serviceTariff.create({
        data: {
          code,
          name: `Akomodasi ${label}`,
          category: 'ACCOMMODATION',
          roomClassId,
          price,
        },
      });
    }
  }

  async function removeFixtures(): Promise<void> {
    const patientIds = [PATIENT_ID, OTHER_PATIENT_ID];
    const invoices = await prisma.invoice.findMany({
      where: { patientId: { in: patientIds } },
      select: { id: true },
    });
    const invoiceIds = invoices.map((invoice) => invoice.id);
    await prisma.invoiceItem.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
    await prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
    await prisma.serviceTariff.deleteMany({ where: { code: { startsWith: 'IMP15-' } } });

    const wards = await prisma.ward.findMany({
      where: { code: { startsWith: 'IMP15' } },
      select: { id: true },
    });
    const wardIds = wards.map((ward) => ward.id);
    const rooms = await prisma.room.findMany({
      where: { wardId: { in: wardIds } },
      select: { id: true },
    });
    const roomIds = rooms.map((room) => room.id);
    await prisma.bedAssignment.deleteMany({
      where: { admission: { patientId: { in: patientIds } } },
    });
    await prisma.admission.deleteMany({ where: { patientId: { in: patientIds } } });
    await prisma.bed.deleteMany({ where: { roomId: { in: roomIds } } });
    await prisma.room.deleteMany({ where: { id: { in: roomIds } } });
    await prisma.ward.deleteMany({ where: { id: { in: wardIds } } });
    await prisma.roomClass.deleteMany({ where: { code: { startsWith: 'IMP15' } } });
    await prisma.patientProfile.deleteMany({ where: { id: { in: patientIds } } });
    await prisma.doctorProfile.deleteMany({ where: { id: DOCTOR_ID } });
    await prisma.specialty.deleteMany({ where: { id: SPECIALTY_ID } });

    const roles = await prisma.role.findMany({
      where: { code: CLERK_ROLE_CODE },
      select: { id: true },
    });
    const roleIds = roles.map((role) => role.id);
    await prisma.userRole.deleteMany({
      where: { OR: [{ roleId: { in: roleIds } }, { userId: CLERK_USER_ID }] },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: { in: roleIds } } });
    await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
    await prisma.user.deleteMany({ where: { id: CLERK_USER_ID } });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    app.enableVersioning({ defaultVersion: '1', prefix: 'v', type: VersioningType.URI });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ZodValidationPipe());
    await app.init();

    prisma = moduleRef.get(PrismaService);
    jwtService = moduleRef.get(JwtService);

    await removeFixtures();
    await seedFixtures();
    clerkToken = await jwtService.signAsync(
      { sub: CLERK_USER_ID, email: `${TEST_MARKER}@example.test` },
      { secret: JWT_SECRET },
    );
  });

  afterAll(async () => {
    await removeFixtures();
    await app.close();
  });

  it('bills four nights across a class transfer, on an invoice that names the stay', async () => {
    const admit = await asClerk('post', '/api/v1/admissions').send({
      patientId: PATIENT_ID,
      admittingDoctorId: DOCTOR_ID,
      bedId: kelas1BedId,
      admittedAt: ADMITTED_AT,
    });
    expect(admit.status).toBe(201);
    const admissionId = admit.body.data.id;

    const transfer = await asClerk('post', `/api/v1/admissions/${admissionId}/transfer`).send({
      bedId: vipBedId,
      effectiveAt: TRANSFERRED_AT,
    });
    expect(transfer.status).toBe(200);

    const discharge = await asClerk('post', `/api/v1/admissions/${admissionId}/discharge`).send({
      dischargedAt: DISCHARGED_AT,
      dischargeSummary: 'Pasien pulang dalam kondisi stabil.',
    });
    expect(discharge.status).toBe(200);
    expect(discharge.body.meta.roomCharge).toMatchObject({ nights: 4, gaps: [] });
    expect(discharge.body.meta.roomCharge.invoiceId).toBeDefined();

    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id: discharge.body.meta.roomCharge.invoiceId },
      include: { items: true },
    });
    // The bill names the stay, not an encounter — this patient was admitted
    // directly and never had an outpatient consultation to hang off.
    expect(invoice.admissionId).toBe(admissionId);
    expect(invoice.encounterId).toBeNull();
    expect(invoice.status).toBe('DRAFT');

    const lines = invoice.items
      .map((item) => ({
        itemType: item.itemType,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        amount: Number(item.amount),
      }))
      .sort((left, right) => left.unitPrice - right.unitPrice);
    expect(lines).toEqual([
      {
        itemType: 'ACCOMMODATION',
        quantity: 2,
        unitPrice: KELAS_1_NIGHTLY_PRICE,
        amount: 2 * KELAS_1_NIGHTLY_PRICE,
      },
      {
        itemType: 'ACCOMMODATION',
        quantity: 2,
        unitPrice: VIP_NIGHTLY_PRICE,
        amount: 2 * VIP_NIGHTLY_PRICE,
      },
    ]);
    expect(Number(invoice.totalAmount)).toBe(2 * KELAS_1_NIGHTLY_PRICE + 2 * VIP_NIGHTLY_PRICE);
    // The line reads the class's own name, so a clinic that renames a class
    // sees that name on the next bill rather than a copy kept in the service.
    expect(invoice.items.some((item) => item.description.includes('Kelas 1'))).toBe(true);
    expect(kelas1ClassId).toBeDefined();
  });

  it('finds the inpatient bill by admission on the ordinary invoice list', async () => {
    const admissions = await prisma.admission.findMany({
      where: { patientId: PATIENT_ID },
      select: { id: true },
    });
    const response = await asClerk('get', `/api/v1/invoices?admissionId=${admissions[0]?.id}`);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
  });

  it('reports an unpriced ward class as a gap instead of failing the discharge', async () => {
    const admit = await asClerk('post', '/api/v1/admissions').send({
      patientId: OTHER_PATIENT_ID,
      admittingDoctorId: DOCTOR_ID,
      bedId: kelas3BedId,
      admittedAt: ADMITTED_AT,
    });
    expect(admit.status).toBe(201);

    const discharge = await asClerk(
      'post',
      `/api/v1/admissions/${admit.body.data.id}/discharge`,
    ).send({ dischargedAt: DISCHARGED_AT });

    // The patient goes home either way. A missing tariff is a billing problem,
    // and holding a clinically ready patient on the ward over one would be a
    // far worse outcome than an invoice raised late.
    expect(discharge.status).toBe(200);
    expect(discharge.body.data.status).toBe('DISCHARGED');
    expect(discharge.body.meta.roomCharge.invoiceId).toBeUndefined();
    expect(discharge.body.meta.roomCharge.gaps).toEqual([
      expect.objectContaining({ reason: 'NO_ACCOMMODATION_TARIFF', code: 'IMP15-KELAS-3' }),
    ]);
  });

  it('allows only one live accommodation tariff per ward class', async () => {
    await expect(
      prisma.serviceTariff.create({
        data: {
          code: 'IMP15-AKOM-VIP-DUPLIKAT',
          name: 'Akomodasi VIP duplikat',
          category: 'ACCOMMODATION',
          roomClassId: vipClassId,
          price: 900_000,
        },
      }),
    ).rejects.toThrow();
  });

  it('refuses a ward class on a tariff that does not price accommodation', async () => {
    await expect(
      prisma.serviceTariff.create({
        data: {
          code: 'IMP15-KONSUL-SALAH',
          name: 'Konsultasi dengan kelas',
          category: 'CONSULTATION',
          roomClassId: vipClassId,
          price: 50_000,
        },
      }),
    ).rejects.toThrow();
  });
});
