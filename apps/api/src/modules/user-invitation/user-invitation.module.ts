import { Module, forwardRef } from '@nestjs/common';

import { AdminManagementModule } from '../admin-management/admin-management.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationModule } from '../notification/notification.module';
import { UserInvitationAdminController } from './controller/user-invitation-admin.controller';
import { UserInvitationPublicController } from './controller/user-invitation-public.controller';
import { UserInvitationRepository } from './repository/user-invitation.repository';
import { InviteeJoinedNotificationService } from './service/invitee-joined-notification.service';
import { UserInvitationService } from './service/user-invitation.service';

@Module({
  // `forwardRef` since P19-T15: this module is now also reached from
  // `DoctorManagementModule`, which sits inside a loop back to
  // `AdminManagementModule`, so the plain import would be evaluated mid-cycle.
  imports: [forwardRef(() => AdminManagementModule), AuthModule, NotificationModule],
  controllers: [UserInvitationAdminController, UserInvitationPublicController],
  providers: [InviteeJoinedNotificationService, UserInvitationService, UserInvitationRepository],
  exports: [UserInvitationService],
})
export class UserInvitationModule {}
