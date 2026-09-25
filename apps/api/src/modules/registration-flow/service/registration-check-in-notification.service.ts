import { PatientCheckedInNotice } from '@hms/shared-types';
import { Injectable, Logger } from '@nestjs/common';

import { NotificationHrefService } from '../../notification/service/notification-href.service';
import { NotificationService } from '../../notification/service/notification.service';
import { RegistrationFlowRepository } from '../repository/registration-flow.repository';

/**
 * Tells a clinician their patient has arrived (D-048): addressed to the
 * account behind the clinician the visit is booked with, and to nobody else.
 *
 * A clinician who checks their own patient in is not told, and neither is one
 * without an account — a profile created before accounts were required has
 * nobody signing in to read the row.
 */
@Injectable()
export class RegistrationCheckInNotificationService {
  private readonly logger = new Logger(RegistrationCheckInNotificationService.name);

  constructor(
    private readonly notificationService: NotificationService,
    private readonly notificationHrefService: NotificationHrefService,
    private readonly registrationFlowRepository: RegistrationFlowRepository,
  ) {}

  /** Best-effort: a failed bell row must never undo a check-in. */
  async notifyCheckedIn(notice: PatientCheckedInNotice): Promise<number> {
    try {
      return await this.writeCheckedInNotification(notice);
    } catch (caughtError) {
      this.logger.warn(
        `Check-in notification failed for registration ${notice.registrationId}: ${
          caughtError instanceof Error ? caughtError.name : 'unknown'
        }`,
      );
      return 0;
    }
  }

  private async writeCheckedInNotification(notice: PatientCheckedInNotice): Promise<number> {
    const clinicianUserId = await this.registrationFlowRepository.findActiveClinicianUserId(
      notice.doctorId,
    );
    if (clinicianUserId === null || clinicianUserId === notice.actorUserId) {
      return 0;
    }
    const shell = await this.notificationHrefService.resolveShellForUser(clinicianUserId);
    if (shell === null) {
      return 0;
    }
    await this.notificationService.createForUser({
      userId: clinicianUserId,
      type: 'PATIENT_CHECKED_IN',
      titleKey: 'patientCheckedIn.title',
      bodyKey: 'patientCheckedIn.body',
      params: { patientName: notice.patientName, poliName: notice.poliName },
      href: this.notificationHrefService.buildCheckInQueueHref(shell, notice.queueDate),
    });
    return 1;
  }
}
