import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, of, throwError } from 'rxjs';

import { AuditContextService } from './audit-context.service';
import { AuditInterceptor } from './audit.interceptor';
import { AuditService } from './audit.service';
import { AuditedRequest, AuditedRouteOptions, RecordAuditEventInput } from './audit.types';
import { AUDITED_ROUTE_KEY } from './audited.decorator';
import { AuditAction } from '../../generated/prisma/client';

const PATIENT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_PATIENT_ID = '22222222-2222-4222-8222-222222222222';
const ACTOR_ID = '33333333-3333-4333-8333-333333333333';

describe('AuditInterceptor', () => {
  let recordedEvents: RecordAuditEventInput[];
  let auditService: AuditService;
  let auditContextService: AuditContextService;

  function buildRequest(overrides: Partial<AuditedRequest> = {}): AuditedRequest {
    return {
      method: 'GET',
      originalUrl: '/api/v1/patients/x',
      params: {},
      query: {},
      ip: '203.0.113.9',
      route: { path: '/api/v1/patients/:id' },
      requestId: 'req-1',
      user: { sub: ACTOR_ID },
      auditActorRoles: ['DOCTOR'],
      ...overrides,
    };
  }

  function buildContext(request: AuditedRequest): ExecutionContext {
    return {
      getType: () => 'http',
      getHandler: () => function handler() {},
      getClass: () => class Controller {},
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  }

  function buildInterceptor(options: AuditedRouteOptions | undefined): AuditInterceptor {
    const reflector = {
      getAllAndOverride: (key: string) => (key === AUDITED_ROUTE_KEY ? options : undefined),
    } as unknown as Reflector;
    return new AuditInterceptor(reflector, auditService, auditContextService);
  }

  async function runInterceptor(input: {
    options: AuditedRouteOptions | undefined;
    request: AuditedRequest;
    responseBody?: unknown;
  }): Promise<unknown> {
    const handler = { handle: () => of(input.responseBody ?? {}) } as CallHandler;
    return lastValueFrom(
      buildInterceptor(input.options).intercept(buildContext(input.request), handler),
    );
  }

  function onlyRecordedEvent(): RecordAuditEventInput {
    expect(recordedEvents).toHaveLength(1);
    const [event] = recordedEvents;
    if (!event) {
      throw new Error('no audit event was recorded');
    }
    return event;
  }

  beforeEach(() => {
    recordedEvents = [];
    auditService = {
      recordOrThrow: async (event: RecordAuditEventInput) => {
        recordedEvents.push(event);
      },
    } as unknown as AuditService;
    auditContextService = new AuditContextService();
  });

  it('writes nothing for a route without @Audited metadata', async () => {
    await runInterceptor({ options: undefined, request: buildRequest() });

    expect(recordedEvents).toEqual([]);
  });

  it('records the actor, role, address and correlation id of a read', async () => {
    const inputOptions: AuditedRouteOptions = {
      resource: 'patient',
      action: AuditAction.READ,
    };

    await runInterceptor({
      options: inputOptions,
      request: buildRequest({ params: { id: PATIENT_ID } }),
    });

    expect(onlyRecordedEvent()).toMatchObject({
      action: AuditAction.READ,
      resource: 'patient',
      actorUserId: ACTOR_ID,
      actorRole: 'DOCTOR',
      resourceId: PATIENT_ID,
      patientId: PATIENT_ID,
      ipAddress: '203.0.113.9',
      requestId: 'req-1',
    });
  });

  it('takes the resource id from the response when the URL has none', async () => {
    const inputOptions: AuditedRouteOptions = {
      resource: 'patient',
      action: AuditAction.CREATE,
    };

    await runInterceptor({
      options: inputOptions,
      request: buildRequest({ method: 'POST' }),
      responseBody: { data: { id: PATIENT_ID } },
    });

    expect(onlyRecordedEvent().resourceId).toBe(PATIENT_ID);
    expect(onlyRecordedEvent().patientId).toBe(PATIENT_ID);
  });

  it('records no resource id for a collection route', async () => {
    const inputOptions: AuditedRouteOptions = {
      resource: 'patient',
      action: AuditAction.READ,
      idParam: null,
    };

    await runInterceptor({
      options: inputOptions,
      request: buildRequest(),
      responseBody: { data: [{ id: PATIENT_ID }] },
    });

    expect(onlyRecordedEvent().resourceId).toBeNull();
  });

  it('resolves the patient from the response body of a non-patient resource', async () => {
    const inputOptions: AuditedRouteOptions = {
      resource: 'encounter',
      action: AuditAction.READ,
    };

    await runInterceptor({
      options: inputOptions,
      request: buildRequest({ params: { id: 'encounter-1' } }),
      responseBody: { data: { id: 'encounter-1', patientId: PATIENT_ID } },
    });

    expect(onlyRecordedEvent()).toMatchObject({
      resourceId: 'encounter-1',
      patientId: PATIENT_ID,
    });
  });

  /**
   * The column is `uuid`. A non-UUID reaching Prisma would abort the insert
   * and, because the write is awaited, turn a working endpoint into a 500 —
   * so a route param like `me` has to be dropped rather than passed through.
   */
  it('drops a patient candidate that is not a UUID', async () => {
    const inputOptions: AuditedRouteOptions = {
      resource: 'patient',
      action: AuditAction.READ,
      patientIdParam: 'id',
    };

    await runInterceptor({
      options: inputOptions,
      request: buildRequest({ params: { id: 'me' } }),
    });

    expect(onlyRecordedEvent().patientId).toBeNull();
  });

  it('falls back to the patient a service resolved while authorising', async () => {
    const inputOptions: AuditedRouteOptions = {
      resource: 'encounter-diagnosis',
      action: AuditAction.CREATE,
      idParam: 'encounterId',
    };

    await auditContextService.runWithContext(async () => {
      auditContextService.setPatientId(PATIENT_ID);
      await runInterceptor({
        options: inputOptions,
        request: buildRequest({ method: 'POST', params: { encounterId: 'encounter-1' } }),
        responseBody: { data: { id: 'diagnosis-1' } },
      });
    });

    expect(onlyRecordedEvent()).toMatchObject({
      resourceId: 'encounter-1',
      patientId: PATIENT_ID,
    });
  });

  it('prefers the request-declared patient over the context fallback', async () => {
    const inputOptions: AuditedRouteOptions = {
      resource: 'appointment',
      action: AuditAction.CREATE,
    };

    await auditContextService.runWithContext(async () => {
      auditContextService.setPatientId(OTHER_PATIENT_ID);
      await runInterceptor({
        options: inputOptions,
        request: buildRequest({ method: 'POST', body: { patientId: PATIENT_ID } }),
      });
    });

    expect(onlyRecordedEvent().patientId).toBe(PATIENT_ID);
  });

  /**
   * The route *pattern*, never the concrete URL: a query string can carry a
   * patient's name from a search box, and the audit table is read by people
   * who may hold no clinical grant.
   */
  it('records the route pattern and method, not the requested URL', async () => {
    const inputOptions: AuditedRouteOptions = {
      resource: 'patient',
      action: AuditAction.READ,
      idParam: null,
    };

    await runInterceptor({
      options: inputOptions,
      request: buildRequest({ originalUrl: '/api/v1/patients?search=Budi+Santoso' }),
    });

    expect(onlyRecordedEvent().metadata).toEqual({
      method: 'GET',
      route: '/api/v1/patients/:id',
    });
    expect(JSON.stringify(onlyRecordedEvent())).not.toContain('Budi');
  });

  it('fails the request when the audit row cannot be written', async () => {
    const expectedError = new Error('audit table unavailable');
    auditService = {
      recordOrThrow: async () => {
        throw expectedError;
      },
    } as unknown as AuditService;
    const inputOptions: AuditedRouteOptions = {
      resource: 'patient',
      action: AuditAction.READ,
    };

    await expect(
      runInterceptor({
        options: inputOptions,
        request: buildRequest({ params: { id: PATIENT_ID } }),
      }),
    ).rejects.toThrow('audit table unavailable');
  });

  it('writes no row when the handler itself fails', async () => {
    const inputOptions: AuditedRouteOptions = {
      resource: 'patient',
      action: AuditAction.READ,
    };
    const handler = { handle: () => throwError(() => new Error('not found')) } as CallHandler;

    await expect(
      lastValueFrom(
        buildInterceptor(inputOptions).intercept(buildContext(buildRequest()), handler),
      ),
    ).rejects.toThrow('not found');
    expect(recordedEvents).toEqual([]);
  });
});
