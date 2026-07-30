import { Logger } from '@nestjs/common';

import { AuditAction } from '../../generated/prisma/client';
import { AuditRepository } from './audit.repository';
import { AuditService } from './audit.service';

describe('AuditService', () => {
  const createAuditLogMock = jest.fn();
  const auditRepositoryMock = {
    createAuditLog: createAuditLogMock,
  } as unknown as AuditRepository;
  const service = new AuditService(auditRepositoryMock);

  const inputEvent = {
    action: AuditAction.USER_LOGIN,
    resource: 'auth',
    actorUserId: 'user-1',
    resourceId: 'user-1',
    metadata: { outcome: 'SUCCESS' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('delegates event persistence to the repository', async () => {
    createAuditLogMock.mockResolvedValue(undefined);
    await service.record(inputEvent);
    expect(createAuditLogMock).toHaveBeenCalledWith(inputEvent);
  });

  it('swallows persistence failures and logs them instead of throwing', async () => {
    const errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    createAuditLogMock.mockRejectedValue(new Error('db down PII-SENTINEL'));
    await expect(service.record(inputEvent)).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const actualLog = JSON.parse(
      (errorSpy.mock.calls[0]?.[0] ?? '{}') as string,
    ) as Record<string, unknown>;
    expect(actualLog).toMatchObject({
      event: 'audit_record_failed',
      action: 'USER_LOGIN',
      resource: 'auth',
    });
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('PII-SENTINEL');
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('db down');
  });
});
