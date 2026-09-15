import { INestApplication, VersioningType } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SatusehatKfaClient } from '../../common/satusehat/satusehat-kfa.client';
import { PermissionScope } from '../../generated/prisma/client';

/**
 * The midwife formulary template applied over HTTP against real Postgres
 * (P25-T04). CI does not run the seed, so the spec writes its own template
 * items; the KFA client is stubbed so no run ever calls SATUSEHAT.
 *
 * Fixture codes are synthetic and marked `E2E`: they stand in for KFA codes
 * only inside this spec and are removed afterwards. Audit rows are
 * append-only, so the actor is deactivated rather than deleted.
 */
describe('Midwife formulary template (integration)', () => {
  const RUN_SUFFIX = Date.now().toString(36).toUpperCase();
  const RUN_DIGITS = String(Date.now()).slice(-8);
  const TEST_MARKER = `e2e-mwf-${RUN_SUFFIX}`;
  const ITEM_CODE_PREFIX = 'E2E_MWF_';
  const MEDICATION_CODE_PREFIX = 'E2EMWF';
  const JWT_SECRET = process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret';
  const ACTOR_USER_ID = 'c26e0c6e-7d7c-4b6a-9c1e-2f3a4b5c6d91';
  const ACTOR_ROLE_CODE = 'E2E_MIDWIFE_FORMULARY_ADMIN';
  const IRON_KFA_CODE = `81${RUN_DIGITS}1`;
  const OTHER_MAKER_KFA_CODE = `81${RUN_DIGITS}2`;
  const AMOXICILLIN_KFA_CODE = `81${RUN_DIGITS}3`;
  const IRON_TEMPLATE_CODE = `82${RUN_DIGITS}1`;
  const PERMISSIONS = [
    ['medication.read:any', 'Medication', 'read'],
    ['medication.update:any', 'Medication', 'update'],
  ] as const;

  const kfaClientStub = {
    searchProducts: jest.fn().mockResolvedValue([]),
    getProduct: jest.fn(async (kfaCode: string) =>
      kfaCode === OTHER_MAKER_KFA_CODE
        ? { kfaCode, templateKfaCode: IRON_TEMPLATE_CODE }
        : { kfaCode, templateKfaCode: null },
    ),
  };

  let app: INestApplication;
  let prisma: PrismaService;
  let actorToken: string;
  const medicationIds = { iron: '', otherMaker: '', keywordOnly: '', amoxicillin: '' };

  function asActor(method: 'get' | 'post', path: string) {
    return request(app.getHttpServer())[method](path).set('Authorization', `Bearer ${actorToken}`);
  }

  async function seedActor(): Promise<void> {
    await prisma.user.upsert({
      where: { id: ACTOR_USER_ID },
      update: { isActive: true, deletedAt: null },
      create: {
        id: ACTOR_USER_ID,
        email: `${TEST_MARKER}-admin@example.test`,
        passwordHash: 'not-a-hash',
        isActive: true,
      },
    });
    for (const [permissionKey, resource, action] of PERMISSIONS) {
      await prisma.permission.upsert({
        where: { permissionKey },
        update: {},
        create: { permissionKey, resource, action, scope: PermissionScope.ANY },
      });
    }
    const permissions = await prisma.permission.findMany({
      where: { permissionKey: { in: PERMISSIONS.map(([permissionKey]) => permissionKey) } },
      select: { id: true },
    });
    const role = await prisma.role.upsert({
      where: { code: ACTOR_ROLE_CODE },
      update: { deletedAt: null },
      create: { code: ACTOR_ROLE_CODE, name: 'E2E midwife formulary admin', isSystem: false },
    });
    await prisma.rolePermission.createMany({
      data: permissions.map((permission) => ({ roleId: role.id, permissionId: permission.id })),
      skipDuplicates: true,
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: ACTOR_USER_ID, roleId: role.id } },
      update: { deletedAt: null, unassignedAt: null },
      create: { userId: ACTOR_USER_ID, roleId: role.id },
    });
  }

  async function seedTemplateAndCatalog(): Promise<void> {
    await prisma.midwifeFormularyItem.createMany({
      data: [
        {
          code: `${ITEM_CODE_PREFIX}IRON_${RUN_SUFFIX}`,
          displayName: `Tablet tambah darah ${TEST_MARKER}`,
          group: 'OWN_AUTHORITY',
          regulationBasis: 'Permenkes 28/2017 Pasal 19 ayat (3) huruf e',
          kfaCodes: [IRON_KFA_CODE],
          kfaTemplateCodes: [IRON_TEMPLATE_CODE],
          matchKeywords: [`zatbesi${RUN_SUFFIX.toLowerCase()}`],
          sortOrder: 1,
        },
        {
          code: `${ITEM_CODE_PREFIX}VITK_${RUN_SUFFIX}`,
          displayName: `Vitamin K1 ${TEST_MARKER}`,
          group: 'OWN_AUTHORITY',
          regulationBasis: 'Permenkes 28/2017 Pasal 20 ayat (3)',
          kfaCodes: [`83${RUN_DIGITS}1`],
          kfaTemplateCodes: [],
          matchKeywords: [`fitomenadion${RUN_SUFFIX.toLowerCase()}`],
          sortOrder: 2,
        },
      ],
    });
    medicationIds.iron = await createMedication(
      'IRON',
      `Tablet Tambah Darah ${RUN_SUFFIX}`,
      IRON_KFA_CODE,
    );
    medicationIds.otherMaker = await createMedication(
      'OTHER',
      `Fe Folat ${RUN_SUFFIX}`,
      OTHER_MAKER_KFA_CODE,
    );
    medicationIds.keywordOnly = await createMedication(
      'KEYWORD',
      `Zatbesi${RUN_SUFFIX} sirup ${RUN_SUFFIX}`,
      null,
    );
    medicationIds.amoxicillin = await createMedication(
      'AMOX',
      `Amoxicillin 500 mg ${RUN_SUFFIX}`,
      AMOXICILLIN_KFA_CODE,
    );
  }

  async function createMedication(
    suffix: string,
    name: string,
    kfaCode: string | null,
  ): Promise<string> {
    const medication = await prisma.medication.create({
      data: { code: `${MEDICATION_CODE_PREFIX}-${suffix}-${RUN_SUFFIX}`, name, kfaCode },
      select: { id: true },
    });
    return medication.id;
  }

  async function removeFixtures(): Promise<void> {
    await prisma.midwifeFormularyItem.deleteMany({
      where: { code: { startsWith: ITEM_CODE_PREFIX } },
    });
    await prisma.medication.deleteMany({ where: { code: { startsWith: MEDICATION_CODE_PREFIX } } });
    const roles = await prisma.role.findMany({
      where: { code: ACTOR_ROLE_CODE },
      select: { id: true },
    });
    const roleIds = roles.map((role) => role.id);
    await prisma.userRole.deleteMany({
      where: { OR: [{ roleId: { in: roleIds } }, { userId: ACTOR_USER_ID }] },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: { in: roleIds } } });
    await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
    await prisma.user.updateMany({ where: { id: ACTOR_USER_ID }, data: { isActive: false } });
  }

  async function readFlags(): Promise<Record<string, boolean>> {
    const rows = await prisma.medication.findMany({
      where: { code: { startsWith: MEDICATION_CODE_PREFIX } },
      select: { id: true, isMidwifePrescribable: true },
    });
    return Object.fromEntries(rows.map((row) => [row.id, row.isMidwifePrescribable]));
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SatusehatKfaClient)
      .useValue(kfaClientStub)
      .compile();
    app = moduleRef.createNestApplication();
    app.enableVersioning({ defaultVersion: '1', prefix: 'v', type: VersioningType.URI });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ZodValidationPipe());
    await app.init();
    prisma = moduleRef.get(PrismaService);
    await removeFixtures();
    await seedActor();
    await seedTemplateAndCatalog();
    actorToken = await moduleRef
      .get(JwtService)
      .signAsync(
        { sub: ACTOR_USER_ID, email: `${TEST_MARKER}-admin@example.test` },
        { secret: JWT_SECRET },
      );
  });

  afterAll(async () => {
    await removeFixtures();
    await app.close();
    await prisma.$disconnect();
  });

  it('previews matches by exact code, by template and by keyword, and lists the unmatched item', async () => {
    const response = await asActor('get', '/api/v1/medications/midwife-formulary/preview');

    expect(response.status).toBe(200);
    const ironEntry = response.body.data.items.find(
      (entry: { item: { code: string } }) =>
        entry.item.code === `${ITEM_CODE_PREFIX}IRON_${RUN_SUFFIX}`,
    );
    expect(ironEntry.matches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ medicationId: medicationIds.iron, matchedBy: 'KFA_CODE' }),
        expect.objectContaining({
          medicationId: medicationIds.otherMaker,
          matchedBy: 'KFA_TEMPLATE',
        }),
        expect.objectContaining({ medicationId: medicationIds.keywordOnly, matchedBy: 'KEYWORD' }),
      ]),
    );
    const everyMatchedId = response.body.data.items.flatMap(
      (entry: { matches: { medicationId: string }[] }) =>
        entry.matches.map((match) => match.medicationId),
    );
    expect(everyMatchedId).not.toContain(medicationIds.amoxicillin);
    expect(response.body.data.unmatchedItems.map((item: { code: string }) => item.code)).toContain(
      `${ITEM_CODE_PREFIX}VITK_${RUN_SUFFIX}`,
    );
  });

  it('refuses an id the preview does not match with 422 and changes no row', async () => {
    const flagsBefore = await readFlags();

    const response = await asActor('post', '/api/v1/medications/midwife-formulary/apply').send({
      medicationIds: [medicationIds.iron, medicationIds.amoxicillin],
    });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('MIDWIFE_FORMULARY_MEDICATION_NOT_MATCHED');
    expect(await readFlags()).toEqual(flagsBefore);
  });

  it('refuses a keyword suggestion as well', async () => {
    const response = await asActor('post', '/api/v1/medications/midwife-formulary/apply').send({
      medicationIds: [medicationIds.keywordOnly],
    });

    expect(response.status).toBe(422);
  });

  it('flags exactly the chosen rows, lists them for the midwife picker and writes an audit row', async () => {
    const response = await asActor('post', '/api/v1/medications/midwife-formulary/apply').send({
      medicationIds: [medicationIds.iron],
    });

    expect(response.status).toBe(200);
    expect(response.body.data.items).toEqual([
      { medicationId: medicationIds.iron, outcome: 'FLAGGED' },
    ]);
    expect(await readFlags()).toEqual({
      [medicationIds.iron]: true,
      [medicationIds.otherMaker]: false,
      [medicationIds.keywordOnly]: false,
      [medicationIds.amoxicillin]: false,
    });
    const picker = await asActor(
      'get',
      `/api/v1/medications?midwifePrescribableOnly=true&search=${RUN_SUFFIX}&limit=100`,
    );
    expect(picker.status).toBe(200);
    expect(picker.body.data.map((medication: { id: string }) => medication.id)).toEqual([
      medicationIds.iron,
    ]);
    const auditRow = await prisma.auditLog.findFirst({
      where: { actorUserId: ACTOR_USER_ID, action: 'MEDICATION_MIDWIFE_FORMULARY_APPLIED' },
      orderBy: { occurredAt: 'desc' },
    });
    expect(auditRow?.metadata).toMatchObject({ flaggedMedicationIds: [medicationIds.iron] });
  });

  it('answers ALREADY_FLAGGED on a second apply and never unflags', async () => {
    const response = await asActor('post', '/api/v1/medications/midwife-formulary/apply').send({
      medicationIds: [medicationIds.iron, medicationIds.otherMaker],
    });

    expect(response.status).toBe(200);
    expect(response.body.data.items).toEqual([
      { medicationId: medicationIds.iron, outcome: 'ALREADY_FLAGGED' },
      { medicationId: medicationIds.otherMaker, outcome: 'FLAGGED' },
    ]);
    const flags = await readFlags();
    expect(flags[medicationIds.iron]).toBe(true);
    expect(flags[medicationIds.otherMaker]).toBe(true);
  });
});
