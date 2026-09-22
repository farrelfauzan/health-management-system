import { ConflictException, NotFoundException } from '@nestjs/common';

import { AuditService } from '../../../common/audit/audit.service';
import { OwnAccountRepository } from '../repository/own-account.repository';
import { OwnAccountService } from './own-account.service';

/**
 * What a person may do to their own account (P20-T05, D-027).
 *
 * The interesting assertion here is a negative one: this service offers no way
 * to reach another account, and no way to change anything but the name and,
 * since P24-T15, the operator's own NIK (D-039). Both are enforced by what the
 * class does not have, so the tests pin the shape rather than a guard that
 * could be edited around.
 */
describe('OwnAccountService (P20-T05)', () => {
  const userId = '7f3a9c62-1d54-4c8b-9f2e-6b0a1d3c5e7f';
  const storedAccount = { id: userId, email: 'apoteker@klinik.id', fullName: null, nikLast4: null };
  /** Sixteen digits that are nobody's number. */
  const nikPlaceholder = '0000000000000000';

  const repositoryMock = {
    findAccountById: jest.fn(),
    renameAccount: jest.fn(),
    saveAccountNik: jest.fn(),
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
    (repositoryMock.saveAccountNik as jest.Mock).mockResolvedValue('SAVED');
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
    expect(service.saveOwnAccountNik).toHaveLength(2);
    expect(Object.getOwnPropertyNames(OwnAccountService.prototype).sort()).toEqual([
      'constructor',
      'getOwnAccount',
      'renameOwnAccount',
      'saveOwnAccountNik',
    ]);
  });

  describe('operator NIK (P24-T15, D-039)', () => {
    it('saves the NIK, audits the field change without the value, and answers the masked record', async () => {
      (repositoryMock.findAccountById as jest.Mock)
        .mockResolvedValueOnce(storedAccount)
        .mockResolvedValueOnce({ ...storedAccount, nikLast4: '0000' });

      const actualAccount = await service.saveOwnAccountNik(userId, nikPlaceholder);

      expect(repositoryMock.saveAccountNik).toHaveBeenCalledWith({ userId, nik: nikPlaceholder });
      expect(actualAccount).toEqual({ ...storedAccount, nikLast4: '0000' });
      expect(auditServiceMock.record).toHaveBeenCalledTimes(1);
      const auditInput = (auditServiceMock.record as jest.Mock).mock.calls[0]?.[0];
      expect(auditInput).toEqual({
        action: 'USER_UPDATED',
        resource: 'user',
        actorUserId: userId,
        resourceId: userId,
        metadata: { scope: 'OWN', changedFields: ['nik'] },
      });
      expect(JSON.stringify(auditInput)).not.toContain(nikPlaceholder);
    });

    it('refuses a NIK another account already holds with 409, and writes no audit row', async () => {
      (repositoryMock.saveAccountNik as jest.Mock).mockResolvedValue('DUPLICATE_NIK');

      await expect(service.saveOwnAccountNik(userId, nikPlaceholder)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(auditServiceMock.record).not.toHaveBeenCalled();
    });

    it('refuses an account that no longer exists before touching the NIK', async () => {
      (repositoryMock.findAccountById as jest.Mock).mockResolvedValue(null);

      await expect(service.saveOwnAccountNik(userId, nikPlaceholder)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(repositoryMock.saveAccountNik).not.toHaveBeenCalled();
    });
  });
});
