import { InviteeJoinedMessage, InviteeJoinedNotice, NotificationShell } from '@hms/shared-types';
import { Injectable, Logger } from '@nestjs/common';

import { NotificationHrefService } from '../../notification/service/notification-href.service';
import { NotificationService } from '../../notification/service/notification.service';
import { UserInvitationRepository } from '../repository/user-invitation.repository';

/**
 * Who administers clinicians: the key that edits any clinician profile.
 * Seeded to ADMIN, and SUPER_ADMIN holds it through its catalog-wide union.
 */
const CLINICIAN_ADMIN_PERMISSION_KEY = 'doctor.update:any';
/** Who administers staff accounts: the key that invites them. */
const STAFF_ADMIN_PERMISSION_KEY = 'user.create:any';
/**
 * Both targets exist in the admin shell only. A recipient in any other shell
 * still gets the row, without a link that would bounce them to their home.
 */
const ADMIN_CLINICIAN_PATH_PREFIX = '/admin/doctors/';
const ADMIN_STAFF_ACCOUNTS_HREF = '/admin/administration?tab=users';

/**
 * Tells the people who administer accounts that an invitation was accepted
 * (D-048). An invitation bound to a clinician profile announces a clinician
 * to whoever manages clinicians; any other announces a member of staff to
 * whoever invites staff. The person who just joined is never told about
 * themselves.
 */
@Injectable()
export class InviteeJoinedNotificationService {
  private readonly logger = new Logger(InviteeJoinedNotificationService.name);

  constructor(
    private readonly notificationService: NotificationService,
    private readonly notificationHrefService: NotificationHrefService,
    private readonly userInvitationRepository: UserInvitationRepository,
  ) {}

  /** Best-effort: a failed bell row must never undo an accepted invitation. */
  async notifyJoined(notice: InviteeJoinedNotice): Promise<number> {
    try {
      return await this.writeJoinedNotifications(notice);
    } catch (caughtError) {
      this.logger.warn(
        `Joined notification failed for user ${notice.userId}: ${
          caughtError instanceof Error ? caughtError.name : 'unknown'
        }`,
      );
      return 0;
    }
  }

  private async writeJoinedNotifications(notice: InviteeJoinedNotice): Promise<number> {
    const message = await this.buildMessage(notice);
    const holderIds = await this.notificationService.listUserIdsWithPermission(
      message.permissionKey,
    );
    const recipients = holderIds.filter((userId) => userId !== notice.userId);
    const recipientsByShell = await this.notificationHrefService.groupUserIdsByShell(recipients);
    let written = 0;
    for (const [shell, userIds] of recipientsByShell) {
      written += await this.notificationService.createForUsers(userIds, {
        type: message.type,
        titleKey: message.titleKey,
        bodyKey: message.bodyKey,
        params: message.params,
        href: this.resolveHref(shell, message.adminHref),
      });
    }
    return written;
  }

  private async buildMessage(notice: InviteeJoinedNotice): Promise<InviteeJoinedMessage> {
    if (notice.doctorProfileId !== null) {
      return {
        type: 'CLINICIAN_JOINED',
        titleKey: 'clinicianJoined.title',
        bodyKey: 'clinicianJoined.body',
        params: { clinicianName: notice.displayName, profession: notice.profession ?? 'DOCTOR' },
        permissionKey: CLINICIAN_ADMIN_PERMISSION_KEY,
        adminHref: `${ADMIN_CLINICIAN_PATH_PREFIX}${notice.doctorProfileId}`,
      };
    }
    const roleNameByCode = await this.userInvitationRepository.findRoleNamesByCodes([
      ...notice.roleCodes,
    ]);
    return {
      type: 'STAFF_JOINED',
      titleKey: 'staffJoined.title',
      bodyKey: 'staffJoined.body',
      params: {
        staffName: notice.displayName,
        roleNames: notice.roleCodes.map((code) => roleNameByCode.get(code) ?? code).join(', '),
      },
      permissionKey: STAFF_ADMIN_PERMISSION_KEY,
      adminHref: ADMIN_STAFF_ACCOUNTS_HREF,
    };
  }

  private resolveHref(shell: NotificationShell, adminHref: string): string | null {
    return shell === 'admin' ? adminHref : null;
  }
}
