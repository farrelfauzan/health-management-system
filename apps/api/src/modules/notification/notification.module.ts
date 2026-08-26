import { Module } from '@nestjs/common';

import { NotificationController } from './controller/notification.controller';
import { NotificationRepository } from './repository/notification.repository';
import { NotificationService } from './service/notification.service';

/**
 * The in-app notification feed (IMP-21). Exports the service because domain
 * modules are the producers: appointment approval/rejection and the CS
 * handoff call `NotificationService.createForUser(...)` directly — polling on
 * the client is the delivery mechanism, so no event bus sits in between.
 */
@Module({
  controllers: [NotificationController],
  providers: [NotificationRepository, NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
