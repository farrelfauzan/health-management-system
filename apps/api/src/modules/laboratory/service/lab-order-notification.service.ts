import { LabOrderRecord } from '@hms/shared-types';
import { Injectable, Logger } from '@nestjs/common';

import { NotificationHrefService } from '../../notification/service/notification-href.service';
import { NotificationService } from '../../notification/service/notification.service';
import { LabOrderRepository } from '../repository/lab-order.repository';

/**
 * The key the bench works under: collecting, receiving and rejecting
 * specimens. Seeded to LAB_TECHNICIAN and ADMIN; SUPER_ADMIN's catalog-wide
 * union stops short of it, because it is D-033 clinical content.
 */
const LAB_BENCH_PERMISSION_KEY = 'lab-specimen.write:any';

/**
 * Tells the bench a new order is waiting (D-048): everyone holding
 * `lab-specimen.write:any`, except whoever raised the order.
 *
 * Only for work this clinic's own lab runs. An order sent to an outside lab
 * never appears on the worklist (P18-T11), so a bell for it would point the
 * analis at nothing to do.
 */
@Injectable()
export class LabOrderNotificationService {
  private readonly logger = new Logger(LabOrderNotificationService.name);

  constructor(
    private readonly notificationService: NotificationService,
    private readonly notificationHrefService: NotificationHrefService,
    private readonly labOrderRepository: LabOrderRepository,
  ) {}

  /** Best-effort: a failed bell row must never undo an order that was written. */
  async notifyOrderCreated(order: LabOrderRecord, actorUserId: string): Promise<number> {
    if (order.fulfilmentSite !== 'INTERNAL') {
      return 0;
    }
    try {
      return await this.writeOrderCreatedNotifications(order, actorUserId);
    } catch (caughtError) {
      // The class only: the message can quote the row, which names the patient.
      this.logger.warn(
        `Lab order notification failed for order ${order.id}: ${
          caughtError instanceof Error ? caughtError.name : 'unknown'
        }`,
      );
      return 0;
    }
  }

  private async writeOrderCreatedNotifications(
    order: LabOrderRecord,
    actorUserId: string,
  ): Promise<number> {
    const benchUserIds = await this.notificationService.listUserIdsWithPermission(
      LAB_BENCH_PERMISSION_KEY,
    );
    const recipients = benchUserIds.filter((userId) => userId !== actorUserId);
    if (recipients.length === 0) {
      return 0;
    }
    const patientName = (await this.labOrderRepository.findLabOrderPatientName(order.id)) ?? '';
    const recipientsByShell = await this.notificationHrefService.groupUserIdsByShell(recipients);
    let written = 0;
    for (const [shell, userIds] of recipientsByShell) {
      written += await this.notificationService.createForUsers(userIds, {
        type: 'LAB_ORDER_CREATED',
        titleKey: 'labOrderCreated.title',
        bodyKey: 'labOrderCreated.body',
        params: {
          orderNumber: order.orderNumber,
          patientName,
          testCount: String(order.items.length),
          priority: order.priority,
        },
        href: this.notificationHrefService.buildLabOrderHrefForShell({
          shell,
          orderId: order.id,
          encounterId: order.encounterId,
        }),
      });
    }
    return written;
  }
}
