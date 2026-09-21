import { ShkRecallNotice } from '@hms/shared-types';
import { Injectable, Logger } from '@nestjs/common';

import { NotificationHrefService } from '../../notification/service/notification-href.service';
import { NotificationService } from '../../notification/service/notification.service';

/**
 * `encounter.write:own` is the clinicians' key (DOCTOR and MIDWIFE). Not
 * `encounter.write:any`, which is ADMIN's today and which D-033 revokes: a
 * recall is clinical content and is announced to the people who examine.
 */
const CLINICIAN_PERMISSION_KEY = 'encounter.write:own';

/**
 * Announces an SHK recall (P25-T10): to the delivery's attendant, when her
 * account exists, and to every clinician — each person once, however many of
 * those routes reach them.
 *
 * The href is written per recipient, because the newborn card lives on the
 * mother's pregnancy tab and `/admin/*` and `/doctor/*` are separate shells;
 * a path into the wrong one silently bounces to the dashboard. Keys are
 * relative to the bell feed's namespace.
 */
@Injectable()
export class ShkRecallNotificationService {
  private readonly logger = new Logger(ShkRecallNotificationService.name);

  constructor(
    private readonly notificationService: NotificationService,
    private readonly notificationHrefService: NotificationHrefService,
  ) {}

  /** Best-effort: a failed bell row must never undo a recorded result. */
  async notifyRecall(notice: ShkRecallNotice): Promise<number> {
    try {
      return await this.writeRecallNotifications(notice);
    } catch {
      this.logger.error('shk_recall_notification_failed');
      return 0;
    }
  }

  private async writeRecallNotifications(notice: ShkRecallNotice): Promise<number> {
    const clinicianIds = await this.notificationService.listUserIdsWithPermission(
      CLINICIAN_PERMISSION_KEY,
    );
    const candidates = [notice.attendantUserId, ...clinicianIds].filter(
      (userId): userId is string => userId !== null,
    );
    const recipientsByHref = await this.groupRecipientsByHref(
      Array.from(new Set(candidates)),
      notice.motherPatientId,
    );
    let written = 0;
    for (const [href, userIds] of recipientsByHref) {
      written += await this.notificationService.createForUsers(userIds, {
        type: 'SHK_RECALL',
        titleKey: 'shkRecall.title',
        bodyKey: 'shkRecall.body',
        params: { motherName: notice.motherName, sequence: String(notice.sequence) },
        href,
      });
    }
    return written;
  }

  /**
   * An account that no longer resolves — deactivated, or a profile whose
   * owner was removed — gets no row: there is nobody to read it.
   */
  private async groupRecipientsByHref(
    userIds: string[],
    motherPatientId: string,
  ): Promise<Map<string, string[]>> {
    const grouped = new Map<string, string[]>();
    for (const userId of userIds) {
      const shell = await this.notificationHrefService.resolveShellForUser(userId);
      if (shell === null) {
        continue;
      }
      const href = `/${shell}/patients/${motherPatientId}?tab=pregnancy`;
      grouped.set(href, [...(grouped.get(href) ?? []), userId]);
    }
    return grouped;
  }
}
