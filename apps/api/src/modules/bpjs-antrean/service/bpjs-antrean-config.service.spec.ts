import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { BpjsAntreanConfigRecord, UpsertBpjsAntreanConfigInput } from '@hms/shared-types';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { BpjsAntreanHttpClient } from '../../../common/bpjs-antrean/bpjs-antrean-http.client';
import { BpjsAntreanError } from '../../../common/bpjs-antrean/bpjs-antrean.error';
import { BpjsAntreanInboundConfig } from '../../../common/bpjs-antrean/bpjs-antrean-inbound.config';
import { BpjsAntreanConfigRepository } from '../repository/bpjs-antrean-config.repository';
import { BpjsAntreanConfigService } from './bpjs-antrean-config.service';

describe('BpjsAntreanConfigService', () => {
  const mockRepository = {
    findConfig: jest.fn(),
    createConfig: jest.fn(),
    updateConfig: jest.fn(),
    deleteConfig: jest.fn(),
    getConnection: jest.fn(),
    recordConnectionTest: jest.fn(),
  };
  const mockHttpClient = { sendRequest: jest.fn() };
  const mockAuditService = { record: jest.fn() };
  const inputActor = { sub: 'actor-1', email: 'admin@example.com' } as CurrentUser;
  const storedRecord: BpjsAntreanConfigRecord = {
    id: 'antrean-config-1',
    environment: 'DEVELOPMENT',
    consId: '20250042',
    kdProviderPpk: '01000101',
    secretKeyLast4: 'nKey',
    userKeyLast4: '4c5d',
    inboundUsername: 'bpjs-antrean-ws',
    hasInboundPassword: true,
    isActive: true,
    lastTestedAt: null,
    lastTestResult: null,
    createdAt: new Date('2026-08-14T09:00:00.000Z'),
    updatedAt: new Date('2026-08-14T09:00:00.000Z'),
  };
  const inputUpsert: UpsertBpjsAntreanConfigInput = {
    environment: 'DEVELOPMENT',
    consId: '20250042',
    kdProviderPpk: '01000101',
    secretKey: 'antrean-secret-key-value',
    userKey: 'antrean-user-key-value',
    inboundUsername: 'bpjs-antrean-ws',
    inboundPassword: 'inbound-password-value',
    isActive: true,
  };
  const mockConnection = {
    environment: 'DEVELOPMENT' as const,
    credentials: {
      consId: '20250042',
      secretKey: 'antrean-secret-key-value',
      userKey: 'antrean-user-key-value',
    },
  };

  // The inbound surface's deployment configuration. Stubbed rather than
  // constructed from env, because what this suite asserts about readiness is
  // that the service reports the *credential* half honestly — the allowlist
  // half has its own suite in `common/bpjs-antrean`.
  const mockInboundConfig = {
    buildReadiness: jest.fn((hasInboundCredentials: boolean) => ({
      isEnabled: false,
      hasSourceIpAllowlist: false,
      allowedSourceRangeCount: 0,
      hasInboundCredentials,
      tokenLifetimeSeconds: 3600,
      trustedProxyHopCount: 0,
    })),
  };

  function buildService(): BpjsAntreanConfigService {
    return new BpjsAntreanConfigService(
      mockRepository as unknown as BpjsAntreanConfigRepository,
      mockHttpClient as unknown as BpjsAntreanHttpClient,
      mockAuditService as unknown as AuditService,
      mockInboundConfig as unknown as BpjsAntreanInboundConfig,
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getConfig', () => {
    it('throws 404 when nothing is stored', async () => {
      mockRepository.findConfig.mockResolvedValue(null);

      await expect(buildService().getConfig()).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns the masked view and never a secret value', async () => {
      mockRepository.findConfig.mockResolvedValue(storedRecord);

      const actualView = await buildService().getConfig();

      expect(actualView).toEqual({
        id: 'antrean-config-1',
        environment: 'DEVELOPMENT',
        consId: '20250042',
        kdProviderPpk: '01000101',
        hasSecretKey: true,
        secretKeyLast4: 'nKey',
        hasUserKey: true,
        userKeyLast4: '4c5d',
        inboundUsername: 'bpjs-antrean-ws',
        hasInboundPassword: true,
        isActive: true,
        lastTestedAt: null,
        lastTestResult: null,
        createdAt: '2026-08-14T09:00:00.000Z',
        updatedAt: '2026-08-14T09:00:00.000Z',
      });
    });
  });

  describe('upsertConfig', () => {
    it('rejects a create that omits an outbound secret', async () => {
      mockRepository.findConfig.mockResolvedValue(null);
      const inputWithoutUserKey = { ...inputUpsert, userKey: undefined };

      await expect(
        buildService().upsertConfig(inputWithoutUserKey, inputActor),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockRepository.createConfig).not.toHaveBeenCalled();
    });

    it('accepts a create without the inbound pair, which BPJS only agrees at UAT', async () => {
      mockRepository.findConfig.mockResolvedValue(null);
      mockRepository.createConfig.mockResolvedValue({
        ...storedRecord,
        inboundUsername: null,
        hasInboundPassword: false,
      });
      const inputOutboundOnly: UpsertBpjsAntreanConfigInput = {
        environment: 'DEVELOPMENT',
        consId: '20250042',
        kdProviderPpk: '01000101',
        secretKey: 'antrean-secret-key-value',
        userKey: 'antrean-user-key-value',
        isActive: true,
      };

      const actualResult = await buildService().upsertConfig(inputOutboundOnly, inputActor);

      expect(actualResult.wasCreated).toBe(true);
      expect(actualResult.view.hasInboundPassword).toBe(false);
      expect(actualResult.view.inboundUsername).toBeNull();
    });

    it('creates and audits BPJS_ANTREAN_CONFIG_CREATED without secret values', async () => {
      mockRepository.findConfig.mockResolvedValue(null);
      mockRepository.createConfig.mockResolvedValue(storedRecord);

      const actualResult = await buildService().upsertConfig(inputUpsert, inputActor);

      expect(actualResult.wasCreated).toBe(true);
      expect(mockAuditService.record).toHaveBeenCalledWith({
        action: 'BPJS_ANTREAN_CONFIG_CREATED',
        resource: 'BpjsAntreanConfig',
        resourceId: 'antrean-config-1',
        actorUserId: 'actor-1',
        metadata: { environment: 'DEVELOPMENT' },
      });
      const auditPayload = JSON.stringify(mockAuditService.record.mock.calls);
      expect(auditPayload).not.toContain('antrean-secret-key-value');
      expect(auditPayload).not.toContain('inbound-password-value');
    });

    it('updates and audits the changed field names, counting a supplied secret as rotated', async () => {
      mockRepository.findConfig.mockResolvedValue(storedRecord);
      mockRepository.updateConfig.mockResolvedValue(storedRecord);
      const inputUpdate: UpsertBpjsAntreanConfigInput = {
        environment: 'PRODUCTION',
        consId: '20250042',
        kdProviderPpk: '01000101',
        inboundPassword: 'rotated-inbound-password',
        isActive: true,
      };

      const actualResult = await buildService().upsertConfig(inputUpdate, inputActor);

      expect(actualResult.wasCreated).toBe(false);
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'BPJS_ANTREAN_CONFIG_UPDATED',
          metadata: { changedFields: ['environment', 'inboundPassword'] },
        }),
      );
    });

    it('does not report an omitted optional field as changed', async () => {
      mockRepository.findConfig.mockResolvedValue(storedRecord);
      mockRepository.updateConfig.mockResolvedValue(storedRecord);
      const inputUnchanged: UpsertBpjsAntreanConfigInput = {
        environment: 'DEVELOPMENT',
        consId: '20250042',
        kdProviderPpk: '01000101',
        isActive: true,
      };

      await buildService().upsertConfig(inputUnchanged, inputActor);

      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: { changedFields: [] } }),
      );
    });

    it('maps a missing encryption key to 503', async () => {
      mockRepository.findConfig.mockResolvedValue(null);
      mockRepository.createConfig.mockRejectedValue(
        new BpjsAntreanError(
          'BPJS_ANTREAN_NOT_CONFIGURED',
          'BPJS_CREDENTIAL_ENCRYPTION_KEY is not set',
        ),
      );

      await expect(buildService().upsertConfig(inputUpsert, inputActor)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });

  describe('deleteConfig', () => {
    it('throws 404 when nothing is stored', async () => {
      mockRepository.findConfig.mockResolvedValue(null);

      await expect(buildService().deleteConfig(inputActor)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('deletes and audits BPJS_ANTREAN_CONFIG_DELETED', async () => {
      mockRepository.findConfig.mockResolvedValue(storedRecord);
      mockRepository.deleteConfig.mockResolvedValue(undefined);

      const actualResult = await buildService().deleteConfig(inputActor);

      expect(actualResult).toEqual({ id: 'antrean-config-1' });
      expect(mockRepository.deleteConfig).toHaveBeenCalledWith('antrean-config-1');
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'BPJS_ANTREAN_CONFIG_DELETED',
          resourceId: 'antrean-config-1',
        }),
      );
    });
  });

  describe('testConnection', () => {
    it('reads the HFIS poli reference, persists the outcome, and audits', async () => {
      mockRepository.findConfig.mockResolvedValue(storedRecord);
      mockRepository.getConnection.mockResolvedValue(mockConnection);
      mockHttpClient.sendRequest.mockResolvedValue({
        metaData: { code: '200', message: 'OK' },
        response: { list: [] },
      });
      mockRepository.recordConnectionTest.mockResolvedValue(storedRecord);

      const actualResult = await buildService().testConnection(inputActor);

      expect(actualResult.isSuccessful).toBe(true);
      expect(mockHttpClient.sendRequest).toHaveBeenCalledWith(mockConnection, {
        method: 'GET',
        path: 'ref/poli',
      });
      expect(mockRepository.recordConnectionTest).toHaveBeenCalledWith(
        'antrean-config-1',
        expect.objectContaining({ isSuccessful: true }),
      );
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'BPJS_ANTREAN_CONNECTION_TESTED',
          metadata: { isSuccessful: true },
        }),
      );
    });

    it('reports an upstream failure as an unsuccessful outcome, not an error', async () => {
      mockRepository.findConfig.mockResolvedValue(storedRecord);
      mockRepository.getConnection.mockResolvedValue(mockConnection);
      mockHttpClient.sendRequest.mockRejectedValue(
        new BpjsAntreanError(
          'BPJS_ANTREAN_UNAUTHORIZED',
          'BPJS Antrean rejected the request credentials (HTTP 401)',
        ),
      );
      mockRepository.recordConnectionTest.mockResolvedValue(storedRecord);

      const actualResult = await buildService().testConnection(inputActor);

      expect(actualResult.isSuccessful).toBe(false);
      expect(actualResult.message).toContain('BPJS_ANTREAN_UNAUTHORIZED');
      expect(mockRepository.recordConnectionTest).toHaveBeenCalledWith(
        'antrean-config-1',
        expect.objectContaining({ isSuccessful: false }),
      );
    });

    it('maps a missing encryption key to 503', async () => {
      mockRepository.findConfig.mockResolvedValue(storedRecord);
      mockRepository.getConnection.mockRejectedValue(
        new BpjsAntreanError(
          'BPJS_ANTREAN_NOT_CONFIGURED',
          'BPJS_CREDENTIAL_ENCRYPTION_KEY is not set',
        ),
      );

      await expect(buildService().testConnection(inputActor)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it('throws 404 when nothing is stored', async () => {
      mockRepository.findConfig.mockResolvedValue(null);

      await expect(buildService().testConnection(inputActor)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('getInboundReadiness', () => {
    it('reports no inbound credentials when nothing is stored at all', async () => {
      mockRepository.findConfig.mockResolvedValue(null);

      const actual = await buildService().getInboundReadiness();

      expect(actual.hasInboundCredentials).toBe(false);
      expect(actual.isEnabled).toBe(false);
    });

    it('reports no inbound credentials while only half the pair is stored', async () => {
      // The username is agreed at UAT before the password is exchanged, so a
      // half-configured row is a real state — and reporting it as ready would
      // send an operator hunting for a network fault that is not there.
      mockRepository.findConfig.mockResolvedValue({
        ...storedRecord,
        inboundUsername: 'bpjs-antrean-ws',
        hasInboundPassword: false,
      });

      const actual = await buildService().getInboundReadiness();

      expect(actual.hasInboundCredentials).toBe(false);
    });

    it('reports inbound credentials once both halves are stored', async () => {
      mockRepository.findConfig.mockResolvedValue({
        ...storedRecord,
        inboundUsername: 'bpjs-antrean-ws',
        hasInboundPassword: true,
      });

      const actual = await buildService().getInboundReadiness();

      expect(actual.hasInboundCredentials).toBe(true);
    });
  });
});
