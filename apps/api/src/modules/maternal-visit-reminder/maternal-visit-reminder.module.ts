import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { ChannelGatewayModule } from '../channel-gateway/channel-gateway.module';
import { DocumentDeliveryModule } from '../document-delivery/document-delivery.module';
import { MaternalCareModule } from '../maternal-care/maternal-care.module';
import { VisitReminderConsentModule } from '../visit-reminder-consent/visit-reminder-consent.module';
import { MaternalVisitDueController } from './controller/maternal-visit-due.controller';
import { MaternalVisitReminderRepository } from './repository/maternal-visit-reminder.repository';
import { MaternalVisitReminderService } from './service/maternal-visit-reminder.service';
import { MaternalVisitReminderWorker } from './service/maternal-visit-reminder.worker';
import { MaternalVisitWorklistService } from './service/maternal-visit-worklist.service';

/**
 * The due-this-week worklist and its consented WhatsApp reminders (P25-T17).
 *
 * It owns two things — the reminder rows and the sweep — and borrows the
 * rest through services: the due list from maternal care, the consent from
 * its own module (D-042), the verified-number gate from document delivery,
 * the transport from the channel gateway, the clinic's name from billing.
 * Nothing imports this module, so none of those edges can close a cycle.
 */
@Module({
  imports: [
    AuthModule,
    BillingModule,
    ChannelGatewayModule,
    DocumentDeliveryModule,
    MaternalCareModule,
    VisitReminderConsentModule,
  ],
  controllers: [MaternalVisitDueController],
  providers: [
    MaternalVisitReminderRepository,
    MaternalVisitReminderService,
    MaternalVisitReminderWorker,
    MaternalVisitWorklistService,
  ],
})
export class MaternalVisitReminderModule {}
