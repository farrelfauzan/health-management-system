import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuditService } from '../../../common/audit/audit.service';
import { MailService } from '../../../common/mail/mail.service';
import { RequestContext } from '../../../common/observability/observability.types';
import { AuthRepository } from '../../auth/repository/auth.repository';
import { VaultOffboardingService } from '../../document-management/service/vault-offboarding.service';
import { AdminManagementRepository } from '../repository/admin-management.repository';
import { UserOffboardingService } from './user-offboarding.service';

describe('UserOffboardingService', () => {
  const ORIGIN: RequestContext = {
    ipAddress: '203.0.113.9',
    requestId: 'req-1',
    userAgent: 'jest',
  };
  const SUPER_ADMIN = { sub: 'super-admin-1', email: 'super@hms.test' };
  const DOCTOR_ID = 'doctor-1';
  /** 17:00 in Jakarta on the 4th, so the window closes on 4 October. */
  const OFFBOARDED_AT = new Date('2026-09-04T10:00:00.000Z');

  const adminManagementRepositoryMock = {
    findUserForOffboarding: jest.fn(),
    markOffboarded: jest.fn(),
    clearOffboarded: jest.fn(),
    listOffboardedUsers: jest.fn(),
    claimOffboardingNotice: jest.fn(),
  };
  const authRepositoryMock = { revokeAllUserRefreshTokens: jest.fn() };
  const auditServiceMock = { record: jest.fn() };
  const mailServiceMock = { sendMail: jest.fn() };
  const vaultOffboardingServiceMock = {
    summariseVault: jest.fn(),
    purgeUnsharedDocuments: jest.fn(),
  };

  function buildDoctor(overrides: Record<string, unknown> = {}) {
    return {
      id: DOCTOR_ID,
      email: 'dr.maya@hms.test',
      isActive: true,
      isSystem: false,
      offboardedAt: null,
      roles: [{ role: { code: 'DOCTOR' } }],
      ...overrides,
    };
  }

  function buildService(): UserOffboardingService {
    return new UserOffboardingService(
      adminManagementRepositoryMock as unknown as AdminManagementRepository,
      authRepositoryMock as unknown as AuthRepository,
      auditServiceMock as unknown as AuditService,
      mailServiceMock as unknown as MailService,
      vaultOffboardingServiceMock as unknown as VaultOffboardingService,
      new ConfigService({ CLINIC_TIMEZONE: 'Asia/Jakarta', WEB_APP_BASE_URL: 'https://hms.test/' }),
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(OFFBOARDED_AT);
    adminManagementRepositoryMock.findUserForOffboarding.mockResolvedValue(buildDoctor());
    adminManagementRepositoryMock.markOffboarded.mockResolvedValue(undefined);
    adminManagementRepositoryMock.clearOffboarded.mockResolvedValue(undefined);
    adminManagementRepositoryMock.listOffboardedUsers.mockResolvedValue([]);
    adminManagementRepositoryMock.claimOffboardingNotice.mockResolvedValue(true);
    authRepositoryMock.revokeAllUserRefreshTokens.mockResolvedValue(2);
    auditServiceMock.record.mockResolvedValue(undefined);
    mailServiceMock.sendMail.mockResolvedValue({ accepted: true, messageId: 'm-1' });
    vaultOffboardingServiceMock.summariseVault.mockResolvedValue({
      sharedDocumentCount: 2,
      unsharedDocumentCount: 3,
    });
    vaultOffboardingServiceMock.purgeUnsharedDocuments.mockResolvedValue(3);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('preview', () => {
    it('reports what survives, what leaves, and the day it leaves', async () => {
      const actual = await buildService().previewOffboarding(DOCTOR_ID);

      expect(actual).toEqual({
        userId: DOCTOR_ID,
        email: 'dr.maya@hms.test',
        sharedDocumentCount: 2,
        unsharedDocumentCount: 3,
        deletionDate: '2026-10-04',
        offboardedAt: null,
      });
    });

    it('answers 404 for a service account, like a missing row', async () => {
      adminManagementRepositoryMock.findUserForOffboarding.mockResolvedValue(
        buildDoctor({ isSystem: true }),
      );

      await expect(buildService().previewOffboarding(DOCTOR_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('offboard', () => {
    it('stamps the window, revokes every session, audits both, and emails the person', async () => {
      const actual = await buildService().offboardUser(DOCTOR_ID, SUPER_ADMIN, ORIGIN);

      expect(adminManagementRepositoryMock.markOffboarded).toHaveBeenCalledWith(
        DOCTOR_ID,
        OFFBOARDED_AT,
      );
      // FR-E3-25: the reduced set must take effect on the next request, and
      // the web renders from a packed hint — so the sessions go, now.
      expect(authRepositoryMock.revokeAllUserRefreshTokens).toHaveBeenCalledWith(DOCTOR_ID);
      const auditedActions = auditServiceMock.record.mock.calls.map(
        ([input]: [{ action: string; actorUserId: string; resourceId: string }]) =>
          `${input.action}:${input.actorUserId}:${input.resourceId}`,
      );
      expect(auditedActions).toEqual([
        `SESSION_REVOKED_ALL:${SUPER_ADMIN.sub}:${DOCTOR_ID}`,
        `USER_OFFBOARDED:${SUPER_ADMIN.sub}:${DOCTOR_ID}`,
      ]);
      expect(auditServiceMock.record.mock.calls[1]![0].metadata).toEqual({
        sharedDocumentCount: 2,
        unsharedDocumentCount: 3,
        deletionDate: '2026-10-04',
      });
      expect(actual.offboardedAt).toBe(OFFBOARDED_AT.toISOString());
      expect(actual.deletionDate).toBe('2026-10-04');
    });

    it('sends the day-zero email naming the date, the counts, and the doctor vault', async () => {
      await buildService().offboardUser(DOCTOR_ID, SUPER_ADMIN, ORIGIN);

      const [sent] = mailServiceMock.sendMail.mock.calls[0] as [
        { to: string; subject: string; text: string },
      ];
      expect(sent.to).toBe('dr.maya@hms.test');
      expect(sent.subject).toContain('4 Oktober 2026');
      expect(sent.text).toContain('3 dokumen yang tidak Anda bagikan');
      // A doctor lands in the doctor shell; the base URL's trailing slash is
      // normalised away rather than doubled.
      expect(sent.text).toContain('https://hms.test/doctor/vault');
    });

    it('links an administrator to the admin vault', async () => {
      adminManagementRepositoryMock.findUserForOffboarding.mockResolvedValue(
        buildDoctor({ roles: [{ role: { code: 'ADMIN' } }] }),
      );

      await buildService().offboardUser(DOCTOR_ID, SUPER_ADMIN, ORIGIN);

      expect((mailServiceMock.sendMail.mock.calls[0] as [{ text: string }])[0].text).toContain(
        'https://hms.test/admin/vault',
      );
    });

    it('does not fail the action when the email cannot be sent', async () => {
      mailServiceMock.sendMail.mockRejectedValue(new Error('smtp timeout'));

      await expect(
        buildService().offboardUser(DOCTOR_ID, SUPER_ADMIN, ORIGIN),
      ).resolves.toMatchObject({ offboardedAt: OFFBOARDED_AT.toISOString() });
      // The state change is the promise; a super admin must not see a
      // success-shaped failure over a person who is half offboarded.
      expect(adminManagementRepositoryMock.markOffboarded).toHaveBeenCalled();
    });

    it('refuses to offboard yourself', async () => {
      await expect(
        buildService().offboardUser(DOCTOR_ID, { sub: DOCTOR_ID, email: 'x' }, ORIGIN),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(adminManagementRepositoryMock.markOffboarded).not.toHaveBeenCalled();
    });

    it('refuses a second offboarding of someone already in their window', async () => {
      adminManagementRepositoryMock.findUserForOffboarding.mockResolvedValue(
        buildDoctor({ offboardedAt: OFFBOARDED_AT }),
      );

      await expect(
        buildService().offboardUser(DOCTOR_ID, SUPER_ADMIN, ORIGIN),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('refuses a deactivated user — deactivation already locks them out', async () => {
      // §7.3.10.2. Offboarding them would turn a lockout back into a month
      // of access, and nothing here slows a clinic that needs someone out now.
      adminManagementRepositoryMock.findUserForOffboarding.mockResolvedValue(
        buildDoctor({ isActive: false }),
      );

      await expect(
        buildService().offboardUser(DOCTOR_ID, SUPER_ADMIN, ORIGIN),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(authRepositoryMock.revokeAllUserRefreshTokens).not.toHaveBeenCalled();
    });
  });

  describe('re-onboard', () => {
    it('clears the stamp, cancels the deletion, and audits', async () => {
      adminManagementRepositoryMock.findUserForOffboarding.mockResolvedValue(
        buildDoctor({ offboardedAt: OFFBOARDED_AT }),
      );

      const actual = await buildService().reonboardUser(DOCTOR_ID, SUPER_ADMIN, ORIGIN);

      expect(adminManagementRepositoryMock.clearOffboarded).toHaveBeenCalledWith(DOCTOR_ID);
      expect(vaultOffboardingServiceMock.purgeUnsharedDocuments).not.toHaveBeenCalled();
      expect(auditServiceMock.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'USER_REONBOARDED', resourceId: DOCTOR_ID }),
      );
      expect(actual.offboardedAt).toBeNull();
    });

    it('refuses for someone who is not being offboarded', async () => {
      await expect(
        buildService().reonboardUser(DOCTOR_ID, SUPER_ADMIN, ORIGIN),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('sweep', () => {
    const offboardedDoctor = {
      id: DOCTOR_ID,
      email: 'dr.maya@hms.test',
      isActive: true,
      offboardedAt: OFFBOARDED_AT,
      roleCodes: ['DOCTOR'],
    };

    it('does nothing while more than seven days remain', async () => {
      adminManagementRepositoryMock.listOffboardedUsers.mockResolvedValue([offboardedDoctor]);

      const actual = await buildService().sweepOnce(new Date('2026-09-10T03:00:00.000Z'));

      expect(actual).toBe(0);
      expect(adminManagementRepositoryMock.claimOffboardingNotice).not.toHaveBeenCalled();
      expect(mailServiceMock.sendMail).not.toHaveBeenCalled();
    });

    it('sends the seven-days-left email once', async () => {
      adminManagementRepositoryMock.listOffboardedUsers.mockResolvedValue([offboardedDoctor]);
      adminManagementRepositoryMock.claimOffboardingNotice
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);
      const service = buildService();
      const sevenDaysBefore = new Date('2026-09-27T03:00:00.000Z');

      const first = await service.sweepOnce(sevenDaysBefore);
      const second = await service.sweepOnce(sevenDaysBefore);

      expect(first).toBe(1);
      expect(second).toBe(0);
      expect(adminManagementRepositoryMock.claimOffboardingNotice).toHaveBeenCalledWith(
        DOCTOR_ID,
        7,
      );
      expect(mailServiceMock.sendMail).toHaveBeenCalledTimes(1);
      expect((mailServiceMock.sendMail.mock.calls[0] as [{ text: string }])[0].text).toContain(
        'tujuh hari lagi',
      );
      expect(vaultOffboardingServiceMock.purgeUnsharedDocuments).not.toHaveBeenCalled();
    });

    it('purges the unshared documents once when the window closes', async () => {
      adminManagementRepositoryMock.listOffboardedUsers.mockResolvedValue([offboardedDoctor]);
      adminManagementRepositoryMock.claimOffboardingNotice
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);
      const service = buildService();
      const deadlineDay = new Date('2026-10-04T01:00:00.000Z');

      const first = await service.sweepOnce(deadlineDay);
      const second = await service.sweepOnce(deadlineDay);

      expect(first).toBe(1);
      expect(second).toBe(0);
      expect(adminManagementRepositoryMock.claimOffboardingNotice).toHaveBeenCalledWith(
        DOCTOR_ID,
        0,
      );
      expect(vaultOffboardingServiceMock.purgeUnsharedDocuments).toHaveBeenCalledTimes(1);
      expect(vaultOffboardingServiceMock.purgeUnsharedDocuments).toHaveBeenCalledWith(
        DOCTOR_ID,
        deadlineDay,
      );
      expect(mailServiceMock.sendMail).not.toHaveBeenCalled();
    });

    it('still closes the window for a person deactivated mid-way', async () => {
      // The date they were promised arrives whether or not they can still
      // sign in; a deactivation is not a way to keep documents forever.
      adminManagementRepositoryMock.listOffboardedUsers.mockResolvedValue([
        { ...offboardedDoctor, isActive: false },
      ]);

      await buildService().sweepOnce(new Date('2026-10-10T01:00:00.000Z'));

      expect(vaultOffboardingServiceMock.purgeUnsharedDocuments).toHaveBeenCalledWith(
        DOCTOR_ID,
        expect.any(Date),
      );
    });
  });
});
