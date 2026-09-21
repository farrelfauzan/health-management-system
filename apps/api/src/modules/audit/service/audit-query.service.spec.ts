import { AuditActorNameRecord, AuditEventRecord, ListAuditEventsParams } from '@hms/shared-types';
import { BadRequestException } from '@nestjs/common';

import { AuditQueryRepository } from '../repository/audit-query.repository';
import { AuditQueryService } from './audit-query.service';

const PATIENT_ID = '11111111-1111-4111-8111-111111111111';
const ACTOR_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_ACTOR_ID = '44444444-4444-4444-8444-444444444444';
const DELETED_ACTOR_ID = '55555555-5555-4555-8555-555555555555';
const ACTOR_NAMES: AuditActorNameRecord[] = [
  { id: ACTOR_ID, name: 'Rani Putri' },
  { id: OTHER_ACTOR_ID, name: 'dr. Sari Wulandari' },
];

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
  let requestedActorIdBatches: string[][];

  function buildService(records: AuditEventRecord[], total = records.length): AuditQueryService {
    const repository = {
      listAuditEvents: async (params: ListAuditEventsParams) => {
        requestedParams = params;
        return { records, total };
      },
      listActorNames: async (actorUserIds: readonly string[]) => {
        requestedActorIdBatches.push([...actorUserIds]);
        return ACTOR_NAMES.filter((entry) => actorUserIds.includes(entry.id));
      },
    } as unknown as AuditQueryRepository;
    return new AuditQueryService(repository);
  }

  beforeEach(() => {
    requestedParams = undefined;
    requestedActorIdBatches = [];
  });

  it('maps a row to the response contract and serialises the timestamp', async () => {
    const actual = await buildService([buildRecord()]).listAuditEvents({ page: 1, limit: 50 });

    expect(actual.data).toEqual([
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        actorUserId: ACTOR_ID,
        actorName: 'Rani Putri',
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

  /**
   * P20-T07: the name is added beside the id, never in place of it, and one
   * page costs one lookup however many rows the same person produced.
   */
  it('names every actor on the page with a single batched lookup', async () => {
    const inputRecords = [
      buildRecord({ id: 'row-1', actorUserId: ACTOR_ID }),
      buildRecord({ id: 'row-2', actorUserId: OTHER_ACTOR_ID }),
      buildRecord({ id: 'row-3', actorUserId: ACTOR_ID }),
      buildRecord({ id: 'row-4', actorUserId: null }),
    ];

    const actual = await buildService(inputRecords).listAuditEvents({ page: 1, limit: 50 });

    expect(requestedActorIdBatches).toEqual([[ACTOR_ID, OTHER_ACTOR_ID]]);
    expect(actual.data.map((event) => [event.actorUserId, event.actorName])).toEqual([
      [ACTOR_ID, 'Rani Putri'],
      [OTHER_ACTOR_ID, 'dr. Sari Wulandari'],
      [ACTOR_ID, 'Rani Putri'],
      [undefined, undefined],
    ]);
  });

  /**
   * `actor_user_id` has no foreign key, so a hard-deleted account leaves an id
   * nothing resolves. The row still answers with the id; it just has no name.
   */
  it('keeps the id and omits the name when the account no longer exists', async () => {
    const inputRecord = buildRecord({ actorUserId: DELETED_ACTOR_ID });

    const actual = await buildService([inputRecord]).listAuditEvents({ page: 1, limit: 50 });

    expect(actual.data[0]?.actorUserId).toBe(DELETED_ACTOR_ID);
    expect(actual.data[0]).not.toHaveProperty('actorName');
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
