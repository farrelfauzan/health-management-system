import { INestApplication, VersioningType } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditAction } from '../../generated/prisma/client';
import { AuthRepository } from '../auth/repository/auth.repository';
import { LabSpecimenService } from '../laboratory/service/lab-specimen.service';

/**
 * SJ-4 against real Postgres. Three guarantees live here and nowhere else:
 * the append-only boundary is enforced by the database rather than by the
 * application asking nicely; the interceptor writes a row for a read as well
 * as a write; and the query endpoint that answers "who accessed this chart"
 * is itself on the record.
 *
 * Rows are namespaced by a marker and removed around each run — except audit
 * rows, which cannot be deleted. That is the point of the ticket, so the
 * fixtures are scoped to a patient created per run and the audit residue is
 * accepted: a handful of rows referencing a deleted patient is the correct
 * behaviour of an immutable log, not leakage.
 */
describe('Audit log against Postgres', () => {
  const TEST_MARKER = 'sj4-audit-spec';
  const JWT_SECRET = process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret';
  const READER_USER_ID = '5aaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const WRITER_USER_ID = '5bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const AUDITOR_USER_ID = '5ccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const LAB_TECHNICIAN_USER_ID = '5ddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const LAB_TECHNICIAN_NAME = 'Dewi Lestari, A.Md.AK';
  const LAB_ORDER_ID = '5eeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

  type SeededPermission = { action: string; resource: string; scope: 'ANY' | 'OWN' };

  const USER_FIXTURES: Record<string, { roleCode: string; permissions: SeededPermission[] }> = {
    [READER_USER_ID]: {
      roleCode: 'DOCTOR',
      permissions: [{ action: 'read', resource: 'Patient', scope: 'ANY' }],
    },
    [WRITER_USER_ID]: {
      roleCode: 'ADMIN',
      permissions: [
        { action: 'read', resource: 'Patient', scope: 'ANY' },
        { action: 'update', resource: 'Patient', scope: 'ANY' },
      ],
    },
    [AUDITOR_USER_ID]: {
      roleCode: 'ADMIN',
      permissions: [{ action: 'read', resource: 'AuditLog', scope: 'ANY' }],
    },
    [LAB_TECHNICIAN_USER_ID]: {
      roleCode: 'LAB_TECHNICIAN',
      permissions: [{ action: 'write', resource: 'LabSpecimen', scope: 'ANY' }],
    },
  };

  /**
   * The bench's collect route with the lab work stubbed out: what is under
   * test is the row the interceptor writes and how the query endpoint names
   * its actor, not accessioning (that is `lab-ordering.integration.spec.ts`).
   */
  const labSpecimenServiceStub = {
    collectLabSpecimens: jest.fn(async () => []),
  };

  const authRepositoryMock = {
    findUserByEmail: jest.fn(),
    findUserById: jest.fn(async (id: string) => {
      const fixture = USER_FIXTURES[id];
      if (!fixture) {
        return null;
      }
      return {
        id,
        isActive: true,
        roles: [
          {
            deletedAt: null,
            unassignedAt: null,
            role: {
              code: fixture.roleCode,
              permissions: fixture.permissions.map((permission) => ({ permission })),
            },
          },
        ],
      };
    }),
  };

  let app: INestApplication;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let patientId: string;

  async function signTokenFor(userId: string): Promise<string> {
    return jwtService.signAsync(
      { sub: userId, email: `${TEST_MARKER}-${userId}@example.test` },
      { secret: JWT_SECRET },
    );
  }

  async function createPatient(): Promise<string> {
    const patient = await prisma.patientProfile.create({
      data: {
        dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
        sex: 'FEMALE',
        address: 'Jl. Uji Coba No. 1',
        mrn: `${TEST_MARKER}-${Date.now()}`,
        fullName: `${TEST_MARKER} Patient`,
        phoneNumber: '081200000000',
      },
    });
    return patient.id;
  }

  async function findAuditRows(action: AuditAction) {
    return prisma.auditLog.findMany({
      where: { patientId, action },
      orderBy: { occurredAt: 'asc' },
    });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthRepository)
      .useValue(authRepositoryMock)
      .overrideProvider(LabSpecimenService)
      .useValue(labSpecimenServiceStub)
      .compile();

    app = moduleRef.createNestApplication();
    // Mirrors `main.ts` rather than the older specs' `api/v1` prefix, so the
    // paths asserted below are the paths a client actually calls.
    app.enableVersioning({ defaultVersion: '1', prefix: 'v', type: VersioningType.URI });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ZodValidationPipe());
    await app.init();

    prisma = moduleRef.get(PrismaService);
    jwtService = moduleRef.get(JwtService);
    patientId = await createPatient();
  });

  afterAll(async () => {
    await prisma.patientProfile.deleteMany({ where: { mrn: { startsWith: TEST_MARKER } } });
    await prisma.user.deleteMany({ where: { email: { startsWith: TEST_MARKER } } });
    await app.close();
  });

  describe('append-only enforcement', () => {
    let auditLogId: string;

    beforeAll(async () => {
      const created = await prisma.auditLog.create({
        data: {
          action: AuditAction.READ,
          resource: `${TEST_MARKER}-immutability`,
          patientId,
        },
      });
      auditLogId = created.id;
    });

    it('refuses an UPDATE on an audit row', async () => {
      await expect(
        prisma.$executeRaw`UPDATE "audit_logs" SET "resource" = 'tampered' WHERE "id" = ${auditLogId}::uuid`,
      ).rejects.toThrow(/append-only/i);
    });

    it('refuses a DELETE of an audit row', async () => {
      await expect(
        prisma.$executeRaw`DELETE FROM "audit_logs" WHERE "id" = ${auditLogId}::uuid`,
      ).rejects.toThrow(/append-only/i);
    });

    it('refuses a TRUNCATE of the whole table', async () => {
      await expect(prisma.$executeRawUnsafe('TRUNCATE TABLE "audit_logs"')).rejects.toThrow(
        /append-only/i,
      );
    });

    it('leaves the row exactly as written', async () => {
      const actual = await prisma.auditLog.findUnique({ where: { id: auditLogId } });

      expect(actual?.resource).toBe(`${TEST_MARKER}-immutability`);
    });
  });

  describe('interceptor coverage', () => {
    it('records a read with the actor, role, resource and source address', async () => {
      const accessToken = await signTokenFor(READER_USER_ID);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/patients/${patientId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      const rows = await findAuditRows(AuditAction.READ);
      const readRow = rows.find((row) => row.actorUserId === READER_USER_ID);
      expect(readRow).toMatchObject({
        action: AuditAction.READ,
        resource: 'patient',
        resourceId: patientId,
        patientId,
        actorUserId: READER_USER_ID,
        actorRole: 'DOCTOR',
      });
      expect(readRow?.ipAddress).toEqual(expect.any(String));
      expect(readRow?.requestId).toEqual(expect.any(String));
    });

    it('records a write under the second actor, distinguishable from the read', async () => {
      const accessToken = await signTokenFor(WRITER_USER_ID);

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/patients/${patientId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ fullName: `${TEST_MARKER} Renamed` });

      expect(response.status).toBe(200);
      const rows = await findAuditRows(AuditAction.UPDATE);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        action: AuditAction.UPDATE,
        resource: 'patient',
        resourceId: patientId,
        patientId,
        actorUserId: WRITER_USER_ID,
        actorRole: 'ADMIN',
      });
    });

    /**
     * The whole point of the denormalised `patient_id`: one query, both actors,
     * reads and writes together.
     */
    it('answers "who accessed this patient, when" in one query', async () => {
      const history = await prisma.auditLog.findMany({
        where: { patientId },
        orderBy: { occurredAt: 'asc' },
      });

      expect(history.map((row) => row.actorUserId)).toEqual(
        expect.arrayContaining([READER_USER_ID, WRITER_USER_ID]),
      );
    });
  });

  describe('query endpoint', () => {
    it('returns a patient access history to a permitted actor', async () => {
      const accessToken = await signTokenFor(AUDITOR_USER_ID);

      const response = await request(app.getHttpServer())
        .get('/api/v1/audit')
        .query({ patientId })
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBeGreaterThan(0);
      expect(
        response.body.data.every((row: { patientId: string }) => row.patientId === patientId),
      ).toBe(true);
    });

    it('refuses an actor without the audit.read grant', async () => {
      const accessToken = await signTokenFor(READER_USER_ID);

      const response = await request(app.getHttpServer())
        .get('/api/v1/audit')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(response.status).toBe(403);
    });

    /**
     * P20-T07's acceptance: given a lab technician records a specimen, when an
     * administrator reads the audit trail, the entry names the person and
     * still carries the id. The technician is a real account row — the name
     * comes from `users`, joined when the log is read, not from the token.
     */
    it('names the lab technician who recorded a specimen and keeps their id', async () => {
      await prisma.user.create({
        data: {
          id: LAB_TECHNICIAN_USER_ID,
          email: `${TEST_MARKER}-lab1@klinik.test`,
          fullName: LAB_TECHNICIAN_NAME,
          passwordHash: 'not-a-real-hash',
        },
      });
      const technicianToken = await signTokenFor(LAB_TECHNICIAN_USER_ID);
      const collectResponse = await request(app.getHttpServer())
        .post(`/api/v1/lab-orders/${LAB_ORDER_ID}/collect`)
        .set('Authorization', `Bearer ${technicianToken}`)
        .send({});
      expect(collectResponse.status).toBe(201);
      const auditorToken = await signTokenFor(AUDITOR_USER_ID);

      const response = await request(app.getHttpServer())
        .get('/api/v1/audit')
        .query({ actorUserId: LAB_TECHNICIAN_USER_ID, resource: 'lab-specimen' })
        .set('Authorization', `Bearer ${auditorToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data[0]).toMatchObject({
        actorUserId: LAB_TECHNICIAN_USER_ID,
        actorName: LAB_TECHNICIAN_NAME,
        actorRole: 'LAB_TECHNICIAN',
        action: AuditAction.CREATE,
        resource: 'lab-specimen',
        resourceId: LAB_ORDER_ID,
      });
    });

    /**
     * `actor_user_id` has no foreign key on purpose, so an actor can outlive
     * their account. The row must still answer with the id — just no name.
     */
    it('keeps the id of an actor whose account no longer exists', async () => {
      const auditorToken = await signTokenFor(AUDITOR_USER_ID);

      const response = await request(app.getHttpServer())
        .get('/api/v1/audit')
        .query({ actorUserId: READER_USER_ID, patientId })
        .set('Authorization', `Bearer ${auditorToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.data[0].actorUserId).toBe(READER_USER_ID);
      expect(response.body.data[0]).not.toHaveProperty('actorName');
    });

    /**
     * Whoever can survey every patient in the clinic is exactly the actor whose
     * own looking has to leave a trace.
     */
    it('audits the act of reading the audit log', async () => {
      const auditorRows = await prisma.auditLog.findMany({
        where: { resource: 'audit', actorUserId: AUDITOR_USER_ID, patientId },
      });

      expect(auditorRows.length).toBeGreaterThan(0);
      expect(auditorRows[0]).toMatchObject({
        action: AuditAction.READ,
        resource: 'audit',
        actorUserId: AUDITOR_USER_ID,
      });
    });
  });
});
