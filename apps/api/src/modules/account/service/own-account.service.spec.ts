import { NotFoundException } from '@nestjs/common';

import { AuditService } from '../../../common/audit/audit.service';
import { OwnAccountRepository } from '../repository/own-account.repository';
import { OwnAccountService } from './own-account.service';

/**
 * What a person may do to their own account (P20-T05, D-027).
 *
 * The interesting assertion here is a negative one: this service offers no way
 * to reach another account, and no way to change anything but the name. Both
 * are enforced by what the class does not have, so the tests pin the shape
 * rather than a guard that could be edited around.
 */
describe('OwnAccountService (P20-T05)', () => {
  const userId = '7f3a9c62-1d54-4c8b-9f2e-6b0a1d3c5e7f';
  const storedAccount = { id: userId, email: 'apoteker@klinik.id', fullName: null };

  const repositoryMock = {
    findAccountById: jest.fn(),
    renameAccount: jest.fn(),
  } as unknown as OwnAccountRepository;
  const auditServiceMock = { record: jest.fn() } as unknown as AuditService;
  const service = new OwnAccountService(repositoryMock, auditServiceMock);

  beforeEach(() => {
    jest.clearAllMocks();
    (repositoryMock.findAccountById as jest.Mock).mockResolvedValue(storedAccount);
    (repositoryMock.renameAccount as jest.Mock).mockImplementation(
      ({ userId: id, fullName }: { userId: string; fullName: string }) =>
        Promise.resolve({ ...storedAccount, id, fullName }),
    );
  });

  it('reads back an account that has never been named, without calling it an error', async () => {
    const actualAccount = await service.getOwnAccount(userId);

    expect(actualAccount).toEqual(storedAccount);
  });

  it('refuses an account that no longer exists rather than renaming nothing', async () => {
    (repositoryMock.findAccountById as jest.Mock).mockResolvedValue(null);

    await expect(service.renameOwnAccount(userId, 'Rani Putri')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repositoryMock.renameAccount).not.toHaveBeenCalled();
  });

  it('writes the name against the caller, and audits it as an own-scope change', async () => {
    const actualAccount = await service.renameOwnAccount(userId, 'Rani Putri, S.Farm., Apt.');

    expect(repositoryMock.renameAccount).toHaveBeenCalledWith({
      userId,
      fullName: 'Rani Putri, S.Farm., Apt.',
    });
    expect(actualAccount.fullName).toBe('Rani Putri, S.Farm., Apt.');
    expect(auditServiceMock.record).toHaveBeenCalledWith({
      action: 'USER_UPDATED',
      resource: 'user',
      actorUserId: userId,
      resourceId: userId,
      metadata: { scope: 'OWN', changedFields: ['fullName'] },
    });
  });

  it('takes the account to rename from the caller, never from an argument', () => {
    // A method that cannot be passed another account's id cannot rename one.
    expect(service.renameOwnAccount).toHaveLength(2);
    expect(Object.getOwnPropertyNames(OwnAccountService.prototype).sort()).toEqual([
      'constructor',
      'getOwnAccount',
      'renameOwnAccount',
    ]);
  });
});
