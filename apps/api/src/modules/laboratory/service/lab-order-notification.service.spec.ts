import { LabOrderRecord } from '@hms/shared-types';

import { NotificationHrefService } from '../../notification/service/notification-href.service';
import { NotificationService } from '../../notification/service/notification.service';
import { LabOrderRepository } from '../repository/lab-order.repository';
import { LabOrderNotificationService } from './lab-order-notification.service';

/**
 * D-048. A new in-house order reaches everyone who works the bench, in the
 * shell each of them can open, and never the person who raised it.
 */
describe('LabOrderNotificationService', () => {
  const notificationServiceMock = {
    listUserIdsWithPermission: jest.fn(),
    createForUsers: jest.fn(),
  };
  const hrefServiceMock = {
    groupUserIdsByShell: jest.fn(),
    buildLabOrderHrefForShell: jest.fn(),
  };
  const labOrderRepositoryMock = { findLabOrderPatientName: jest.fn() };
  const service = new LabOrderNotificationService(
    notificationServiceMock as unknown as NotificationService,
    hrefServiceMock as unknown as NotificationHrefService,
    labOrderRepositoryMock as unknown as LabOrderRepository,
  );
  const inputOrder = {
    id: 'order-1',
    orderNumber: 'LAB/20260925/0001',
    encounterId: 'encounter-1',
    priority: 'URGENT',
    fulfilmentSite: 'INTERNAL',
    items: [{ id: 'item-1' }, { id: 'item-2' }],
  } as unknown as LabOrderRecord;

  beforeEach(() => {
    jest.resetAllMocks();
    notificationServiceMock.createForUsers.mockImplementation(
      async (userIds: string[]) => userIds.length,
    );
    labOrderRepositoryMock.findLabOrderPatientName.mockResolvedValue('Siti Aminah');
    hrefServiceMock.buildLabOrderHrefForShell.mockImplementation(
      (params: { shell: string; orderId: string }) => `/${params.shell}/laboratory/${params.orderId}`,
    );
  });

  it('asks for the bench key, lab-specimen.write:any', async () => {
    notificationServiceMock.listUserIdsWithPermission.mockResolvedValue([]);

    await service.notifyOrderCreated(inputOrder, 'doctor-user');

    expect(notificationServiceMock.listUserIdsWithPermission).toHaveBeenCalledWith(
      'lab-specimen.write:any',
    );
  });

  it('tells every bench holder but the actor, with the order, patient, count and priority', async () => {
    notificationServiceMock.listUserIdsWithPermission.mockResolvedValue([
      'analyst-1',
      'admin-1',
      'admin-actor',
    ]);
    hrefServiceMock.groupUserIdsByShell.mockResolvedValue(
      new Map([['admin', ['analyst-1', 'admin-1']]]),
    );

    const actualCount = await service.notifyOrderCreated(inputOrder, 'admin-actor');

    expect(actualCount).toBe(2);
    expect(hrefServiceMock.groupUserIdsByShell).toHaveBeenCalledWith(['analyst-1', 'admin-1']);
    expect(notificationServiceMock.createForUsers).toHaveBeenCalledWith(['analyst-1', 'admin-1'], {
      type: 'LAB_ORDER_CREATED',
      titleKey: 'labOrderCreated.title',
      bodyKey: 'labOrderCreated.body',
      params: {
        orderNumber: 'LAB/20260925/0001',
        patientName: 'Siti Aminah',
        testCount: '2',
        priority: 'URGENT',
      },
      href: '/admin/laboratory/order-1',
    });
  });

  it('writes one batch per shell, each with its own link', async () => {
    notificationServiceMock.listUserIdsWithPermission.mockResolvedValue(['analyst-1', 'clinician-1']);
    hrefServiceMock.groupUserIdsByShell.mockResolvedValue(
      new Map([
        ['admin', ['analyst-1']],
        ['doctor', ['clinician-1']],
      ]),
    );

    await service.notifyOrderCreated(inputOrder, 'doctor-user');

    expect(hrefServiceMock.buildLabOrderHrefForShell).toHaveBeenCalledWith({
      shell: 'doctor',
      orderId: 'order-1',
      encounterId: 'encounter-1',
    });
    expect(notificationServiceMock.createForUsers).toHaveBeenCalledTimes(2);
  });

  it('writes nothing when the actor is the only bench holder', async () => {
    notificationServiceMock.listUserIdsWithPermission.mockResolvedValue(['analyst-1']);

    const actualCount = await service.notifyOrderCreated(inputOrder, 'analyst-1');

    expect(actualCount).toBe(0);
    expect(notificationServiceMock.createForUsers).not.toHaveBeenCalled();
  });

  it('stays silent for an order sent to an outside lab, which never reaches the worklist', async () => {
    const inputExternalOrder = { ...inputOrder, fulfilmentSite: 'EXTERNAL' } as LabOrderRecord;

    const actualCount = await service.notifyOrderCreated(inputExternalOrder, 'doctor-user');

    expect(actualCount).toBe(0);
    expect(notificationServiceMock.listUserIdsWithPermission).not.toHaveBeenCalled();
  });

  it('never throws: a failed bell row must not undo a written order', async () => {
    notificationServiceMock.listUserIdsWithPermission.mockRejectedValue(new Error('down'));

    await expect(service.notifyOrderCreated(inputOrder, 'doctor-user')).resolves.toBe(0);
  });
});
