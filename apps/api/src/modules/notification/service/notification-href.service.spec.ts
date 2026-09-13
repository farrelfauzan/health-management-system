import { NotificationRepository } from '../repository/notification.repository';
import { NotificationHrefService } from './notification-href.service';

describe('NotificationHrefService', () => {
  const mockRepository = {
    findShellClaimsByUserId: jest.fn(),
  };
  const service = new NotificationHrefService(
    mockRepository as unknown as NotificationRepository,
  );
  const inputUserId = '4f1d2c3b-5a69-4e78-8b90-1c2d3e4f5a6b';
  const inputOrderId = 'c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e6f';
  const inputEncounterId = 'd4e5f6a7-b8c9-4d0e-8f1a-2b3c4d5e6f70';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('resolveShellForUser', () => {
    it('resolves the admin shell from the portal permission', async () => {
      mockRepository.findShellClaimsByUserId.mockResolvedValue({
        roleCodes: [],
        permissionKeys: ['portal.admin-access:any'],
      });
      const actualShell = await service.resolveShellForUser(inputUserId);
      expect(actualShell).toBe('admin');
    });

    it('resolves the doctor shell from the portal permission', async () => {
      mockRepository.findShellClaimsByUserId.mockResolvedValue({
        roleCodes: [],
        permissionKeys: ['portal.doctor-access:any'],
      });
      const actualShell = await service.resolveShellForUser(inputUserId);
      expect(actualShell).toBe('doctor');
    });

    it('falls back to role codes when the portal permissions are unseeded', async () => {
      mockRepository.findShellClaimsByUserId.mockResolvedValue({
        roleCodes: ['DOCTOR'],
        permissionKeys: [],
      });
      const actualShell = await service.resolveShellForUser(inputUserId);
      expect(actualShell).toBe('doctor');
    });

    // Mirrors `apps/web/proxy.ts`: the admin shell is a superset, so somebody
    // holding both must not be sent to a doctor path the proxy would bounce.
    it('prefers the admin shell when an account holds both', async () => {
      mockRepository.findShellClaimsByUserId.mockResolvedValue({
        roleCodes: ['DOCTOR', 'ADMIN'],
        permissionKeys: ['portal.doctor-access:any', 'portal.admin-access:any'],
      });
      const actualShell = await service.resolveShellForUser(inputUserId);
      expect(actualShell).toBe('admin');
    });

    // A technician holds `portal.admin-access:any` and belongs in the admin
    // shell, which is the only place their worklist exists.
    it('resolves a lab technician to the admin shell', async () => {
      mockRepository.findShellClaimsByUserId.mockResolvedValue({
        roleCodes: ['LAB_TECHNICIAN'],
        permissionKeys: ['portal.admin-access:any'],
      });
      const actualShell = await service.resolveShellForUser(inputUserId);
      expect(actualShell).toBe('admin');
    });

    it('returns null when the account cannot be resolved', async () => {
      mockRepository.findShellClaimsByUserId.mockResolvedValue(null);
      const actualShell = await service.resolveShellForUser(inputUserId);
      expect(actualShell).toBeNull();
    });
  });

  describe('buildVaultHref', () => {
    it('points a doctor at their own shell vault', async () => {
      mockRepository.findShellClaimsByUserId.mockResolvedValue({
        roleCodes: ['DOCTOR'],
        permissionKeys: [],
      });
      const actualHref = await service.buildVaultHref(inputUserId);
      expect(actualHref).toBe('/doctor/vault');
    });

    it('points an admin at the admin vault', async () => {
      mockRepository.findShellClaimsByUserId.mockResolvedValue({
        roleCodes: ['ADMIN'],
        permissionKeys: [],
      });
      const actualHref = await service.buildVaultHref(inputUserId);
      expect(actualHref).toBe('/admin/vault');
    });

    // Best-effort: an unresolvable recipient still gets a usable row rather
    // than an exception that would swallow the whole notification.
    it('falls back to the admin vault when the shell is unresolvable', async () => {
      mockRepository.findShellClaimsByUserId.mockResolvedValue(null);
      const actualHref = await service.buildVaultHref(inputUserId);
      expect(actualHref).toBe('/admin/vault');
    });

    it('never produces a shell-less vault path', async () => {
      mockRepository.findShellClaimsByUserId.mockResolvedValue({
        roleCodes: ['DOCTOR'],
        permissionKeys: [],
      });
      const actualHref = await service.buildVaultHref(inputUserId);
      expect(actualHref.startsWith('/vault')).toBe(false);
    });
  });

  describe('buildLabOrderHrefForUser', () => {
    it('deep-links a doctor into the encounter the order was raised on', async () => {
      mockRepository.findShellClaimsByUserId.mockResolvedValue({
        roleCodes: ['DOCTOR'],
        permissionKeys: [],
      });
      const actualHref = await service.buildLabOrderHrefForUser({
        userId: inputUserId,
        orderId: inputOrderId,
        encounterId: inputEncounterId,
      });
      expect(actualHref).toBe(`/doctor/encounters/${inputEncounterId}`);
    });

    // The reported bug: an admin recipient must never be handed a doctor path,
    // because `proxy.ts` answers that with a silent bounce to the dashboard.
    it('sends an admin recipient to the order page even when an encounter exists', async () => {
      mockRepository.findShellClaimsByUserId.mockResolvedValue({
        roleCodes: ['ADMIN'],
        permissionKeys: ['portal.admin-access:any'],
      });
      const actualHref = await service.buildLabOrderHrefForUser({
        userId: inputUserId,
        orderId: inputOrderId,
        encounterId: inputEncounterId,
      });
      expect(actualHref).toBe(`/admin/laboratory/${inputOrderId}`);
    });

    it('uses the order page when the order has no encounter', async () => {
      mockRepository.findShellClaimsByUserId.mockResolvedValue({
        roleCodes: ['DOCTOR'],
        permissionKeys: [],
      });
      const actualHref = await service.buildLabOrderHrefForUser({
        userId: inputUserId,
        orderId: inputOrderId,
        encounterId: null,
      });
      expect(actualHref).toBe(`/admin/laboratory/${inputOrderId}`);
    });

    it('does not read the recipient when there is no encounter to link to', async () => {
      await service.buildLabOrderHrefForUser({
        userId: inputUserId,
        orderId: inputOrderId,
        encounterId: null,
      });
      expect(mockRepository.findShellClaimsByUserId).not.toHaveBeenCalled();
    });
  });

  describe('buildAdminLabOrderHref', () => {
    it('builds the admin order path without a recipient lookup', () => {
      const actualHref = service.buildAdminLabOrderHref(inputOrderId);
      expect(actualHref).toBe(`/admin/laboratory/${inputOrderId}`);
    });
  });
});
