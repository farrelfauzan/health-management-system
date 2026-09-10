import { Module, forwardRef } from '@nestjs/common';

import { AdminManagementModule } from '../admin-management/admin-management.module';
import { AuthModule } from '../auth/auth.module';
import { UserInvitationAdminController } from './controller/user-invitation-admin.controller';
import { UserInvitationPublicController } from './controller/user-invitation-public.controller';
import { UserInvitationRepository } from './repository/user-invitation.repository';
import { UserInvitationService } from './service/user-invitation.service';

@Module({
  // `forwardRef` since P19-T15: this module is now also reached from
  // `DoctorManagementModule`, which sits inside a loop back to
  // `AdminManagementModule`, so the plain import would be evaluated mid-cycle.
  imports: [forwardRef(() => AdminManagementModule), AuthModule],
  controllers: [UserInvitationAdminController, UserInvitationPublicController],
  providers: [UserInvitationService, UserInvitationRepository],
  exports: [UserInvitationService],
})
export class UserInvitationModule {}
