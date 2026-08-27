import {
  ConflictException,
  ForbiddenException,
  GoneException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuditService } from '../../../common/audit/audit.service';
import { BreachedPasswordCheckerService } from '../../../common/crypto/breached-password-checker.service';
import { PasswordHasherService } from '../../../common/crypto/password-hasher.service';
import { MailService } from '../../../common/mail/mail.service';
import { AdminManagementRepository } from '../../admin-management/repository/admin-management.repository';
import { AuthRepository } from '../../auth/repository/auth.repository';
import { UserInvitationRepository } from '../repository/user-invitation.repository';
import { UserInvitationService } from './user-invitation.service';

const CURRENT_USER_ID = '4e8580c4-9e80-44ff-9f8f-8c8f9d8d90f8';
const INVITATION_ID = '0f9a4c31-2b7e-4d58-9c16-8ea3f5d0b742';

function buildInvitationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: INVITATION_ID,
    email: 'siti@example.com',
    tokenHash: 'unused-in-these-tests',
    roleCodes: ['NURSE'],
    invitedById: CURRENT_USER_ID,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    consumedAt: null,
    revokedAt: null,
    createdAt: new Date('2026-08-26T04:00:00.000Z'),
    updatedAt: new Date('2026-08-26T04:00:00.000Z'),
    invitedBy: { email: 'admin@klinik.example' },
    ...overrides,
  };
}

