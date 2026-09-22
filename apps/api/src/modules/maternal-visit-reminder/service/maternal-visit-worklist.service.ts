import { Injectable } from '@nestjs/common';

import {
  ListMaternalVisitsDueQuery,
  MaternalVisitDueItem,
  MaternalVisitReminderRecord,
  MaternalVisitsDueResponse,
} from '@hms/shared-types';

import { CurrentUser } from '../../../common/auth/current-user.type';
import { MaternalVisitDueService } from '../../maternal-care/service/maternal-visit-due.service';
import { VisitReminderConsentService } from '../../visit-reminder-consent/service/visit-reminder-consent.service';
import { MaternalVisitReminderRepository } from '../repository/maternal-visit-reminder.repository';

/**
 * The "Jatuh tempo minggu ini" worklist (P25-T17): the due list the
 * maternal-care services answer, with two facts only this module knows —
 * whether the patient consented to reminders, and whether one went out.
 *
 * A patient without consent is on the list like everyone else; she simply
 * shows no reminder. The list is for the midwife to act on, and the reminder
 * is only ever a nudge on top of it.
 */
@Injectable()
export class MaternalVisitWorklistService {
  constructor(
    private readonly maternalVisitDueService: MaternalVisitDueService,
    private readonly visitReminderConsentService: VisitReminderConsentService,
    private readonly reminderRepository: MaternalVisitReminderRepository,
  ) {}

  async listDue(
    query: ListMaternalVisitsDueQuery,
    currentUser: CurrentUser,
  ): Promise<MaternalVisitsDueResponse> {
    const range = this.maternalVisitDueService.resolveRange(query);
    const records = await this.maternalVisitDueService.listDue(range, currentUser);
    const consentedPatientIds = new Set(
      await this.visitReminderConsentService.listConsentedPatientIds([
        ...new Set(records.map((record) => record.patientId)),
      ]),
    );
    const reminders = await this.reminderRepository.listByVisitKeys(
      records.map((record) => record.visitKey),
    );
    const reminderByKey = new Map(
      reminders.map((reminder) => [buildReminderLookupKey(reminder), reminder]),
    );
    const items: MaternalVisitDueItem[] = records.map((record) => {
      const reminder = reminderByKey.get(buildReminderLookupKey(record));
      return {
        ...record,
        hasReminderConsent: consentedPatientIds.has(record.patientId),
        reminder:
          reminder === undefined || reminder.status === 'PENDING'
            ? null
            : { status: reminder.status, attemptedAt: reminder.attemptedAt.toISOString() },
      };
    });
    return { from: range.from, to: range.to, items };
  }
}

function buildReminderLookupKey(
  entry: Pick<MaternalVisitReminderRecord, 'patientId' | 'visitKey'>,
): string {
  return `${entry.patientId}|${entry.visitKey}`;
}
