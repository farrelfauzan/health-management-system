import { AuditEventRecord, ListAuditEventsParams } from '@hms/shared-types';
import { BadRequestException } from '@nestjs/common';

import { AuditQueryRepository } from '../repository/audit-query.repository';
import { AuditQueryService } from './audit-query.service';

const PATIENT_ID = '11111111-1111-4111-8111-111111111111';
const ACTOR_ID = '33333333-3333-4333-8333-333333333333';

function buildRecord(overrides: Partial<AuditEventRecord> = {}): AuditEventRecord {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    actorUserId: ACTOR_ID,
    actorRole: 'DOCTOR',
    action: 'READ',
    resource: 'patient',
    resourceId: PATIENT_ID,
    patientId: PATIENT_ID,
    ipAddress: '203.0.113.9',
    requestId: 'req-1',
    metadata: { method: 'GET', route: '/api/v1/patients/:id' },
    occurredAt: new Date('2026-07-20T08:00:00.000Z'),
    ...overrides,
  };
}

describe('AuditQueryService', () => {
  let requestedParams: ListAuditEventsParams | undefined;

  function buildService(records: AuditEventRecord[], total = records.length): AuditQueryService {
    const repository = {
      listAuditEvents: async (params: ListAuditEventsParams) => {
        requestedParams = params;
        return { records, total };
      },
    } as unknown as AuditQueryRepository;
    return new AuditQueryService(repository);
  }

  beforeEach(() => {
    requestedParams = undefined;
  });

  it('maps a row to the response contract and serialises the timestamp', async () => {
    const actual = await buildService([buildRecord()]).listAuditEvents({ page: 1, limit: 50 });

    expect(actual.data).toEqual([
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        actorUserId: ACTOR_ID,
        actorRole: 'DOCTOR',
        action: 'READ',
        resource: 'patient',
        resourceId: PATIENT_ID,
        patientId: PATIENT_ID,
        ipAddress: '203.0.113.9',
        requestId: 'req-1',
        metadata: { method: 'GET', route: '/api/v1/patients/:id' },
        occurredAt: '2026-07-20T08:00:00.000Z',
      },
    ]);
  });

  it('omits null columns rather than emitting nulls', async () => {
    const inputRecord = buildRecord({
      actorUserId: null,
      actorRole: null,
      resourceId: null,
      patientId: null,
      ipAddress: null,
      requestId: null,
      metadata: null,
    });

    const actual = await buildService([inputRecord]).listAuditEvents({ page: 1, limit: 50 });

    expect(actual.data[0]).toEqual({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      action: 'READ',
      resource: 'patient',
      occurredAt: '2026-07-20T08:00:00.000Z',
    });
  });

  it('reports the page, limit and total the repository counted', async () => {
    const actual = await buildService([buildRecord()], 137).listAuditEvents({
      page: 3,
      limit: 25,
      patientId: PATIENT_ID,
    });

    expect(actual.meta).toEqual({ page: 3, limit: 25, total: 137 });
    expect(requestedParams).toMatchObject({ page: 3, limit: 25, patientId: PATIENT_ID });
  });

  /**
   * Without this the unknown value reaches Prisma's enum cast and comes back
   * as a 500, which tells the caller nothing about which filter was wrong.
   */
  it('rejects an unknown action before it reaches the database', async () => {
    const service = buildService([]);

    await expect(
      service.listAuditEvents({ page: 1, limit: 50, action: 'NOT_AN_ACTION' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(requestedParams).toBeUndefined();
  });

  it('accepts a known action', async () => {
    const service = buildService([buildRecord()]);

    await expect(
      service.listAuditEvents({ page: 1, limit: 50, action: 'READ' }),
    ).resolves.toMatchObject({ meta: { total: 1 } });
  });
});