describe('UserInvitationService', () => {
  let userInvitationRepositoryMock: jest.Mocked<
    Pick<
      UserInvitationRepository,
      | 'createInvitation'
      | 'findInvitationById'
      | 'findInvitationByTokenHash'
      | 'findLiveInvitationByEmail'
      | 'findRoleNamesByCodes'
      | 'listInvitations'
      | 'revokeInvitation'
      | 'replaceInvitation'
      | 'acceptInvitation'
    >
  >;
  let adminManagementRepositoryMock: {
    findActiveUserByEmail: jest.Mock;
    findActiveRolesByCodes: jest.Mock;
  };
  let authRepositoryMock: { findUserById: jest.Mock };
  let auditServiceMock: { record: jest.Mock };
  let mailServiceMock: { sendMail: jest.Mock };
  let service: UserInvitationService;

  function buildService(): UserInvitationService {
    return new UserInvitationService(
      userInvitationRepositoryMock as unknown as UserInvitationRepository,
      adminManagementRepositoryMock as unknown as AdminManagementRepository,
      authRepositoryMock as unknown as AuthRepository,
      auditServiceMock as unknown as AuditService,
      new PasswordHasherService(),
      new BreachedPasswordCheckerService(new ConfigService({})),
      mailServiceMock as unknown as MailService,
      new ConfigService({ WEB_APP_BASE_URL: 'https://klinik.example' }),
    );
  }

  beforeEach(() => {
    userInvitationRepositoryMock = {
      createInvitation: jest.fn().mockResolvedValue(buildInvitationRow()),
      findInvitationById: jest.fn().mockResolvedValue(buildInvitationRow()),
      findInvitationByTokenHash: jest.fn().mockResolvedValue(buildInvitationRow()),
      findLiveInvitationByEmail: jest.fn().mockResolvedValue(null),
      findRoleNamesByCodes: jest.fn().mockResolvedValue(new Map([['NURSE', 'Perawat']])),
      listInvitations: jest.fn(),
      revokeInvitation: jest.fn(),
      replaceInvitation: jest.fn(),
      acceptInvitation: jest.fn(),
    } as never;
    adminManagementRepositoryMock = {
      findActiveUserByEmail: jest.fn().mockResolvedValue(null),
      findActiveRolesByCodes: jest
        .fn()
        .mockResolvedValue([{ id: 'role-1', code: 'NURSE', name: 'Perawat' }]),
    };
    authRepositoryMock = { findUserById: jest.fn() };
    auditServiceMock = { record: jest.fn().mockResolvedValue(undefined) };
    mailServiceMock = {
      sendMail: jest.fn().mockResolvedValue({ accepted: true, messageId: 'id' }),
    };
    service = buildService();
  });

  describe('createInvitation', () => {
    it('records the invitation, audits it, and sends exactly one email', async () => {
      const actualInvitation = await service.createInvitation(
        { email: 'siti@example.com', roleCodes: ['NURSE'] },
        CURRENT_USER_ID,
      );

      expect(actualInvitation.status).toBe('PENDING');
      expect(actualInvitation.roles).toEqual([{ code: 'NURSE', name: 'Perawat' }]);
      expect(mailServiceMock.sendMail).toHaveBeenCalledTimes(1);
      expect(auditServiceMock.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'USER_INVITED' }),
      );
    });

    // The whole point of the ticket: the admin supplies an address, never a
    // password, and the token never comes back over the API.
    it('never returns the token to the caller', async () => {
      const actualInvitation = await service.createInvitation(
        { email: 'siti@example.com', roleCodes: ['NURSE'] },
        CURRENT_USER_ID,
      );

      expect(JSON.stringify(actualInvitation)).not.toContain('token');
    });

    it('emails a link built from the configured web origin', async () => {
      await service.createInvitation(
        { email: 'siti@example.com', roleCodes: ['NURSE'] },
        CURRENT_USER_ID,
      );

      const sentMail = mailServiceMock.sendMail.mock.calls[0][0];
      expect(sentMail.text).toContain('https://klinik.example/invite/');
    });

    it('refuses an address that already has an account', async () => {
      adminManagementRepositoryMock.findActiveUserByEmail.mockResolvedValue({ id: 'existing' });

      await expect(
        service.createInvitation(
          { email: 'siti@example.com', roleCodes: ['NURSE'] },
          CURRENT_USER_ID,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    // Two live links for one mailbox means two ways in, and revoking one
    // leaves the other working.
    it('refuses a second invitation while one is still live', async () => {
      userInvitationRepositoryMock.findLiveInvitationByEmail.mockResolvedValue(
        buildInvitationRow() as never,
      );

      await expect(
        service.createInvitation(
          { email: 'siti@example.com', roleCodes: ['NURSE'] },
          CURRENT_USER_ID,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('refuses to let a non-SUPER_ADMIN invite a SUPER_ADMIN', async () => {
      authRepositoryMock.findUserById.mockResolvedValue({ roles: [{ role: { code: 'ADMIN' } }] });

      await expect(
        service.createInvitation(
          { email: 'siti@example.com', roleCodes: ['SUPER_ADMIN'] },
          CURRENT_USER_ID,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(userInvitationRepositoryMock.createInvitation).not.toHaveBeenCalled();
    });

    // The row is committed before the send. Failing the caller would leave an
    // administrator with a success-shaped failure and no row to resend from.
    it('still returns the invitation when the provider refuses the message', async () => {
      mailServiceMock.sendMail.mockResolvedValue({ accepted: false, messageId: undefined });

      const actualInvitation = await service.createInvitation(
        { email: 'siti@example.com', roleCodes: ['NURSE'] },
        CURRENT_USER_ID,
      );

      expect(actualInvitation.id).toBe(INVITATION_ID);
    });
  });

  describe('resendInvitation', () => {
    it('replaces the row, sends a fresh link, and audits the replacement', async () => {
      const replacement = buildInvitationRow({ id: 'replacement-id' });
      userInvitationRepositoryMock.replaceInvitation.mockResolvedValue(replacement as never);

      const actualInvitation = await service.resendInvitation(INVITATION_ID, CURRENT_USER_ID);

      expect(actualInvitation.id).toBe('replacement-id');
      expect(mailServiceMock.sendMail).toHaveBeenCalledTimes(1);
      expect(auditServiceMock.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'USER_INVITED',
          metadata: expect.objectContaining({ replacedInvitationId: INVITATION_ID }),
        }),
      );
    });

    it('refuses to resend an invitation that was already accepted', async () => {
      userInvitationRepositoryMock.findInvitationById.mockResolvedValue(
        buildInvitationRow({ consumedAt: new Date() }) as never,
      );

      await expect(service.resendInvitation(INVITATION_ID, CURRENT_USER_ID)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('404s on an unknown invitation', async () => {
      userInvitationRepositoryMock.findInvitationById.mockResolvedValue(null as never);

      await expect(service.resendInvitation(INVITATION_ID, CURRENT_USER_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('revokeInvitation', () => {
    it('marks the invitation revoked and audits it', async () => {
      userInvitationRepositoryMock.revokeInvitation.mockResolvedValue(
        buildInvitationRow({ revokedAt: new Date() }) as never,
      );

      const actualInvitation = await service.revokeInvitation(INVITATION_ID, CURRENT_USER_ID);

      expect(actualInvitation.status).toBe('REVOKED');
      expect(auditServiceMock.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'USER_INVITE_REVOKED' }),
      );
    });

    // Revoking twice is a double-click, not an error, and there is nothing new
    // to audit the second time.
    it('is idempotent on an already-revoked invitation', async () => {
      userInvitationRepositoryMock.findInvitationById.mockResolvedValue(
        buildInvitationRow({ revokedAt: new Date() }) as never,
      );

      const actualInvitation = await service.revokeInvitation(INVITATION_ID, CURRENT_USER_ID);

      expect(actualInvitation.status).toBe('REVOKED');
      expect(userInvitationRepositoryMock.revokeInvitation).not.toHaveBeenCalled();
      expect(auditServiceMock.record).not.toHaveBeenCalled();
    });
  });

  describe('acceptInvitation', () => {
    it('creates the account, consumes the invitation, and audits both facts', async () => {
      userInvitationRepositoryMock.acceptInvitation.mockResolvedValue({
        id: 'new-user-id',
        email: 'siti@example.com',
      } as never);

      const actualResult = await service.acceptInvitation('raw-token', {
        password: 'a-perfectly-good-passphrase',
      });

      expect(actualResult).toEqual({ email: 'siti@example.com' });
      expect(auditServiceMock.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'USER_INVITE_ACCEPTED' }),
      );
      expect(auditServiceMock.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'USER_CREATED' }),
      );
    });

    // Four distinct outcomes rather than one flat "invalid link": reaching this
    // route already requires guessing 256 bits, so telling them apart leaks
    // nothing and is the difference between an invitee who knows what to do and
    // one who does not.
    it.each([
      ['an unknown token', null, NotFoundException],
      [
        'an already-consumed invitation',
        buildInvitationRow({ consumedAt: new Date() }),
        ConflictException,
      ],
      ['a withdrawn invitation', buildInvitationRow({ revokedAt: new Date() }), GoneException],
      [
        'a lapsed invitation',
        buildInvitationRow({ expiresAt: new Date(Date.now() - 1000) }),
        GoneException,
      ],
    ])('refuses %s', async (_label, row, expectedError) => {
      userInvitationRepositoryMock.findInvitationByTokenHash.mockResolvedValue(row as never);

      await expect(
        service.acceptInvitation('raw-token', { password: 'a-perfectly-good-passphrase' }),
      ).rejects.toBeInstanceOf(expectedError);
      expect(userInvitationRepositoryMock.acceptInvitation).not.toHaveBeenCalled();
    });

    it('refuses a breached password', async () => {
      await expect(
        service.acceptInvitation('raw-token', { password: 'password123' }),
      ).rejects.toThrow(/breach lists/);
    });

    // A role deleted between invite and accept must fail loudly rather than
    // quietly creating an account with fewer permissions than intended.
    it('refuses when a role code on the invitation no longer exists', async () => {
      adminManagementRepositoryMock.findActiveRolesByCodes.mockResolvedValue([]);

      await expect(
        service.acceptInvitation('raw-token', { password: 'a-perfectly-good-passphrase' }),
      ).rejects.toThrow(/no longer exist/);
    });
  });

  describe('previewInvitation', () => {
    it('returns the address and expiry, and nothing else', async () => {
      const actualPreview = await service.previewInvitation('raw-token');

      expect(Object.keys(actualPreview).sort()).toEqual(['email', 'expiresAt']);
    });
  });
});
