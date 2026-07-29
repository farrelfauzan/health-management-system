import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

import { BpjsPcareConfigRecord, UpsertBpjsPcareConfigInput } from '@hms/shared-types';

import { AuditService } from '../../../common/audit/audit.service';
import { CurrentUser } from '../../../common/auth/current-user.type';
import { BpjsPcareHttpClient } from '../../../common/bpjs-pcare/bpjs-pcare-http.client';
import { BpjsPcareError } from '../../../common/bpjs-pcare/bpjs-pcare.error';
import { BpjsPcareConfigRepository } from '../repository/bpjs-pcare-config.repository';
import { BpjsPcareConfigService } from './bpjs-pcare-config.service';

describe('BpjsPcareConfigService', () => {
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
  const storedRecord: BpjsPcareConfigRecord = {
    id: 'config-1',
    environment: 'DEVELOPMENT',
    consId: '20250001',
    kdProviderPpk: '01000101',
    pcareUsername: 'klinik-demo',
    secretKeyLast4: 'tKey',
    userKeyLast4: '8f90',
    isActive: true,
    lastTestedAt: null,
    lastTestResult: null,
    createdAt: new Date('2026-08-01T09:00:00.000Z'),
    updatedAt: new Date('2026-08-01T09:00:00.000Z'),
  };
  const inputUpsert: UpsertBpjsPcareConfigInput = {
    environment: 'DEVELOPMENT',
    consId: '20250001',
    kdProviderPpk: '01000101',
    pcareUsername: 'klinik-demo',
    secretKey: 'secret-key-value',
    userKey: 'user-key-value',
    pcarePassword: 'password-value',
    isActive: true,
  };
  const mockConnection = {
    environment: 'DEVELOPMENT' as const,
    credentials: {
      consId: '20250001',
      secretKey: 'secret-key-value',
      userKey: 'user-key-value',
      pcareUsername: 'klinik-demo',
      pcarePassword: 'password-value',
    },
  };

  function buildService(): BpjsPcareConfigService {
    return new BpjsPcareConfigService(
      mockRepository as unknown as BpjsPcareConfigRepository,
      mockHttpClient as unknown as BpjsPcareHttpClient,
      mockAuditService as unknown as AuditService,
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
        id: 'config-1',
        environment: 'DEVELOPMENT',
        consId: '20250001',
        kdProviderPpk: '01000101',
        pcareUsername: 'klinik-demo',
        hasSecretKey: true,
        secretKeyLast4: 'tKey',
        hasUserKey: true,
        userKeyLast4: '8f90',
        hasPcarePassword: true,
        isActive: true,
        lastTestedAt: null,
        lastTestResult: null,
        createdAt: '2026-08-01T09:00:00.000Z',
        updatedAt: '2026-08-01T09:00:00.000Z',
      });
    });
  });

  describe('upsertConfig', () => {
    it('rejects a create that omits any secret', async () => {
      mockRepository.findConfig.mockResolvedValue(null);
      const inputWithoutPassword = { ...inputUpsert, pcarePassword: undefined };

      await expect(
        buildService().upsertConfig(inputWithoutPassword, inputActor),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(mockRepository.createConfig).not.toHaveBeenCalled();
    });

    it('creates and audits BPJS_CONFIG_CREATED without secret values', async () => {
      mockRepository.findConfig.mockResolvedValue(null);
      mockRepository.createConfig.mockResolvedValue(storedRecord);

      const actualResult = await buildService().upsertConfig(inputUpsert, inputActor);

      expect(actualResult.wasCreated).toBe(true);
      expect(mockAuditService.record).toHaveBeenCalledWith({
        action: 'BPJS_CONFIG_CREATED',
        resource: 'BpjsPcareConfig',
        resourceId: 'config-1',
        actorUserId: 'actor-1',
        metadata: { environment: 'DEVELOPMENT' },
      });
      const auditPayload = JSON.stringify(mockAuditService.record.mock.calls);
      expect(auditPayload).not.toContain('secret-key-value');
      expect(auditPayload).not.toContain('password-value');
    });

    it('updates and audits the changed field names, counting a supplied secret as rotated', async () => {
      mockRepository.findConfig.mockResolvedValue(storedRecord);
      mockRepository.updateConfig.mockResolvedValue(storedRecord);
      const inputUpdate: UpsertBpjsPcareConfigInput = {
        environment: 'PRODUCTION',
        consId: '20250001',
        kdProviderPpk: '01000101',
        pcareUsername: 'klinik-demo',
        pcarePassword: 'rotated-password',
        isActive: true,
      };

      const actualResult = await buildService().upsertConfig(inputUpdate, inputActor);

      expect(actualResult.wasCreated).toBe(false);
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'BPJS_CONFIG_UPDATED',
          metadata: { changedFields: ['environment', 'pcarePassword'] },
        }),
      );
    });

    it('maps a missing encryption key to 503', async () => {
      mockRepository.findConfig.mockResolvedValue(null);
      mockRepository.createConfig.mockRejectedValue(
        new BpjsPcareError(
          'BPJS_PCARE_NOT_CONFIGURED',
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

    it('deletes and audits BPJS_CONFIG_DELETED', async () => {
      mockRepository.findConfig.mockResolvedValue(storedRecord);
      mockRepository.deleteConfig.mockResolvedValue(undefined);

      const actualResult = await buildService().deleteConfig(inputActor);

      expect(actualResult).toEqual({ id: 'config-1' });
      expect(mockRepository.deleteConfig).toHaveBeenCalledWith('config-1');
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'BPJS_CONFIG_DELETED', resourceId: 'config-1' }),
      );
    });
  });

  describe('testConnection', () => {
    it('reports success, persists the outcome, and audits', async () => {
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
        path: 'poli/fktp/0/1',
      });
      expect(mockRepository.recordConnectionTest).toHaveBeenCalledWith(
        'config-1',
        expect.objectContaining({ isSuccessful: true }),
      );
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'BPJS_CONNECTION_TESTED',
          metadata: { isSuccessful: true },
        }),
      );
    });

    it('reports an upstream failure as an unsuccessful outcome, not an error', async () => {
      mockRepository.findConfig.mockResolvedValue(storedRecord);
      mockRepository.getConnection.mockResolvedValue(mockConnection);
      mockHttpClient.sendRequest.mockRejectedValue(
        new BpjsPcareError(
          'BPJS_PCARE_UNAUTHORIZED',
          'BPJS PCare rejected the request credentials (HTTP 401)',
        ),
      );
      mockRepository.recordConnectionTest.mockResolvedValue(storedRecord);

      const actualResult = await buildService().testConnection(inputActor);

      expect(actualResult.isSuccessful).toBe(false);
      expect(actualResult.message).toContain('BPJS_PCARE_UNAUTHORIZED');
      expect(mockRepository.recordConnectionTest).toHaveBeenCalledWith(
        'config-1',
        expect.objectContaining({ isSuccessful: false }),
      );
    });

    it('maps a missing encryption key to 503', async () => {
      mockRepository.findConfig.mockResolvedValue(storedRecord);
      mockRepository.getConnection.mockRejectedValue(
        new BpjsPcareError(
          'BPJS_PCARE_NOT_CONFIGURED',
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
});
