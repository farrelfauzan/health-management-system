import { Module } from '@nestjs/common';

import { PrivacyNoticeModule } from '../../common/privacy-notice/privacy-notice.module';
import { AuthModule } from '../auth/auth.module';
import { PatientManagementModule } from '../patient-management/patient-management.module';
import { PatientVisitReminderConsentController } from './controller/patient-visit-reminder-consent.controller';
import { PatientVisitReminderConsentRepository } from './repository/patient-visit-reminder-consent.repository';
import { VisitReminderConsentService } from './service/visit-reminder-consent.service';

/**
 * Consent to WhatsApp visit reminders (P25-T17, D-042), on its own table and
 * in its own module.
 *
 * Separate from the reminder worker so the dependency graph stays a line:
 * `DocumentDeliveryModule` imports this to honour STOP / BERHENTI through the
 * one inbound opt-out handler, and the reminder module imports both — neither
 * of them has to import the other.
 */
@Module({
  imports: [AuthModule, PrivacyNoticeModule, PatientManagementModule],
  controllers: [PatientVisitReminderConsentController],
  providers: [PatientVisitReminderConsentRepository, VisitReminderConsentService],
  exports: [VisitReminderConsentService],
})
export class VisitReminderConsentModule {}
