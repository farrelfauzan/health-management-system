import { INestApplication, VersioningType } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthRepository } from '../auth/repository/auth.repository';

/**
 * Poli management over HTTP against Postgres. The actor's permissions are
 * stubbed — CI never seeds, so `specialty.manage:any` has no row there — while
 * the catalog, the clinicians and the tariffs are real rows, because the
 * in-use refusal is a count only the database can answer. The audit rows the
 * routes write are append-only and are left behind, as in every other spec.
 */
describe('Specialty management against Postgres', () => {
  const TEST_MARKER = 'specialty-mgmt-spec';
  const ADMIN_USER_ID = '5eeeee40-eeee-4eee-8eee-eeeeeeeeee01';
  const DOCTOR_USER_ID = '5eeeee40-eeee-4eee-8eee-eeeeeeeeee02';

  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  const createdSpecialtyIds: string[] = [];

  const authRepositoryMock = {
    findUserById: jest.fn(),
    findUserByEmail: jest.fn(),
  };

  function actAs(
    userId: string,
    permissions: Array<{ action: string; resource: string; scope: 'ANY' | 'OWN' }>,
  ): Promise<string> {
    authRepositoryMock.findUserById.mockResolvedValue({
      id: userId,
      roles: [{ role: { code: 'SPEC', permissions: permissions.map((permission) => ({ permission })) } }],
    });
    return jwtService.signAsync(
      { sub: userId, email: `${TEST_MARKER}@example.test` },
      { secret: 'dev-access-secret' },
    );
  }

  function actAsAdmin(): Promise<string> {
    return actAs(ADMIN_USER_ID, [
      { action: 'read', resource: 'Doctor', scope: 'ANY' },
      { action: 'manage', resource: 'Specialty', scope: 'ANY' },
    ]);
  }

  async function createPoli(token: string, name: string): Promise<request.Response> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/specialties')
      .set('Authorization', `Bearer ${token}`)
      .send({ name });
    if (response.status === 201) {
      createdSpecialtyIds.push(response.body.data.id as string);
    }
    return response;
  }

  async function removeFixtures(): Promise<void> {
    await prisma.doctorProfile.deleteMany({ where: { licenseNumber: { startsWith: TEST_MARKER } } });
    await prisma.specialty.deleteMany({ where: { name: { startsWith: TEST_MARKER } } });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthRepository)
      .useValue(authRepositoryMock)
      .compile();
    app = moduleRef.createNestApplication();
    app.enableVersioning({ defaultVersion: '1', prefix: 'v', type: VersioningType.URI });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ZodValidationPipe());
    await app.init();
    prisma = moduleRef.get(PrismaService);
    jwtService = moduleRef.get(JwtService);
    await removeFixtures();
  });

  afterAll(async () => {
    await removeFixtures();
    await app.close();
  });

  it('adds a poli for an admin', async () => {
    const response = await createPoli(await actAsAdmin(), `${TEST_MARKER} Kebidanan`);

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ name: `${TEST_MARKER} Kebidanan`, isActive: true });
  });

  it('refuses a clinician without specialty.manage', async () => {
    const token = await actAs(DOCTOR_USER_ID, [{ action: 'read', resource: 'Doctor', scope: 'ANY' }]);

    const response = await createPoli(token, `${TEST_MARKER} Doctor Made`);

    expect(response.status).toBe(403);
  });

  it('refuses a duplicate name whatever its case', async () => {
    const response = await createPoli(await actAsAdmin(), `${TEST_MARKER} KEBIDANAN`);

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('SPECIALTY_NAME_TAKEN');
  });

  it('renames a poli', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/api/v1/specialties/${createdSpecialtyIds[0]}`)
      .set('Authorization', `Bearer ${await actAsAdmin()}`)
      .send({ name: `${TEST_MARKER} Poli Bidan` });

    expect(response.status).toBe(200);
    expect(response.body.data.name).toBe(`${TEST_MARKER} Poli Bidan`);
  });

  it('refuses to deactivate a poli an active clinician practises under', async () => {
    await prisma.doctorProfile.create({
      data: {
        licenseNumber: `${TEST_MARKER}-LIC-1`,
        fullName: 'Bidan Uji',
        specialtyId: createdSpecialtyIds[0]!,
        profession: 'MIDWIFE',
      },
    });

    const response = await request(app.getHttpServer())
      .patch(`/api/v1/specialties/${createdSpecialtyIds[0]}`)
      .set('Authorization', `Bearer ${await actAsAdmin()}`)
      .send({ isActive: false });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: {
        code: 'SPECIALTY_IN_USE',
        message: expect.any(String),
        details: { activeClinicianCount: 1, activeTariffCount: 0 },
      },
    });
  });

  it('deactivates and reactivates once nothing active depends on it', async () => {
    await prisma.doctorProfile.updateMany({
      where: { licenseNumber: `${TEST_MARKER}-LIC-1` },
      data: { isActive: false },
    });
    const token = await actAsAdmin();

    const deactivated = await request(app.getHttpServer())
      .patch(`/api/v1/specialties/${createdSpecialtyIds[0]}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isActive: false });
    const listed = await request(app.getHttpServer())
      .get('/api/v1/specialties?isActive=true')
      .set('Authorization', `Bearer ${token}`);
    const reactivated = await request(app.getHttpServer())
      .patch(`/api/v1/specialties/${createdSpecialtyIds[0]}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isActive: true });

    expect(deactivated.status).toBe(200);
    expect(deactivated.body.data.isActive).toBe(false);
    expect(
      (listed.body.data as Array<{ id: string }>).some((item) => item.id === createdSpecialtyIds[0]),
    ).toBe(false);
    expect(reactivated.body.data.isActive).toBe(true);
  });

  it('answers 400 for an empty update', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/api/v1/specialties/${createdSpecialtyIds[0]}`)
      .set('Authorization', `Bearer ${await actAsAdmin()}`)
      .send({});

    expect(response.status).toBe(400);
  });
});
