import { NotificationHrefService } from '../../notification/service/notification-href.service';
import { NotificationService } from '../../notification/service/notification.service';
import { ShkRecallNotificationService } from './shk-recall-notification.service';

/**
 * P25-T10. A recall reaches each clinician once, in the shell they can open.
 */
describe('ShkRecallNotificationService (P25-T10)', () => {
  const notificationServiceMock = {
    listUserIdsWithPermission: jest.fn(),
    createForUsers: jest.fn(),
  };
  const hrefServiceMock = { resolveShellForUser: jest.fn() };
  const service = new ShkRecallNotificationService(
    notificationServiceMock as unknown as NotificationService,
    hrefServiceMock as unknown as NotificationHrefService,
  );
  const inputNotice = {
    attendantUserId: 'midwife-1',
    motherPatientId: 'mother-1',
    motherName: 'Rina',
    sequence: 2,
  };

  beforeEach(() => {
    jest.resetAllMocks();
    notificationServiceMock.createForUsers.mockImplementation(
      async (userIds: string[]) => userIds.length,
    );
  });

  it('asks for encounter.write:own holders, never the :any key', async () => {
    notificationServiceMock.listUserIdsWithPermission.mockResolvedValue([]);
    hrefServiceMock.resolveShellForUser.mockResolvedValue('doctor');

    await service.notifyRecall(inputNotice);

    expect(notificationServiceMock.listUserIdsWithPermission).toHaveBeenCalledWith(
      'encounter.write:own',
    );
  });

  it('tells the attendant once when she is also a clinician', async () => {
    notificationServiceMock.listUserIdsWithPermission.mockResolvedValue(['midwife-1', 'doctor-2']);
    hrefServiceMock.resolveShellForUser.mockResolvedValue('doctor');

    const actualCount = await service.notifyRecall(inputNotice);

    expect(actualCount).toBe(2);
    expect(notificationServiceMock.createForUsers).toHaveBeenCalledTimes(1);
    expect(notificationServiceMock.createForUsers).toHaveBeenCalledWith(
      ['midwife-1', 'doctor-2'],
      {
        type: 'SHK_RECALL',
        titleKey: 'shkRecall.title',
        bodyKey: 'shkRecall.body',
        params: { motherName: 'Rina', sequence: '2' },
        href: '/doctor/patients/mother-1?tab=pregnancy',
      },
    );
  });

  it('skips an attendant whose account no longer resolves', async () => {
    notificationServiceMock.listUserIdsWithPermission.mockResolvedValue(['doctor-2']);
    hrefServiceMock.resolveShellForUser.mockImplementation(async (userId: string) =>
      userId === 'midwife-1' ? null : 'doctor',
    );

    await service.notifyRecall(inputNotice);

    expect(notificationServiceMock.createForUsers).toHaveBeenCalledWith(
      ['doctor-2'],
      expect.anything(),
    );
  });

  it('never throws: a failed bell row must not undo a recorded result', async () => {
    notificationServiceMock.listUserIdsWithPermission.mockRejectedValue(new Error('down'));

    await expect(service.notifyRecall(inputNotice)).resolves.toBe(0);
  });
});
