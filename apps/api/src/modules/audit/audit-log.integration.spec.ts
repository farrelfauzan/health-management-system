import { INestApplication, VersioningType } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';

import { AppModule } from '../../app.module';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditAction } from '../../generated/prisma/client';
import { AuthRepository } from '../auth/repository/auth.repository';

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
