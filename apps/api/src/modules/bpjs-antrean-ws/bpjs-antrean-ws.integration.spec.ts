import { INestApplication, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ZodValidationPipe } from 'nestjs-zod';
import request from 'supertest';

import { BpjsProtocolCaptureService } from '../../common/bpjs-gateway/bpjs-protocol-capture.service';
import { BpjsAntreanConfigService } from '../bpjs-antrean/service/bpjs-antrean-config.service';
import { BpjsAntreanInboundCaptureInterceptor } from './controller/bpjs-antrean-inbound-capture.interceptor';
import { BpjsAntreanWsController } from './controller/bpjs-antrean-ws.controller';
import { BpjsAntreanInboundRateLimitGuard } from './guard/bpjs-antrean-inbound-rate-limit.guard';
import { BpjsAntreanInboundTokenGuard } from './guard/bpjs-antrean-inbound-token.guard';
import { BpjsAntreanSourceIpGuard } from './guard/bpjs-antrean-source-ip.guard';
import { BpjsAntreanServiceError } from './bpjs-antrean-service.error';
import { BpjsAntreanInboundAuditService } from './service/bpjs-antrean-inbound-audit.service';
import { BpjsAntreanInboundRateLimiter } from './service/bpjs-antrean-inbound-rate-limiter.service';
import { BpjsAntreanInboundTokenService } from './service/bpjs-antrean-inbound-token.service';
import { BpjsAntreanInboundConfig } from '../../common/bpjs-antrean/bpjs-antrean-inbound.config';
import { BpjsAntreanNewPatientService } from './service/bpjs-antrean-new-patient.service';
import { BpjsAntreanQueueService } from './service/bpjs-antrean-queue.service';
import { BpjsAntreanSystemActorService } from './service/bpjs-antrean-system-actor.service';

/**
 * End-to-end coverage of the inbound surface's **guard chain and response
 * envelope** (P14-T04). The domain services behind it are stubbed on purpose:
 * their behaviour has its own unit suites, and what needs proving here is the
 * property the rest of this module rests on — that a request which should not
 * reach a domain service never does, and that every outcome leaves in BPJS's
 * envelope rather than HMS's.
 *
 * What it cannot prove is that BPJS agrees with any of it. The token header,
 * the endpoint paths, the field names and the `metaData` casing are spike
 * questions Q4 and Q5. A green suite here is evidence of internal
 * consistency; the `P14-T02` fixtures, recorded from real UAT traffic, are
 * what would replace it as evidence about the protocol.
 */
