import { Injectable, Logger } from '@nestjs/common';

import {
  buildVisitReminderMessage,
  MaternalDueRecord,
  VisitReminderRecipientRecord,
} from '@hms/shared-types';

import { buildSafeErrorLog } from '../../../common/observability/safe-logging';
import { ClinicProfileService } from '../../billing/service/clinic-profile.service';
import { WhatsappGatewayService } from '../../channel-gateway/infrastructure/whatsapp-gateway.service';
import { DeliveryChannelGateService } from '../../document-delivery/service/delivery-channel-gate.service';
import { MaternalVisitDueService } from '../../maternal-care/service/maternal-visit-due.service';
import { VisitReminderConsentService } from '../../visit-reminder-consent/service/visit-reminder-consent.service';
import { MaternalVisitReminderRepository } from '../repository/maternal-visit-reminder.repository';

const UNKNOWN_FAILURE_REASON = 'UNKNOWN';

/**
 * One reminder sweep (P25-T17): every maternal visit due this week whose
 * patient has consented to reminders and has a WhatsApp number verified for
 * her gets exactly one short message.
 *
 * The order of the checks is the design:
 * 1. **Consent** first (`VISIT_REMINDER`, D-042) — never delivery consent.
 * 2. **The verified-number gate** the document pipeline uses, so the message
 *    goes to the chat that proved it is hers, and her STOP from that chat
 *    reaches the existing opt-out handler.
 * 3. **The claim** — an insert on the unique `(patient, visit key)` — only
 *    then, so a patient whose number is not yet verified keeps her reminder
 *    for the day it is, and a visit that was claimed is never sent twice.
 *
 * A failed send is recorded as `FAILED` and not retried: one attempt per
 * visit is the conservative reading of "at most one reminder".
 */
@Injectable()
export class MaternalVisitReminderService {
  private readonly logger = new Logger(MaternalVisitReminderService.name);

  constructor(
    private readonly maternalVisitDueService: MaternalVisitDueService,
    private readonly visitReminderConsentService: VisitReminderConsentService,
    private readonly deliveryChannelGateService: DeliveryChannelGateService,
    private readonly whatsappGateway: WhatsappGatewayService,
    private readonly clinicProfileService: ClinicProfileService,
    private readonly reminderRepository: MaternalVisitReminderRepository,
  ) {}

  /** Sends this week's reminders and returns how many messages went out. */
  async sendDueReminders(asOf: Date = new Date()): Promise<number> {
    const today = this.maternalVisitDueService.resolveClinicToday();
    const range = this.maternalVisitDueService.resolveRange({ from: today });
    // A window that has already closed is missed, not due: nobody is
    // reminded of a visit it is too late to make.
    const records = (await this.maternalVisitDueService.listDueForReminders(range)).filter(
      (record) => record.dueUntil >= today,
    );
    const recordsByPatient = groupByPatient(records);
    const recipients = await this.visitReminderConsentService.listConsentedRecipients([
      ...recordsByPatient.keys(),
    ]);
    if (recipients.length === 0) {
      return 0;
    }
    const clinicName = await this.clinicProfileService.getClinicName();
    let sentCount = 0;
    for (const recipient of recipients) {
      const patientRecords = recordsByPatient.get(recipient.id) ?? [];
      if (await this.remindPatient({ records: patientRecords, recipient, clinicName, asOf })) {
        sentCount += 1;
      }
    }
    return sentCount;
  }

  /**
   * One message per patient per sweep, however many of her visits fell due:
   * a mother whose KF2 and whose baby's KN2 open the same day hears about
   * both at once. Each visit is still claimed on its own key, so a visit
   * reminded today is never part of tomorrow's message.
   */
  private async remindPatient(params: {
    records: readonly MaternalDueRecord[];
    recipient: VisitReminderRecipientRecord;
    clinicName: string;
    asOf: Date;
  }): Promise<boolean> {
    const externalChatId = await this.resolveVerifiedChatId(params.recipient);
    if (externalChatId === null) {
      return false;
    }
    const claimed = await this.claimUnreminded(params.records, params.asOf);
    if (claimed.length === 0) {
      return false;
    }
    const claimIds = claimed.map((entry) => entry.claimId);
    try {
      await this.whatsappGateway.sendText({
        externalChatId,
        text: buildVisitReminderMessage({
          clinicName: params.clinicName,
          visits: claimed.map((entry) => entry.record),
        }),
      });
      await this.reminderRepository.markSent(claimIds, new Date());
      return true;
    } catch (caughtError) {
      const reason = caughtError instanceof Error ? caughtError.name : UNKNOWN_FAILURE_REASON;
      await this.reminderRepository.markFailed(claimIds, reason);
      // No chat id, no name: the count and the reason are enough to look.
      this.logger.error(
        buildSafeErrorLog('maternal_visit_reminder_send_failed', {
          claimCount: claimIds.length,
          reason,
        }),
      );
      return false;
    }
  }

  private async claimUnreminded(
    records: readonly MaternalDueRecord[],
    asOf: Date,
  ): Promise<{ claimId: string; record: MaternalDueRecord }[]> {
    const claimed: { claimId: string; record: MaternalDueRecord }[] = [];
    for (const record of records) {
      const claim = await this.reminderRepository.claim({
        patientId: record.patientId,
        visitKey: record.visitKey,
        source: record.source,
        dueFrom: new Date(`${record.dueFrom}T00:00:00.000Z`),
        attemptedAt: asOf,
      });
      if (claim !== null) {
        claimed.push({ claimId: claim.id, record });
      }
    }
    return claimed;
  }

  /** A typed number is not enough; the chat that proved it is hers is. */
  private async resolveVerifiedChatId(
    recipient: VisitReminderRecipientRecord,
  ): Promise<string | null> {
    if (recipient.phoneNumber.trim() === '') {
      return null;
    }
    const gate = await this.deliveryChannelGateService.resolveWhatsappGate(recipient);
    return gate.isAllowed && gate.link !== null ? gate.link.externalChatId : null;
  }
}

function groupByPatient(records: readonly MaternalDueRecord[]): Map<string, MaternalDueRecord[]> {
  const grouped = new Map<string, MaternalDueRecord[]>();
  for (const record of records) {
    grouped.set(record.patientId, [...(grouped.get(record.patientId) ?? []), record]);
  }
  return grouped;
}
