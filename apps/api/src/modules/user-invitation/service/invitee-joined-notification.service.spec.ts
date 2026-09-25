import { NotificationHrefService } from '../../notification/service/notification-href.service';
import { NotificationService } from '../../notification/service/notification.service';
import { UserInvitationRepository } from '../repository/user-invitation.repository';
import { InviteeJoinedNotificationService } from './invitee-joined-notification.service';

/**
 * D-048. An accepted invitation reaches whoever administers that kind of
 * account, never the person who joined, and links only where it can open.
 */
describe('InviteeJoinedNotificationService', () => {
  const notificationServiceMock = {
    listUserIdsWithPermission: jest.fn(),
    createForUsers: jest.fn(),
  };
  const hrefServiceMock = { groupUserIdsByShell: jest.fn() };
  const repositoryMock = { findRoleNamesByCodes: jest.fn() };
  const service = new InviteeJoinedNotificationService(
    notificationServiceMock as unknown as NotificationService,
    hrefServiceMock as unknown as NotificationHrefService,
    repositoryMock as unknown as UserInvitationRepository,
  );
  const inputClinicianNotice = {
    userId: 'new-midwife',
    displayName: 'Bd. Ratna Sari',
    doctorProfileId: 'doctor-profile-1',
    profession: 'MIDWIFE' as const,
    roleCodes: ['MIDWIFE'],
  };
  const inputStaffNotice = {
    userId: 'new-analyst',
    displayName: 'Dewi Lestari',
    doctorProfileId: null,
    profession: null,
    roleCodes: ['LAB_TECHNICIAN', 'PHARMACIST'],
  };

  beforeEach(() => {
    jest.resetAllMocks();
    notificationServiceMock.createForUsers.mockImplementation(
      async (userIds: string[]) => userIds.length,
    );
  });

  it('tells clinician administrators a clinician joined, linking their profile', async () => {
    notificationServiceMock.listUserIdsWithPermission.mockResolvedValue(['admin-1', 'super-1']);
    hrefServiceMock.groupUserIdsByShell.mockResolvedValue(new Map([['admin', ['admin-1', 'super-1']]]));

    const actualCount = await service.notifyJoined(inputClinicianNotice);

    expect(actualCount).toBe(2);
    expect(notificationServiceMock.listUserIdsWithPermission).toHaveBeenCalledWith(
      'doctor.update:any',
    );
    expect(notificationServiceMock.createForUsers).toHaveBeenCalledWith(['admin-1', 'super-1'], {
      type: 'CLINICIAN_JOINED',
      titleKey: 'clinicianJoined.title',
      bodyKey: 'clinicianJoined.body',
      params: { clinicianName: 'Bd. Ratna Sari', profession: 'MIDWIFE' },
      href: '/admin/doctors/doctor-profile-1',
    });
  });

  it('tells staff administrators a member of staff joined, naming their roles', async () => {
    notificationServiceMock.listUserIdsWithPermission.mockResolvedValue(['admin-1']);
    hrefServiceMock.groupUserIdsByShell.mockResolvedValue(new Map([['admin', ['admin-1']]]));
    repositoryMock.findRoleNamesByCodes.mockResolvedValue(
      new Map([
        ['LAB_TECHNICIAN', 'Lab Technician'],
        ['PHARMACIST', 'Pharmacist'],
      ]),
    );

    await service.notifyJoined(inputStaffNotice);

    expect(notificationServiceMock.listUserIdsWithPermission).toHaveBeenCalledWith(
      'user.create:any',
    );
    expect(notificationServiceMock.createForUsers).toHaveBeenCalledWith(['admin-1'], {
      type: 'STAFF_JOINED',
      titleKey: 'staffJoined.title',
      bodyKey: 'staffJoined.body',
      params: { staffName: 'Dewi Lestari', roleNames: 'Lab Technician, Pharmacist' },
      href: '/admin/administration?tab=users',
    });
  });

  it('never tells the person who joined about themselves', async () => {
    notificationServiceMock.listUserIdsWithPermission.mockResolvedValue(['admin-1', 'new-midwife']);
    hrefServiceMock.groupUserIdsByShell.mockResolvedValue(new Map());

    await service.notifyJoined(inputClinicianNotice);

    expect(hrefServiceMock.groupUserIdsByShell).toHaveBeenCalledWith(['admin-1']);
  });

  it('leaves the link off for a recipient outside the admin shell', async () => {
    notificationServiceMock.listUserIdsWithPermission.mockResolvedValue(['clinician-admin']);
    hrefServiceMock.groupUserIdsByShell.mockResolvedValue(new Map([['doctor', ['clinician-admin']]]));

    await service.notifyJoined(inputClinicianNotice);

    expect(notificationServiceMock.createForUsers).toHaveBeenCalledWith(
      ['clinician-admin'],
      expect.objectContaining({ href: null }),
    );
  });

  it('never throws: a failed bell row must not undo an accepted invitation', async () => {
    notificationServiceMock.listUserIdsWithPermission.mockRejectedValue(new Error('down'));

    await expect(service.notifyJoined(inputClinicianNotice)).resolves.toBe(0);
  });
});
