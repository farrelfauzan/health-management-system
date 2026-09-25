import { PatientAssignedNotice } from '@hms/shared-types';
import { Injectable, Logger } from '@nestjs/common';

import { NotificationHrefService } from '../../notification/service/notification-href.service';
import { NotificationService } from '../../notification/service/notification.service';
import { DoctorPatientRepository } from '../repository/doctor-patient.repository';

/**
 * Tells a clinician a patient was put on their care team (D-048), whichever
 * way the assignment was made: the assignment screen, a patient registered
 * with `doctorIds`, or a booking that put the doctor on the team.
 *
 * Each row links to the patient in the recipient's own shell. A clinician
 * with no account is skipped, and so is whoever made the assignment.
 */
@Injectable()
export class PatientAssignmentNotificationService {
  private readonly logger = new Logger(PatientAssignmentNotificationService.name);

  constructor(
    private readonly notificationService: NotificationService,
    private readonly notificationHrefService: NotificationHrefService,
    private readonly doctorPatientRepository: DoctorPatientRepository,
  ) {}

  /** Best-effort: a failed bell row must never undo an assignment. */
  async notifyAssigned(notice: PatientAssignedNotice): Promise<number> {
    if (notice.doctorIds.length === 0) {
      return 0;
    }
    try {
      return await this.writeAssignedNotifications(notice);
    } catch (caughtError) {
      this.logger.warn(
        `Assignment notification failed for patient ${notice.patientId}: ${
          caughtError instanceof Error ? caughtError.name : 'unknown'
        }`,
      );
      return 0;
    }
  }

  private async writeAssignedNotifications(notice: PatientAssignedNotice): Promise<number> {
    const accounts = await this.doctorPatientRepository.findActiveClinicianAccounts(
      notice.doctorIds,
    );
    const recipients = accounts
      .map((account) => account.ownerUserId)
      .filter((userId): userId is string => userId !== null && userId !== notice.actorUserId);
    const recipientsByShell = await this.notificationHrefService.groupUserIdsByShell(recipients);
    let written = 0;
    for (const [shell, userIds] of recipientsByShell) {
      written += await this.notificationService.createForUsers(userIds, {
        type: 'PATIENT_ASSIGNED',
        titleKey: 'patientAssigned.title',
        bodyKey: 'patientAssigned.body',
        params: { patientName: notice.patientName },
        href: this.notificationHrefService.buildPatientHref(shell, notice.patientId),
      });
    }
    return written;
  }
}