describe('BPJS Antrean inbound web services integration', () => {
  const LOOPBACK_ALLOWLIST = '127.0.0.1, ::1, ::ffff:127.0.0.1';
  const VALID_CREDENTIALS = { username: 'bpjs-antrean-ws', password: 'inbound-password' };

  const queueServiceMock = {
    getStatus: jest.fn(),
    takeQueueNumber: jest.fn(),
    getRemaining: jest.fn(),
    cancel: jest.fn(),
  };
  const newPatientServiceMock = { registerMember: jest.fn() };
  const systemActorServiceMock = {
    resolveActor: jest.fn().mockResolvedValue({ sub: 'system-actor', email: 'bridge@hms.local' }),
  };
  const auditServiceMock = {
    recordAccepted: jest.fn().mockResolvedValue(undefined),
    recordRejected: jest.fn().mockResolvedValue(undefined),
  };
  const configServiceMock = {
    getInboundTokenMaterial: jest.fn().mockResolvedValue({
      signingKey: Buffer.alloc(32, 0x11),
      credentialFingerprint: 'fingerprint-abcd',
    }),
    verifyInboundCredentials: jest.fn(
      (params: { username: string; password: string }) =>
        Promise.resolve(
          params.username === VALID_CREDENTIALS.username &&
            params.password === VALID_CREDENTIALS.password,
        ),
    ),
  };

  async function bootstrap(environment: Record<string, string>): Promise<INestApplication> {
    const moduleRef = await Test.createTestingModule({
      controllers: [BpjsAntreanWsController],
      providers: [
        Reflector,
        // The UAT capture instrument (P14-T06) with no directory configured,
        // which is its production state: the interceptor must be inert and
        // must not change a single response in this suite.
        BpjsProtocolCaptureService,
        BpjsAntreanInboundCaptureInterceptor,
        BpjsAntreanInboundConfig,
        BpjsAntreanInboundRateLimiter,
        BpjsAntreanInboundTokenService,
        BpjsAntreanSourceIpGuard,
        BpjsAntreanInboundRateLimitGuard,
        BpjsAntreanInboundTokenGuard,
        { provide: ConfigService, useValue: { get: (key: string) => environment[key] } },
        { provide: BpjsAntreanConfigService, useValue: configServiceMock },
        { provide: BpjsAntreanQueueService, useValue: queueServiceMock },
        { provide: BpjsAntreanNewPatientService, useValue: newPatientServiceMock },
        { provide: BpjsAntreanSystemActorService, useValue: systemActorServiceMock },
        { provide: BpjsAntreanInboundAuditService, useValue: auditServiceMock },
      ],
    }).compile();
    const application = moduleRef.createNestApplication();
    application.enableVersioning({ defaultVersion: '1', prefix: 'v', type: VersioningType.URI });
    application.setGlobalPrefix('api');
    application.useGlobalPipes(new ZodValidationPipe());
    await application.init();
    return application;
  }

  async function obtainToken(application: INestApplication): Promise<string> {
    const response = await request(application.getHttpServer())
      .post('/api/v1/bpjs/antrean/ws/token')
      .send(VALID_CREDENTIALS);
    return response.body.response.token as string;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    systemActorServiceMock.resolveActor.mockResolvedValue({
      sub: 'system-actor',
      email: 'bridge@hms.local',
    });
    configServiceMock.getInboundTokenMaterial.mockResolvedValue({
      signingKey: Buffer.alloc(32, 0x11),
      credentialFingerprint: 'fingerprint-abcd',
    });
  });

  describe('with no source-IP allowlist configured', () => {
    let app: INestApplication;

    beforeAll(async () => {
      app = await bootstrap({});
    });

    afterAll(async () => {
      await app.close();
    });

    it.each([
      ['token', {}],
      ['status-antrean', {}],
      ['ambil-antrean', {}],
      ['pasien-baru', {}],
      ['batal-antrean', {}],
      ['sisa-antrean', {}],
    ])('refuses %s outright', async (path, body) => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/bpjs/antrean/ws/${path}`)
        .send(body);

      // This is the property that lets P14-T04 be merged while Q4/Q5/Q6 are
      // open: every deployment that has not been told BPJS's ranges has no
      // public write path at all.
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        metaData: { code: 503, message: 'Service unavailable' },
        response: null,
      });
      expect(queueServiceMock.takeQueueNumber).not.toHaveBeenCalled();
      expect(newPatientServiceMock.registerMember).not.toHaveBeenCalled();
    });

    it('audits the refusal so a failed UAT call is visible', async () => {
      await request(app.getHttpServer()).post('/api/v1/bpjs/antrean/ws/token').send({});

      expect(auditServiceMock.recordRejected).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'SURFACE_DISABLED', service: 'TOKEN' }),
      );
    });
  });

  describe('with an allowlist that excludes the caller', () => {
    let app: INestApplication;

    beforeAll(async () => {
      app = await bootstrap({ BPJS_ANTREAN_INBOUND_ALLOWED_IPS: '203.0.113.0/24' });
    });

    afterAll(async () => {
      await app.close();
    });

    it('refuses before the token is ever examined', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/bpjs/antrean/ws/status-antrean')
        .set('x-token', 'anything')
        .send({});

      expect(response.body.metaData).toEqual({ code: 403, message: 'Forbidden' });
      // Running the token check for arbitrary callers would make it a
      // credential oracle for anyone who can reach the host.
      expect(configServiceMock.getInboundTokenMaterial).not.toHaveBeenCalled();
    });

    it('ignores a forged X-Forwarded-For', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/bpjs/antrean/ws/status-antrean')
        .set('x-forwarded-for', '203.0.113.7')
        .send({});

      expect(response.body.metaData.code).toBe(403);
    });
  });

  describe('with the caller allowlisted', () => {
    let app: INestApplication;

    beforeAll(async () => {
      // Generous budgets on purpose: this block asserts what the guards let
      // through, and several of its cases obtain a token first. Throttling is
      // asserted deliberately in its own block against its own limit, so it
      // must not also depend on how many tests happen to live here.
      app = await bootstrap({
        BPJS_ANTREAN_INBOUND_ALLOWED_IPS: LOOPBACK_ALLOWLIST,
        BPJS_ANTREAN_INBOUND_TOKEN_RPM: '1000',
        BPJS_ANTREAN_INBOUND_READ_RPM: '1000',
        BPJS_ANTREAN_INBOUND_WRITE_RPM: '1000',
      });
    });

    afterAll(async () => {
      await app.close();
    });

    it('issues a token for the agreed credential pair', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/bpjs/antrean/ws/token')
        .send(VALID_CREDENTIALS);

      expect(response.body.metaData).toEqual({ code: 200, message: 'Ok' });
      expect(typeof response.body.response.token).toBe('string');
      expect(auditServiceMock.recordAccepted).toHaveBeenCalledWith(
        expect.objectContaining({ service: 'TOKEN' }),
      );
    });

    it('refuses a wrong credential pair with the same message as a missing one', async () => {
      const wrongPassword = await request(app.getHttpServer())
        .post('/api/v1/bpjs/antrean/ws/token')
        .send({ ...VALID_CREDENTIALS, password: 'wrong' });
      configServiceMock.getInboundTokenMaterial.mockResolvedValueOnce(null);
      const notConfigured = await request(app.getHttpServer())
        .post('/api/v1/bpjs/antrean/ws/token')
        .send(VALID_CREDENTIALS);

      // Indistinguishable from outside; the audit trail keeps the distinction.
      expect(wrongPassword.body).toEqual(notConfigured.body);
      expect(wrongPassword.body.metaData).toEqual({ code: 401, message: 'Unauthorized' });
    });

    it('refuses a protected service with no token', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/bpjs/antrean/ws/ambil-antrean')
        .send({});

      expect(response.body.metaData).toEqual({ code: 401, message: 'Unauthorized' });
      expect(queueServiceMock.takeQueueNumber).not.toHaveBeenCalled();
    });

    it('refuses a token that was tampered with', async () => {
      const issuedToken = await obtainToken(app);
      const [payloadPart] = issuedToken.split('.');

      const response = await request(app.getHttpServer())
        .post('/api/v1/bpjs/antrean/ws/sisa-antrean')
        .set('x-token', `${payloadPart}.AAAA`)
        .send({ kodebooking: 'code' });

      expect(response.body.metaData).toEqual({ code: 401, message: 'Unauthorized' });
      expect(queueServiceMock.getRemaining).not.toHaveBeenCalled();
    });

    it('serves ambil antrean with a valid token and audits the booking', async () => {
      queueServiceMock.takeQueueNumber.mockResolvedValue({
        nomorantrean: '001-5',
        angkaantrean: 5,
        kodebooking: '001-20260810-ABCDEF0123',
        norm: '00000042',
        namapoli: 'Umum',
        namadokter: 'dr. Andi',
        estimasidilayani: 1_775_000_000_000,
        sisakuotajkn: 15,
        kuotajkn: 20,
        keterangan: 'ok',
      });
      const issuedToken = await obtainToken(app);

      const response = await request(app.getHttpServer())
        .post('/api/v1/bpjs/antrean/ws/ambil-antrean')
        .set('x-token', issuedToken)
        .send({
          kodepoli: '001',
          kodedokter: 'D01',
          tanggalperiksa: '2026-08-10',
          jampraktek: '08:00-12:00',
          nomorkartu: '0001234567890',
          nik: '3201011234567890',
          nohp: '081200000000',
        });

      expect(response.body.metaData).toEqual({ code: 200, message: 'Ok' });
      expect(response.body.response.kodebooking).toBe('001-20260810-ABCDEF0123');
      expect(auditServiceMock.recordAccepted).toHaveBeenCalledWith(
        expect.objectContaining({
          service: 'AMBIL_ANTREAN',
          // Hashed inside the audit service; the raw card number never lands
          // in a table admins read.
          memberIdentifier: '0001234567890',
        }),
      );
    });

    it('rejects a malformed body without reaching the domain service', async () => {
      const issuedToken = await obtainToken(app);

      const response = await request(app.getHttpServer())
        .post('/api/v1/bpjs/antrean/ws/ambil-antrean')
        .set('x-token', issuedToken)
        .send({ kodepoli: '001' });

      expect(response.status).toBe(200);
      expect(response.body.metaData.code).toBe(400);
      expect(response.body.response).toBeNull();
      expect(queueServiceMock.takeQueueNumber).not.toHaveBeenCalled();
    });

    it('passes a business refusal through with its readable message', async () => {
      // The failure lands on a member holding a queue screen; §4.3 wants that
      // refusal legible rather than generic.
      queueServiceMock.getStatus.mockRejectedValue(
        new BpjsAntreanServiceError(404, 'Poli 999 tidak terdaftar di fasilitas ini'),
      );
      const issuedToken = await obtainToken(app);

      const response = await request(app.getHttpServer())
        .post('/api/v1/bpjs/antrean/ws/status-antrean')
        .set('x-token', issuedToken)
        .send({
          kodepoli: '999',
          kodedokter: 'D01',
          tanggalperiksa: '2026-08-10',
          jampraktek: '08:00-12:00',
        });

      expect(response.body.metaData).toEqual({
        code: 404,
        message: 'Poli 999 tidak terdaftar di fasilitas ini',
      });
    });

    it('replaces an unexpected failure with a generic message', async () => {
      // A stack trace or a Prisma error string on a public endpoint describes
      // the clinic's schema to anyone who can reach the host.
      queueServiceMock.getStatus.mockRejectedValue(
        new Error('relation "appointments" does not exist'),
      );
      const issuedToken = await obtainToken(app);

      const response = await request(app.getHttpServer())
        .post('/api/v1/bpjs/antrean/ws/status-antrean')
        .set('x-token', issuedToken)
        .send({
          kodepoli: '001',
          kodedokter: 'D01',
          tanggalperiksa: '2026-08-10',
          jampraktek: '08:00-12:00',
        });

      expect(response.body.metaData.code).toBe(500);
      expect(response.body.metaData.message).toBe(
        'Terjadi kesalahan pada sistem fasilitas kesehatan',
      );
      expect(JSON.stringify(response.body)).not.toContain('appointments');
    });

    it('answers every failure in BPJS’s envelope, never the HMS one', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/bpjs/antrean/ws/batal-antrean')
        .send({});

      expect(response.body).toHaveProperty('metaData');
      expect(response.body).toHaveProperty('response');
      expect(response.body).not.toHaveProperty('error');
      expect(response.body).not.toHaveProperty('data');
    });
  });

  describe('rate limiting', () => {
    let app: INestApplication;

    afterEach(async () => {
      await app.close();
    });

    it('throttles token issuance per source', async () => {
      app = await bootstrap({
        BPJS_ANTREAN_INBOUND_ALLOWED_IPS: LOOPBACK_ALLOWLIST,
        BPJS_ANTREAN_INBOUND_TOKEN_RPM: '2',
      });

      const responses = [];
      for (let attempt = 0; attempt < 3; attempt += 1) {
        responses.push(
          await request(app.getHttpServer())
            .post('/api/v1/bpjs/antrean/ws/token')
            .send({ ...VALID_CREDENTIALS, password: 'guess' }),
        );
      }

      expect(responses.map((response) => response.body.metaData.code)).toEqual([401, 401, 429]);
      expect(auditServiceMock.recordRejected).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'RATE_LIMITED' }),
      );
    });
  });
});
